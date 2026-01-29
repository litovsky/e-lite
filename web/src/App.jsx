import { useEffect, useMemo, useState } from "react";
import graph from "./data/graph.json";
import { validateOntology } from "./graph/ontology";

import PushupsForm from "./components/PushupsForm";
import PushupsStats from "./components/PushupsStats";
import ExerciseDashboard from "./components/ExerciseDashboard";
import ForceGraphCanvas from "./graph/ForceGraphCanvas";

import { loadLearnedSet, saveLearnedSet } from "./storage/learnedStore";
import { computeGraphState } from "./graph/computeGraphState";

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

  //валидация для проверки дублей
  const validation = useMemo(() => validateOntology(forceGraphData), [forceGraphData]);

  //результат валидации, сверяет с базой
  useEffect(() => {
    if (!validation.ok) {
      console.group("Ontology validation errors");
      validation.errors.forEach((e) => console.error(e));
      console.groupEnd();
    } else {
      console.log("Ontology OK");
    }
  }, [validation]);

  const canLearn =
    selectedNode &&
    selectedNode.status !== "locked" &&
    selectedNode.status !== "learned";

  const SHOW_PUSHUPS_PANEL_NODE_ID = "pushups_dashboard";

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Левая панель */}
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
            graph={forceGraphData}
            onNodeSelect={setSelectedNode}
            wheelSensitivity={10}
          />
        </div>
      </div>

      {/* Правая панель */}
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
        {/* показ ошибок в UI */}
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
            <h3 style={{ marginTop: 0 }}>{selectedNode.label}</h3>

            <p style={{ margin: 0 }}>
              <b>Тип:</b> {selectedNode.type}
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

            {selectedNode.id === SHOW_PUSHUPS_PANEL_NODE_ID && (
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
