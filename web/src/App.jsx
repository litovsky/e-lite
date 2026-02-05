import { useEffect, useMemo, useState } from "react";

import graph from "./data/graph.json";
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

  // auth → Supabase
  useEffect(() => {
    let cancelled = false;

    const loadFromDb = async () => {
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

      if (!cancelled) {
        setLearned(new Set((data || []).map((x) => x.node_id)));
      }
    };

    loadFromDb();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  /* ================= GRAPH ================= */

  const { computedNodes, labelById } = useMemo(
    () => computeGraphState(graph, learned),
    [learned]
  );

  const baseGraphData = useMemo(
    () => ({ nodes: computedNodes, edges: graph.edges }),
    [computedNodes]
  );

  // overlay: tool nodes/edges from views.json
  const graphWithTools = useMemo(() => {
    const nodes = [...baseGraphData.nodes];
    const edges = [...baseGraphData.edges];

    for (const v of views?.views || []) {
      if (!v?.id || !v?.bindsTo) continue;

      const toolNodeId = `tool:${v.id}`;

      nodes.push({
        id: toolNodeId,
        label: v.label ?? "Tool",
        kind: "tool",
        isTool: true,
        status: "tool",
      });

      edges.push({
        id: `edge:${v.bindsTo}->${toolNodeId}`,
        source: v.bindsTo,
        target: toolNodeId,
        rel: "tool",
        isTool: true,
      });
    }

    return { nodes, edges };
  }, [baseGraphData]);

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
    return (
      viewByToolNodeId.get(selectedNode.id) ||
      viewByNodeId.get(selectedNode.id) ||
      null
    );
  }, [selectedNode, viewByNodeId, viewByToolNodeId]);

  /* ================= LEARN ================= */

  const canLearn =
    selectedNode && selectedNode.status !== "locked" && selectedNode.status !== "learned";

  const learnSelectedNode = async () => {
    if (!selectedNode) return;
    const nodeId = selectedNode.id;

    // UI fast
    const next = new Set(learned);
    next.add(nodeId);
    setLearned(next);
    setSelectedNode({ ...selectedNode, status: "learned" });

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

  /* ================= PROPOSALS: FORM ================= */

  const [showProposalForm, setShowProposalForm] = useState(false);
  const [pLabel, setPLabel] = useState("");
  const [pKind, setPKind] = useState("skill");
  const [pDomain, setPDomain] = useState("");
  const [pDesc, setPDesc] = useState("");

  // NEW: bind fields
  const [pBindSource, setPBindSource] = useState("");
  const [pBindRel, setPBindRel] = useState("part_of");

  const [pMsg, setPMsg] = useState("");

  // auto-set bind_source_id = selectedNode.id
  useEffect(() => {
    if (selectedNode?.id) setPBindSource(selectedNode.id);
  }, [selectedNode?.id]);

  /* ================= PROPOSALS: LIST ================= */

  const [proposalStatusFilter, setProposalStatusFilter] = useState("pending");
  const [nodeProposals, setNodeProposals] = useState([]);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalErr, setProposalErr] = useState("");

  const loadNodeProposals = async () => {
    setProposalErr("");
    setProposalLoading(true);

    let q = supabase
      .from("node_proposals")
      .select(
        "id, label, kind, domain, description, status, bind_source_id, bind_rel, user_id, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    const { data, error } = proposalStatusFilter
      ? await q.eq("status", proposalStatusFilter)
      : await q;

    setProposalLoading(false);

    if (error) {
      setProposalErr(error.message);
      return;
    }

    setNodeProposals(data || []);
  };

  useEffect(() => {
    loadNodeProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalStatusFilter, user?.id]);

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

    const { error } = await supabase.from("node_proposals").insert(payload);

    if (error) {
      setPMsg(error.message);
      return;
    }

    setPMsg("✅ Предложение отправлено (pending)");
    setPLabel("");
    setPDomain("");
    setPDesc("");

    // refresh list
    loadNodeProposals();
  };

  /* ================= RENDER ================= */

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* LEFT: graph */}
      <div
        style={{
          flex: 1,
          background: "#f5f5f5",
          position: "relative",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <ForceGraphCanvas
            graph={graphWithTools}
            onNodeSelect={setSelectedNode}
            wheelSensitivity={10}
          />
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
        }}
      >
        {/* Auth */}
        <AuthPanel onUser={setUser} />
        <div style={{ fontSize: 12, color: "#666" }}>
          Active user_id: <b>{userId}</b>
        </div>

        {/* Proposals */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b>Proposals</b>
            <button onClick={() => setShowProposalForm((v) => !v)}>
              {showProposalForm ? "Закрыть" : "Предложить узел"}
            </button>
          </div>

          {/* Filter + refresh */}
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

          {/* Form */}
          {showProposalForm && (
            <div style={{ display: "grid", gap: 8, padding: 10, border: "1px solid #ddd" }}>
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
                placeholder="Привязать к (node id) — по умолчанию выбранный узел"
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

          {/* List */}
          {nodeProposals.length === 0 ? (
            <div style={{ fontSize: 12, color: "#777" }}>Пока пусто.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {nodeProposals.map((p) => (
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
                        {" "}
                        • domain: <b>{p.domain}</b>
                      </>
                    ) : null}
                  </div>

                  <div style={{ fontSize: 12, color: "#444" }}>
                    bind: <b>{p.bind_source_id || "—"}</b> • rel:{" "}
                    <b>{p.bind_rel || "—"}</b>
                  </div>

                  {p.description && (
                    <div style={{ fontSize: 12, color: "#555", whiteSpace: "pre-wrap" }}>
                      {p.description}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: "#888" }}>
                    {new Date(p.created_at).toLocaleString()} • by{" "}
                    {String(p.user_id).slice(0, 8)}…
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ontology validation errors */}
        {!validation.ok && (
          <div style={{ padding: 12, background: "#fff3f3", border: "1px solid #ffd0d0" }}>
            <b>Ontology errors:</b>
            <ul style={{ margin: "8px 0 0 18px" }}>
              {validation.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            {validation.errors.length > 10 && <div>…and more</div>}
          </div>
        )}

        {/* Selected node */}
        {selectedNode ? (
          <div style={{ display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>{selectedNode.label}</h3>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13 }}>
                <b>Type:</b> {selectedNode.type ?? "—"}
              </div>
              <div style={{ fontSize: 13 }}>
                <b>Kind:</b> {selectedNode.kind ?? "—"}
              </div>
              <div style={{ fontSize: 13 }}>
                <b>Status:</b> {selectedNode.status ?? "—"}
              </div>
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

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canLearn && <button onClick={learnSelectedNode}>Отметить как learned</button>}
              {selectedNode.status === "learned" && (
                <button onClick={unlearnSelectedNode}>Unlearn</button>
              )}
            </div>

            {/* View binding */}
            {activeView?.id === "pushups_dashboard" && (
              <div style={{ display: "grid", gap: 16, marginTop: 8 }}>
                <PushupsForm userId={userId} onCreated={() => setRefreshKey((k) => k + 1)} />
                <PushupsStats userId={userId} refreshKey={refreshKey} />
                <ExerciseDashboard userId={userId} refreshKey={refreshKey} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: "#666" }}>Кликни на узел</div>
        )}
      </div>
    </div>
  );
}
