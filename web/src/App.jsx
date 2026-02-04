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

  /* ================= USER STATE ================= */

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
        console.error(error.message);
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

  // tools overlay
  const graphWithTools = useMemo(() => {
    const nodes = [...baseGraphData.nodes];
    const edges = [...baseGraphData.edges];

    for (const v of views?.views || []) {
      const toolNodeId = `tool:${v.id}`;

      nodes.push({
        id: toolNodeId,
        label: v.label ?? "Tool",
        kind: "tool",
        isTool: true,
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

  const validation = useMemo(
    () => validateOntology(baseGraphData),
    [baseGraphData]
  );

  /* ================= VIEWS ================= */

  const viewByNodeId = useMemo(() => {
    const m = new Map();
    for (const v of views?.views || []) m.set(v.bindsTo, v);
    return m;
  }, []);

  const viewByToolNodeId = useMemo(() => {
    const m = new Map();
    for (const v of views?.views || []) m.set(`tool:${v.id}`, v);
    return m;
  }, []);

  const activeView = useMemo(() => {
    if (!selectedNode) return null;
    return (
      viewByToolNodeId.get(selectedNode.id) ||
      viewByNodeId.get(selectedNode.id) ||
      null
    );
  }, [selectedNode]);

  /* ================= LEARN / UNLEARN ================= */

  const learnNode = async (nodeId) => {
    const next = new Set(learned);
    next.add(nodeId);
    setLearned(next);

    if (!user?.id) return;

    await supabase.from("user_node_state").upsert(
      { user_id: user.id, node_id: nodeId, status: "learned" },
      { onConflict: "user_id,node_id" }
    );
  };

  const unlearnNode = async (nodeId) => {
    const next = new Set(learned);
    next.delete(nodeId);
    setLearned(next);

    if (!user?.id) return;

    await supabase
      .from("user_node_state")
      .delete()
      .eq("user_id", user.id)
      .eq("node_id", nodeId);
  };

  /* ================= PROPOSALS ================= */

  const [showProposalForm, setShowProposalForm] = useState(false);
  const [pLabel, setPLabel] = useState("");
  const [pKind, setPKind] = useState("skill");
  const [pDomain, setPDomain] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pMsg, setPMsg] = useState("");

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

    const { error } = await supabase.from("node_proposals").insert({
      user_id: user.id,
      label: pLabel.trim(),
      kind: pKind,
      domain: pDomain.trim() || null,
      description: pDesc.trim() || null,
    });

    if (error) {
      setPMsg(error.message);
      return;
    }

    setPMsg("✅ Предложение отправлено (pending)");
    setPLabel("");
    setPDomain("");
    setPDesc("");
  };

  /* ================= RENDER ================= */

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      {/* GRAPH */}
      <div style={{ flex: 1 }}>
        <ForceGraphCanvas
          graph={graphWithTools}
          onNodeSelect={setSelectedNode}
          wheelSensitivity={10}
        />
      </div>

      {/* RIGHT PANEL */}
      <div
        style={{
          width: 380,
          padding: 16,
          borderLeft: "1px solid #ddd",
          background: "#fff",
          overflow: "auto",
          display: "grid",
          gap: 16,
        }}
      >
        <AuthPanel onUser={setUser} />

        <div style={{ fontSize: 12, color: "#666" }}>
          user_id: <b>{userId}</b>
        </div>

        {/* PROPOSALS */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <b>Proposals</b>
            <button onClick={() => setShowProposalForm((v) => !v)}>
              {showProposalForm ? "Закрыть" : "Предложить узел"}
            </button>
          </div>

          {showProposalForm && (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <input
                placeholder="Название"
                value={pLabel}
                onChange={(e) => setPLabel(e.target.value)}
              />
              <select value={pKind} onChange={(e) => setPKind(e.target.value)}>
                <option value="problem">problem</option>
                <option value="skill">skill</option>
                <option value="action">action</option>
                <option value="metric">metric</option>
                <option value="tool">tool</option>
                <option value="domain">domain</option>
              </select>
              <input
                placeholder="Domain (опц.)"
                value={pDomain}
                onChange={(e) => setPDomain(e.target.value)}
              />
              <textarea
                placeholder="Описание (опц.)"
                rows={3}
                value={pDesc}
                onChange={(e) => setPDesc(e.target.value)}
              />
              <button onClick={submitNodeProposal}>Отправить</button>
              {pMsg && (
                <div style={{ fontSize: 12 }}>{pMsg}</div>
              )}
            </div>
          )}
        </div>

        {/* NODE PANEL */}
        {selectedNode ? (
          <div>
            <h3>{selectedNode.label}</h3>

            <div style={{ fontSize: 13 }}>kind: {selectedNode.kind}</div>
            <div style={{ fontSize: 13 }}>status: {selectedNode.status}</div>

            {selectedNode.status !== "learned" &&
              selectedNode.status !== "locked" && (
                <button onClick={() => learnNode(selectedNode.id)}>
                  Mark learned
                </button>
              )}

            {selectedNode.status === "learned" && (
              <button onClick={() => unlearnNode(selectedNode.id)}>
                Unlearn
              </button>
            )}

            {activeView?.id === "pushups_dashboard" && (
              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <PushupsForm
                  userId={userId}
                  onCreated={() => setRefreshKey((k) => k + 1)}
                />
                <PushupsStats userId={userId} refreshKey={refreshKey} />
                <ExerciseDashboard
                  userId={userId}
                  refreshKey={refreshKey}
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: "#777" }}>Кликни на узел</div>
        )}
      </div>
    </div>
  );
}
