import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
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

export default function App() {
  const [user, setUser] = useState(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);

  // пока user-state (learned) локальный; позже перенесем в БД по user.id
  const [learned, setLearned] = useState(() => loadLearnedSet());

  useEffect(() => {
  // guest — сохраняем локально
  if (!user?.id) saveLearnedSet(learned);
  }, [learned, user?.id]);

  useEffect(() => {
  let cancelled = false;

  const loadFromDb = async () => {
    if (!user?.id) {
      // если разлогинились — возвращаемся к localStorage
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

    if (cancelled) return;

    const set = new Set((data || []).map((x) => x.node_id));
    setLearned(set);
  };

  loadFromDb();

  return () => {
    cancelled = true;
  };
  }, [user?.id]);

  // userId для API упражнений (пока так)
  const userId = user?.id || "guest";

  const { computedNodes, labelById } = useMemo(() => {
    return computeGraphState(graph, learned);
  }, [learned]);

  const baseGraphData = useMemo(
    () => ({ nodes: computedNodes, edges: graph.edges }),
    [computedNodes]
  );

  // overlay: добавляем tool-узлы и tool-рёбра из views.json (не трогаем онтологию)
  const graphWithTools = useMemo(() => {
    const nodes = [...baseGraphData.nodes];
    const edges = [...baseGraphData.edges];

    for (const v of views?.views || []) {
      if (!v?.bindsTo) continue;

      const toolNodeId = `tool:${v.id}`;

      nodes.push({
        id: toolNodeId,
        label: v.label ?? "Tool",
        kind: "tool",
        status: "tool",
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

  const validation = useMemo(() => validateOntology(baseGraphData), [baseGraphData]);

  useEffect(() => {
    if (!validation.ok) {
      console.group("Ontology validation errors");
      validation.errors.forEach((e) => console.error(e));
      console.groupEnd();
    } else {
      console.log("Ontology OK");
    }
  }, [validation]);

  // views: bindsTo(nodeId) -> view
  const viewByNodeId = useMemo(() => {
    const map = new Map();
    for (const v of views?.views || []) {
      if (!v?.bindsTo) continue;
      map.set(v.bindsTo, v);
    }
    return map;
  }, []);

  // views: tool node id -> view
  const viewByToolNodeId = useMemo(() => {
    const map = new Map();
    for (const v of views?.views || []) {
      const toolNodeId = `tool:${v.id}`;
      map.set(toolNodeId, v);
    }
    return map;
  }, []);

  const activeView = useMemo(() => {
    if (!selectedNode) return null;

    // клик по tool-узлу
    const toolView = viewByToolNodeId.get(selectedNode.id);
    if (toolView) return toolView;

    // клик по основному узлу
    return viewByNodeId.get(selectedNode.id) ?? null;
  }, [selectedNode, viewByNodeId, viewByToolNodeId]);

  const canLearn =
    selectedNode && selectedNode.status !== "locked" && selectedNode.status !== "learned";

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
          width: 380,
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

            {canLearn && (
              <button
                onClick={async () => {
  const nodeId = selectedNode.id;

  // 1) Локально обновляем сразу (UI быстрый)
  const next = new Set(learned);
  next.add(nodeId);
  setLearned(next);
  setSelectedNode({ ...selectedNode, status: "learned" });

  // 2) guest — только localStorage
  if (!user?.id) return;

  // 3) auth — пишем в БД
  const { error } = await supabase.from("user_node_state").upsert(
    {
      user_id: user.id,
      node_id: nodeId,
      status: "learned",
    },
    { onConflict: "user_id,node_id" }
  );

  if (error) {
    console.error("Failed to upsert user_node_state:", error.message);
  }
                }}
              >
                Отметить как learned
              </button>
            )}

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
