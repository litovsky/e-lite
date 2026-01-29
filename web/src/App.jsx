import { useEffect, useMemo, useState } from "react";

import graph from "./data/graph.json";
import views from "./data/views.json";

import PushupsForm from "./components/PushupsForm";
import PushupsStats from "./components/PushupsStats";
import ExerciseDashboard from "./components/ExerciseDashboard";
import ForceGraphCanvas from "./graph/ForceGraphCanvas";

import { loadLearnedSet, saveLearnedSet } from "./storage/learnedStore";
import { computeGraphState } from "./graph/computeGraphState";
import { validateOntology } from "./graph/ontology";

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);
  const [learned, setLearned] = useState(() => loadLearnedSet());

  useEffect(() => {
    saveLearnedSet(learned);
  }, [learned]);

  const { computedNodes, labelById } = useMemo(() => {
    return computeGraphState(graph, learned);
  }, [learned]);

  const forceGraphData = useMemo(
    () => ({ nodes: computedNodes, edges: graph.edges }),
    [computedNodes]
  );
  const graphWithTools = useMemo(() => {
  const nodes = [...forceGraphData.nodes];
  const edges = [...forceGraphData.edges];

  for (const v of views.views || []) {
    if (!v.bindsTo) continue;

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
}, [forceGraphData]);
  const validation = useMemo(() => validateOntology(forceGraphData), [forceGraphData]);

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

  // Если кликнули на tool-узел — берём view напрямую
  const toolView = viewByToolNodeId.get(selectedNode.id);
  if (toolView) return toolView;

  // Если кликнули на основной узел — берём view по bindsTo
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
      {/* LEFT: graph area */}
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
            selectedNodeId={selectedNode?.id}
            wheelSensitivity={10}
          />
        </div>
      </div>

      {/* RIGHT: panel */}
      <div
        style={{
          width: 360,
          height: "100vh",
          padding: 16,
          borderLeft: "1px solid #ddd",
          background: "#fff",
          overflow: "auto",
          display: "grid",
          gap: 16,
        }}
      >
        {!validation.ok && (
          <div style={{ padding: 12, background: "#fff3f3", border: "1px solid #ffd0d0" }}>
            <b>Ontology errors:</b>
            <ul style={{ margin: "8px 0 0 18px" }}>
              {validation.errors.slice(0, 8).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            {validation.errors.length > 8 && <div>…and more</div>}
          </div>
        )}

        {selectedNode ? (
          <div style={{ display: "grid", gap: 12 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>{selectedNode.label}</h3>

            <p style={{ margin: 0 }}>
              <b>Тип:</b> {selectedNode.type}
            </p>
            <p style={{ margin: 0 }}>
              <b>Kind:</b> {selectedNode.kind}
            </p>
            <p style={{ margin: 0 }}>
              <b>Статус:</b> {selectedNode.status}
            </p>

            {Array.isArray(selectedNode.requires) && selectedNode.requires.length > 0 && (
              <>
                <p style={{ margin: 0 }}>
                  <b>Требуется:</b>
                </p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {selectedNode.requires.map((id) => (
                    <li key={id}>
                      {labelById.get(id) ?? id} {learned.has(id) ? "✅" : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {selectedNode.status === "locked" && (
              <p style={{ color: "#666", margin: 0 }}>
                Недоступно: сначала выполни prerequisites.
              </p>
            )}

            {canLearn && (
              <button
                onClick={() => {
                  const next = new Set(learned);
                  next.add(selectedNode.id);
                  setLearned(next);
                  setSelectedNode({ ...selectedNode, status: "learned" });
                }}
              >
                Отметить как learned
              </button>
            )}

            {/* View binding: dashboard for node */}
            {activeView?.id === "pushups_dashboard" && (
              <div style={{ display: "grid", gap: 16, marginTop: 8 }}>
                <PushupsForm userId="arseniy" onCreated={() => setRefreshKey((k) => k + 1)} />
                <PushupsStats userId="arseniy" refreshKey={refreshKey} />
                <ExerciseDashboard userId="arseniy" refreshKey={refreshKey} />
              </div>
            )}
          </div>
        ) : (
          <p>Кликни на узел</p>
        )}
      </div>
    </div>
  );
}
