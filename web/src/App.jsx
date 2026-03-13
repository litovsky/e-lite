import { useEffect, useMemo, useState, useCallback, useRef } from "react";

import seedGraph from "./data/graph.json";
import views from "./data/views.json";

import AuthPanel from "./components/AuthPanel";
import PushupsForm from "./components/PushupsForm";
import PushupsStats from "./components/PushupsStats";
import ExerciseDashboard from "./components/ExerciseDashboard";

import ForceGraphCanvas from "./graph/ForceGraphCanvas";

import { loadLearnedSet, saveLearnedSet } from "./storage/learnedStore";
import { computeGraphState } from "./graph/computeGraphState";
import { validateOntology } from "./graph/ontology";

import { supabase } from "./supabaseClient";

export default function App() {
  const [user, setUser] = useState(null);
  const userId = user?.id || "guest";

  const [selectedNode, setSelectedNode] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /* ================= USER STATE (learned) ================= */

  const [learned, setLearned] = useState(() => loadLearnedSet());

  // guest → localStorage
  useEffect(() => {
    if (!user?.id) saveLearnedSet(learned);
  }, [learned, user?.id]);

  // auth → Supabase (initial load)
  const loadLearnedFromDb = useCallback(async () => {
    if (!user?.id) {
      setLearned(loadLearnedSet());
      return;
    }

    const { data, error } = await supabase
      .from("user_node_state")
      .select("node_id")
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to load user_node_state:", error.message);
      return;
    }

    setLearned(new Set((data || []).map((x) => x.node_id)));
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadLearnedFromDb();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLearnedFromDb]);

  /* ================= ONTOLOGY CANON (Supabase → base graph) ================= */

  const [canonGraph, setCanonGraph] = useState(null); // {nodes, edges} or null
  const [canonLoading, setCanonLoading] = useState(false);
  const [canonErr, setCanonErr] = useState("");

  const loadCanonGraph = useCallback(async () => {
    setCanonErr("");
    setCanonLoading(true);

    const { data: nData, error: nErr } = await supabase
      .from("ontology_nodes")
      .select("id,label,kind,domain,description")
      .limit(2000);

    if (nErr) {
      setCanonLoading(false);
      setCanonErr(nErr.message);
      setCanonGraph(null);
      return;
    }

    const { data: eData, error: eErr } = await supabase
      .from("ontology_edges")
      .select("id,source_id,target_id,rel")
      .limit(4000);

    setCanonLoading(false);

    if (eErr) {
      setCanonErr(eErr.message);
      setCanonGraph(null);
      return;
    }

    const nodes = (nData || []).map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind ?? "skill",
      domain: n.domain ?? undefined,
      description: n.description ?? undefined,
    }));

    const edges = (eData || []).map((e) => ({
      id: e.id || `edge:${e.source_id}->${e.target_id}:${e.rel || "part_of"}`,
      source: e.source_id,
      target: e.target_id,
      rel: e.rel || "part_of",
      isCanon: true,
    }));

    if (nodes.length === 0) {
      setCanonGraph(null);
      return;
    }

    setCanonGraph({ nodes, edges });
  }, []);

  useEffect(() => {
    loadCanonGraph();
  }, [loadCanonGraph]);

  /* ================= ACCEPTED OVERLAY (node_proposals accepted) =================
     Временно, пока accepted не переливается в ontology_*.
  */

  const [acceptedOverlay, setAcceptedOverlay] = useState({ nodes: [], edges: [] });

  const loadAcceptedOverlay = useCallback(async () => {
    const { data, error } = await supabase
      .from("node_proposals")
      .select("id,label,kind,domain,description,status,bind_source_id,bind_rel,created_at")
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error("Failed to load accepted proposals:", error.message);
      return;
    }

    const acc = data || [];
    const nodes = [];
    const edges = [];

    for (const p of acc) {
      const nodeId = `p:${p.id}`;

      nodes.push({
        id: nodeId,
        label: p.label,
        kind: p.kind || "skill",
        status: "unlocked",
        domain: p.domain || undefined,
        description: p.description || undefined,
        isProposal: true,
        proposalId: p.id,
      });

      if (p.bind_source_id) {
        edges.push({
          id: `edge:${p.bind_source_id}->${nodeId}`,
          source: p.bind_source_id,
          target: nodeId,
          rel: p.bind_rel || "part_of",
          isProposal: true,
          proposalId: p.id,
        });
      }
    }

    setAcceptedOverlay({ nodes, edges });
  }, []);

  useEffect(() => {
    loadAcceptedOverlay();
  }, [loadAcceptedOverlay, user?.id]);

  /* ================= REALTIME: subscriptions ================= */

  // чтобы не спамить reload при пачке событий
  const reloadTimerRef = useRef(null);
  const scheduleReload = useCallback((fn, delay = 250) => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      fn?.();
    }, delay);
  }, []);

  useEffect(() => {
    // 1) ontology changes → reload canon
    const ch1 = supabase
      .channel("rt-ontology")
      .on("postgres_changes", { event: "*", schema: "public", table: "ontology_nodes" }, () => {
        scheduleReload(loadCanonGraph);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ontology_edges" }, () => {
        scheduleReload(loadCanonGraph);
      })
      .subscribe();

    // 2) accepted proposals changes → reload accepted overlay
    const ch2 = supabase
      .channel("rt-proposals")
      .on("postgres_changes", { event: "*", schema: "public", table: "node_proposals" }, () => {
        scheduleReload(loadAcceptedOverlay);
        // если у тебя proposals-list тоже открыт — он сам обновится кнопкой/фильтром,
        // но можно при желании тоже дергать loadNodeProposals ниже (мы это делаем там).
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    };
  }, [loadCanonGraph, loadAcceptedOverlay, scheduleReload]);

  // 3) learned changes текущего пользователя → reload learned
  useEffect(() => {
    if (!user?.id) return;

    const ch = supabase
      .channel("rt-learned")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_node_state", filter: `user_id=eq.${user.id}` },
        () => {
          scheduleReload(loadLearnedFromDb);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, loadLearnedFromDb, scheduleReload]);

  /* ================= GRAPH BASE ================= */

  const baseSourceGraph = useMemo(() => canonGraph ?? seedGraph, [canonGraph]);

  const { computedNodes, labelById } = useMemo(
    () => computeGraphState(baseSourceGraph, learned),
    [baseSourceGraph, learned]
  );

  const baseGraphData = useMemo(
    () => ({ nodes: computedNodes, edges: baseSourceGraph.edges }),
    [computedNodes, baseSourceGraph.edges]
  );

  const graphWithTools = useMemo(() => {
    const nodes = [...baseGraphData.nodes];
    const edges = [...baseGraphData.edges];

    // accepted overlay (временно)
    for (const n of acceptedOverlay.nodes) {
      const isLearned = learned.has(n.id);
      nodes.push({ ...n, status: isLearned ? "learned" : n.status });
    }
    const nodeIdSet = new Set(nodes.map((n) => n.id));

for (const v of views?.views || []) {
  if (!v?.id || !v?.bindsTo) continue;

  const toolNodeId = `tool:${v.id}`;

  // bindsTo может быть строкой или массивом — нормализуем
  const binds = Array.isArray(v.bindsTo) ? v.bindsTo : [v.bindsTo];

  // оставляем только те привязки, которые реально существуют в графе
  const validBinds = binds.filter((bindId) => nodeIdSet.has(bindId));

  // если ни одной валидной привязки нет — вообще не добавляем tool-ноду
  if (validBinds.length === 0) continue;

  nodes.push({
    id: toolNodeId,
    label: v.label ?? "Tool",
    kind: "tool",
  });

  nodeIdSet.add(toolNodeId);

  for (const bindId of validBinds) {
    edges.push({
      id: `tool:${v.id}->${bindId}`,
      source: toolNodeId,
      target: bindId,
      rel: "tool",
    });
  }
}

    return { nodes, edges };
  }, [baseGraphData, acceptedOverlay, learned]);

  const validation = useMemo(() => validateOntology(baseGraphData), [baseGraphData]);

  /* ================= VIEWS ================= */

  const viewByNodeId = useMemo(() => {
    const map = new Map();
    for (const v of views?.views || []) {
      if (!v?.bindsTo) continue;
      map.set(v.bindsTo, v);
    }
    return map;
  }, []);

  const viewByToolNodeId = useMemo(() => {
    const map = new Map();
    for (const v of views?.views || []) {
      map.set(`tool:${v.id}`, v);
    }
    return map;
  }, []);

  const activeView = useMemo(() => {
    if (!selectedNode) return null;
    return viewByToolNodeId.get(selectedNode.id) || viewByNodeId.get(selectedNode.id) || null;
  }, [selectedNode, viewByNodeId, viewByToolNodeId]);

  /* ================= LEARN ================= */

  const isSelectedLearned = selectedNode ? learned.has(selectedNode.id) : false;

  const canLearn = selectedNode && selectedNode.status !== "locked" && !learned.has(selectedNode.id);

  const learnSelectedNode = async () => {
    if (!selectedNode) return;
    const nodeId = selectedNode.id;
    if (learned.has(nodeId)) return;

    const next = new Set(learned);
    next.add(nodeId);
    setLearned(next);

    if (!user?.id) return;

    const { error } = await supabase.from("user_node_state").upsert(
      { user_id: user.id, node_id: nodeId, status: "learned" },
      { onConflict: "user_id,node_id" }
    );

    if (error) console.error("Failed to upsert user_node_state:", error.message);
  };

  const unlearnSelectedNode = async () => {
    if (!selectedNode) return;
    const nodeId = selectedNode.id;
    if (!learned.has(nodeId)) return;

    const next = new Set(learned);
    next.delete(nodeId);
    setLearned(next);

    if (!user?.id) return;

    const { error } = await supabase
      .from("user_node_state")
      .delete()
      .eq("user_id", user.id)
      .eq("node_id", nodeId);

    if (error) console.error("Failed to unlearn:", error.message);
  };

  /* ================= PROPOSALS UI (unchanged logic) ================= */

  const [showProposalForm, setShowProposalForm] = useState(false);
  const [pLabel, setPLabel] = useState("");
  const [pKind, setPKind] = useState("skill");
  const [pDomain, setPDomain] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pBindSource, setPBindSource] = useState("");
  const [pBindRel, setPBindRel] = useState("part_of");
  const [pMsg, setPMsg] = useState("");

  useEffect(() => {
    if (selectedNode?.id) setPBindSource(selectedNode.id);
  }, [selectedNode?.id]);

  const [proposalStatusFilter, setProposalStatusFilter] = useState("pending");
  const [nodeProposals, setNodeProposals] = useState([]);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalErr, setProposalErr] = useState("");

  const [voteCountsById, setVoteCountsById] = useState(new Map());
  const [myVotesById, setMyVotesById] = useState(new Map());

  const loadNodeProposals = useCallback(async () => {
    setProposalErr("");
    setProposalLoading(true);

    let q = supabase
      .from("node_proposals")
      .select("id,label,kind,domain,description,status,bind_source_id,bind_rel,user_id,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    const { data, error } = proposalStatusFilter ? await q.eq("status", proposalStatusFilter) : await q;

    setProposalLoading(false);

    if (error) {
      setProposalErr(error.message);
      setNodeProposals([]);
      setVoteCountsById(new Map());
      setMyVotesById(new Map());
      return;
    }

    const list = data || [];
    setNodeProposals(list);

    const ids = list.map((x) => x.id);
    if (ids.length === 0) {
      setVoteCountsById(new Map());
      setMyVotesById(new Map());
      return;
    }

    const { data: counts, error: countsErr } = await supabase.rpc("get_node_proposal_vote_counts", {
      proposal_ids: ids,
    });

    if (countsErr) {
      console.error("vote counts rpc error:", countsErr.message);
      setVoteCountsById(new Map());
    } else {
      const m = new Map();
      for (const c of counts || []) {
        m.set(c.proposal_id, { up: c.upvotes ?? 0, down: c.downvotes ?? 0, score: c.score ?? 0 });
      }
      setVoteCountsById(m);
    }

    if (user?.id) {
      const { data: myVotes, error: myErr } = await supabase
        .from("node_proposal_votes")
        .select("proposal_id,vote")
        .in("proposal_id", ids)
        .eq("user_id", user.id);

      if (myErr) {
        console.error("my votes load error:", myErr.message);
        setMyVotesById(new Map());
      } else {
        const mv = new Map();
        for (const v of myVotes || []) mv.set(v.proposal_id, v.vote);
        setMyVotesById(mv);
      }
    } else {
      setMyVotesById(new Map());
    }
  }, [proposalStatusFilter, user?.id]);

  useEffect(() => {
    loadNodeProposals();
  }, [loadNodeProposals]);

  // realtime for proposals list too
  useEffect(() => {
    const ch = supabase
      .channel("rt-proposals-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "node_proposals" }, () => {
        scheduleReload(loadNodeProposals);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "node_proposal_votes" }, () => {
        scheduleReload(loadNodeProposals);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadNodeProposals, scheduleReload]);

  const submitNodeProposal = async () => {
    setPMsg("");

    if (!user?.id) {
      setPMsg("Нужно войти, чтобы предлагать узлы.");
      return;
    }
    if (!pLabel.trim()) {
      setPMsg("Введите название узла.");
      return;
    }

    const payload = {
      user_id: user.id,
      label: pLabel.trim(),
      kind: pKind,
      domain: pDomain.trim() || null,
      description: pDesc.trim() || null,
      bind_source_id: pBindSource.trim() || null,
      bind_rel: pBindRel,
    };
// --- ROOT GUARD (v0.1) ---
// корневые узлы (на этом уровне не хотим "бег/отжимания/инструменты")
const ROOT_IDS = new Set(["survival", "autopoiesis", "replication", "energy"]);

// "низовые" типы: методы/действия/инструменты/метрики/навыки
const LOW_KINDS = new Set(["skill", "action", "tool", "metric"]);

// если пытаются привязать низовой узел прямо к корню — блокируем
const bindId = pBindSource.trim() || "";
if (LOW_KINDS.has(pKind) && ROOT_IDS.has(bindId)) {
  setPMsg("Нельзя привязывать skill/action/tool/metric напрямую к корню (Выживание/Автопоэзис/Самокопирование/Энергия). Привяжи к 'Здоровье' или к домену ниже.");
  return;
}
    const { error } = await supabase.from("node_proposals").insert(payload);

    if (error) {
      setPMsg(error.message);
      return;
    }

    setPMsg("✅ Предложение отправлено (pending)");
    setPLabel("");
    setPDomain("");
    setPDesc("");

    await loadNodeProposals();
    await loadAcceptedOverlay();
    await loadCanonGraph();
  };

  const toggleVote = async (proposalId, value) => {
    if (!user?.id) {
      setProposalErr("Нужно войти, чтобы голосовать.");
      return;
    }

    const current = myVotesById.get(proposalId) ?? 0;

    if (current === value) {
      const { error } = await supabase
        .from("node_proposal_votes")
        .delete()
        .eq("proposal_id", proposalId)
        .eq("user_id", user.id);

      if (error) {
        console.error("vote delete error:", error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("node_proposal_votes").upsert(
        { proposal_id: proposalId, user_id: user.id, vote: value },
        { onConflict: "proposal_id,user_id" }
      );

      if (error) {
        console.error("vote upsert error:", error.message);
        return;
      }
    }

    await loadNodeProposals();
    await loadAcceptedOverlay();
    await loadCanonGraph();
  };

  /* ================= RENDER ================= */

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", overflow: "hidden" }}>
      {/* LEFT: graph */}
      <div style={{ flex: 1, background: "#f5f5f5", position: "relative", height: "100vh", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <ForceGraphCanvas graph={graphWithTools} onNodeSelect={setSelectedNode} wheelSensitivity={10} />
        </div>
      </div>

{/* RIGHT: panel */}
<div
  style={{
    width: 420,
    height: "100vh",
    padding: 16,
    borderLeft: "1px solid #ddd",
    background: "#fff",
    overflow: "auto",
    display: "grid",
    gap: 16,
    alignContent: "start",
  }}
>
  {/* 1. Account */}
  <div style={{ display: "grid", gap: 10 }}>
    <AuthPanel onUser={setUser} />
  </div>

  {/* 2. Selected node inspector */}
  <div style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
    {selectedNode ? (
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>{selectedNode.label}</h2>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 13 }}>
            <b>Kind:</b> {selectedNode.kind ?? "—"}
          </div>
          <div style={{ fontSize: 13 }}>
            <b>Status:</b>{" "}
            {selectedNode.status === "locked"
              ? "locked"
              : isSelectedLearned
              ? "learned"
              : selectedNode.status ?? "—"}
          </div>
          {selectedNode.domain && (
            <div style={{ fontSize: 13 }}>
              <b>Domain:</b> {selectedNode.domain}
            </div>
          )}
        </div>

        {selectedNode.description && (
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {selectedNode.description}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canLearn && <button onClick={learnSelectedNode}>Отметить как learned</button>}
          {isSelectedLearned && <button onClick={unlearnSelectedNode}>Unlearn</button>}
        </div>

        {Array.isArray(selectedNode.requires) && selectedNode.requires.length > 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 13 }}>
              <b>Требуется:</b>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {selectedNode.requires.map((id) => (
                <li key={id}>
                  {labelById.get(id) ?? id} {learned.has(id) ? "✅" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {selectedNode.status === "locked" && (
          <div style={{ fontSize: 13, color: "#666" }}>
            Недоступно: сначала выполни prerequisites.
          </div>
        )}
      </div>
    ) : (
      <div style={{ color: "#666" }}>Кликни на узел</div>
    )}
  </div>

  {/* 3. Active view / dashboard */}
  {activeView?.id === "pushups_dashboard" && (
    <div style={{ borderTop: "1px solid #eee", paddingTop: 12, display: "grid", gap: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Связанный dashboard</div>
      <PushupsForm userId={userId} onCreated={() => setRefreshKey((k) => k + 1)} />
      <PushupsStats userId={userId} refreshKey={refreshKey} />
      <ExerciseDashboard userId={userId} refreshKey={refreshKey} />
    </div>
  )}

  {/* 4. System */}
  <div style={{ borderTop: "1px solid #eee", paddingTop: 12, display: "grid", gap: 8 }}>
    <div style={{ fontSize: 14, fontWeight: 600 }}>Система</div>

    <div style={{ fontSize: 12, color: "#666", display: "grid", gap: 8 }}>
      <div>
        Ontology source: <b>{canonGraph ? "Supabase (ontology_*)" : "local seedGraph (graph.json)"}</b>
      </div>

      {canonErr && <div style={{ color: "#b00020" }}>canon error: {canonErr}</div>}

      <button onClick={loadCanonGraph} disabled={canonLoading}>
        {canonLoading ? "Loading..." : "Reload canon"}
      </button>
    </div>

    {!validation.ok && (
      <div style={{ padding: 12, background: "#fff3f3", border: "1px solid #ffd0d0", fontSize: 12 }}>
        <b>Ontology errors:</b>
        <ul style={{ margin: "8px 0 0 18px" }}>
          {validation.errors.slice(0, 10).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
          {validation.errors.length > 10 && <div>…and more</div>}
      </div>
    )}
  </div>

  {/* 5. Proposals */}
  <div style={{ borderTop: "1px solid #eee", paddingTop: 12, display: "grid", gap: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <b>Proposals</b>
      <button onClick={() => setShowProposalForm((v) => !v)}>
        {showProposalForm ? "Закрыть" : "Предложить узел"}
      </button>
    </div>

    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <select
        value={proposalStatusFilter}
        onChange={(e) => setProposalStatusFilter(e.target.value)}
        style={{ padding: 6, flex: 1 }}
      >
        <option value="pending">pending</option>
        <option value="accepted">accepted</option>
        <option value="rejected">rejected</option>
        <option value="">all</option>
      </select>

      <button onClick={loadNodeProposals} disabled={proposalLoading}>
        {proposalLoading ? "..." : "Refresh"}
      </button>
    </div>

    {proposalErr && <div style={{ fontSize: 12, color: "#b00020" }}>{proposalErr}</div>}

    {showProposalForm && (
      <div style={{ display: "grid", gap: 8, padding: 10, border: "1px solid #ddd", borderRadius: 10 }}>
        <input
          placeholder="Название узла (label)"
          value={pLabel}
          onChange={(e) => setPLabel(e.target.value)}
          style={{ padding: 8 }}
        />

        <select value={pKind} onChange={(e) => setPKind(e.target.value)} style={{ padding: 8 }}>
          <option value="problem">problem</option>
          <option value="skill">skill</option>
          <option value="action">action</option>
          <option value="metric">metric</option>
          <option value="tool">tool</option>
          <option value="domain">domain</option>
        </select>

        <input
          placeholder="Domain (опционально)"
          value={pDomain}
          onChange={(e) => setPDomain(e.target.value)}
          style={{ padding: 8 }}
        />

        <textarea
          placeholder="Описание (опционально)"
          value={pDesc}
          onChange={(e) => setPDesc(e.target.value)}
          rows={3}
          style={{ padding: 8 }}
        />

        <input
          placeholder="Привязать к (node id)"
          value={pBindSource}
          onChange={(e) => setPBindSource(e.target.value)}
          style={{ padding: 8 }}
        />

        <select value={pBindRel} onChange={(e) => setPBindRel(e.target.value)} style={{ padding: 8 }}>
          <option value="part_of">part_of (ветка/часть)</option>
          <option value="requires">requires (требует)</option>
          <option value="supports">supports (поддерживает)</option>
          <option value="tool">tool (инструмент)</option>
        </select>

        <button onClick={submitNodeProposal}>Отправить (pending)</button>

        {pMsg && (
          <div style={{ fontSize: 12, color: pMsg.startsWith("✅") ? "#1b7f3b" : "#b00020" }}>
            {pMsg}
          </div>
        )}
      </div>
    )}

    {nodeProposals.length === 0 ? (
      <div style={{ fontSize: 12, color: "#777" }}>Пока пусто.</div>
    ) : (
      <div style={{ display: "grid", gap: 8 }}>
        {nodeProposals.map((p) => {
          const counts = voteCountsById.get(p.id) || { up: 0, down: 0, score: 0 };
          const myVote = myVotesById.get(p.id) || 0;

          return (
            <div
              key={p.id}
              style={{
                border: "1px solid #eee",
                padding: 10,
                borderRadius: 10,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <b style={{ fontSize: 13 }}>{p.label}</b>
                <span style={{ fontSize: 12, color: "#666" }}>{p.status}</span>
              </div>

              <div style={{ fontSize: 12, color: "#444" }}>
                kind: <b>{p.kind}</b>
                {p.domain ? (
                  <>
                    {" "}• domain: <b>{p.domain}</b>
                  </>
                ) : null}
              </div>

              <div style={{ fontSize: 12, color: "#444" }}>
                bind: <b>{p.bind_source_id || "—"}</b> • rel: <b>{p.bind_rel || "—"}</b>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                <button
                  onClick={() => toggleVote(p.id, 1)}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid #ddd",
                    background: myVote === 1 ? "#e8f5e9" : "#fff",
                  }}
                  title="Upvote"
                >
                  👍 {counts.up}
                </button>

                <button
                  onClick={() => toggleVote(p.id, -1)}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid #ddd",
                    background: myVote === -1 ? "#ffebee" : "#fff",
                  }}
                  title="Downvote"
                >
                  👎 {counts.down}
                </button>

                <div style={{ fontSize: 12, color: "#666" }}>
                  score: <b>{counts.score}</b>
                </div>
              </div>

              {p.description && (
                <div style={{ fontSize: 12, color: "#555", whiteSpace: "pre-wrap" }}>
                  {p.description}
                </div>
              )}

              <div style={{ fontSize: 11, color: "#888" }}>
                {new Date(p.created_at).toLocaleString()} • by {String(p.user_id).slice(0, 8)}…
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
</div>
    </div>
  );
}
