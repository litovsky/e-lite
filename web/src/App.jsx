import { useEffect, useRef, useState } from "react";
import graph from "./data/graph.json";
import PushupsForm from "./components/PushupsForm";
import { loadLearnedSet, saveLearnedSet } from "./storage/learnedStore";
import { computeGraphState } from "./graph/computeGraphState";
import { buildCy } from "./graph/buildCy";

import ExerciseDashboard from "./components/ExerciseDashboard";

export default function App() {
  const cyRef = useRef(null);
  const cyInstanceRef = useRef(null);

  const [selectedNode, setSelectedNode] = useState(null);
  const [learned, setLearned] = useState(() => loadLearnedSet());

  // persist learned
  useEffect(() => {
    saveLearnedSet(learned);
  }, [learned]);

  // compute node statuses
  const { computedNodes, labelById } = computeGraphState(graph, learned);

  // build graph when learned changes
  useEffect(() => {
    if (!cyRef.current) return;

    cyInstanceRef.current?.destroy?.();
    cyInstanceRef.current = buildCy({
      container: cyRef.current,
      nodes: computedNodes,
      edges: graph.edges,
      onNodeSelect: setSelectedNode,
    });

    return () => {
      cyInstanceRef.current?.destroy?.();
      cyInstanceRef.current = null;
    };
  }, [learned, computedNodes]);

  const canLearn =
    selectedNode &&
    selectedNode.status !== "locked" &&
    selectedNode.status !== "learned";

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex" }}>
      <div ref={cyRef} style={{ flex: 1, background: "#f5f5f5" }} />

      <div
        style={{
          width: 360,
          padding: 16,
          borderLeft: "1px solid #ddd",
          background: "#fff",
          overflow: "auto",
        }}
      >
        {selectedNode ? (
          <>
            <h3 style={{ marginTop: 0 }}>{selectedNode.label}</h3>

            <p><b>Тип:</b> {selectedNode.type}</p>
            <p><b>Статус:</b> {selectedNode.status}</p>

            {Array.isArray(selectedNode.requires) && selectedNode.requires.length > 0 && (
              <>
                <p><b>Требуется:</b></p>
                <ul>
                  {selectedNode.requires.map((id) => (
                    <li key={id}>
                      {labelById.get(id) ?? id} {learned.has(id) ? "✅" : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {selectedNode.status === "locked" && (
              <p style={{ color: "#666" }}>
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
            <PushupsForm userId="arseniy" />
            {/* Dashboard hook */}
            {selectedNode.id === "exercises_dashboard" && <ExerciseDashboard />}
          </>
        ) : (
          <p>Кликни на узел</p>
        )}
      </div>
    </div>
  );
}
