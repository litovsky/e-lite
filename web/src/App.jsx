import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import graph from "./data/graph.json";

const STORAGE_KEY = "e-lite.learned.v1";

export default function App() {
  const cyRef = useRef(null);

  const [selectedNode, setSelectedNode] = useState(null);

  // learned nodes are stored in localStorage
  const [learned, setLearned] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(arr);
    } catch {
      return new Set();
    }
  });

  // persist learned -> localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(learned)));
  }, [learned]);

  // (Re)build graph whenever learned changes (simple & robust for MVP)
  useEffect(() => {
    if (!cyRef.current) return;

    // Clear container so Cytoscape doesn't stack canvases
    cyRef.current.innerHTML = "";

    // Helpers to compute locked/unlocked based on requires
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

    const isSatisfied = (reqId) => {
      const reqNode = nodeById.get(reqId);
      if (!reqNode) return false;

      // satisfied if requirement is learned OR requirement is base
      return learned.has(reqId) || reqNode.status === "base";
    };

    const computedNodes = graph.nodes.map((n) => {
      // 1) learned always wins
      if (learned.has(n.id)) return { ...n, status: "learned" };

      // 2) base nodes stay base
      if (n.status === "base") return n;

      // 3) if requires exist -> locked/unlocked
      const reqs = Array.isArray(n.requires) ? n.requires : [];
      if (reqs.length > 0) {
        const ok = reqs.every(isSatisfied);
        return { ...n, status: ok ? "unlocked" : "locked" };
      }

      // 4) default: keep status as is
      return n;
    });

    const cy = cytoscape({
      container: cyRef.current,
      elements: [
        ...computedNodes.map((n) => ({ data: n })),
        ...graph.edges.map((e) => ({ data: e })),
      ],
      style: [
        // Base style for all nodes (WITHOUT background-color here)
        {
          selector: "node",
          style: {
            label: "data(label)",
            color: "#111",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 14,
            width: 72,
            height: 72,
          },
        },

        // Status-based colors
        { selector: 'node[status = "base"]', style: { "background-color": "#2ecc71" } },
        { selector: 'node[status = "learned"]', style: { "background-color": "#3498db" } },
        { selector: 'node[status = "locked"]', style: { "background-color": "#95a5a6" } },
        { selector: 'node[status = "unlocked"]', style: { "background-color": "#f1c40f" } },

        // Special styling for the central node
        { selector: "#surviving", style: { "background-color": "#111", color: "#fff" } },

        // Edges
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#27ae60",
            "target-arrow-color": "#27ae60",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 12,
            "text-rotation": "autorotate",
            "text-margin-y": -10,
          },
        },
      ],
      layout: {
        name: "preset",
        positions: {
          surviving: { x: 650, y: 300 },
          intellect: { x: 380, y: 260 },
          python: { x: 160, y: 180 },
        },
      },
      wheelSensitivity: 0.2,
    });

    cy.nodes().grabify();

    cy.on("tap", "node", (evt) => {
      setSelectedNode(evt.target.data());
    });

    return () => cy.destroy();
  }, [learned]);

  const canLearn =
    selectedNode &&
    selectedNode.status !== "locked" &&
    selectedNode.status !== "learned";

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex" }}>
      {/* Canvas */}
      <div ref={cyRef} style={{ flex: 1, background: "#f5f5f5" }} />

      {/* Side panel */}
      <div
        style={{
          width: 320,
          padding: 16,
          borderLeft: "1px solid #ddd",
          background: "#fff",
        }}
      >
        {selectedNode ? (
          <>
            <h3 style={{ marginTop: 0 }}>{selectedNode.label}</h3>

            <p>
              <b>Тип:</b> {selectedNode.type}
            </p>
            <p>
              <b>Статус:</b> {selectedNode.status}
            </p>

            {Array.isArray(selectedNode.requires) &&
              selectedNode.requires.length > 0 && (
                <>
                  <p>
                    <b>Требуется:</b>
                  </p>
                  <ul>
                    {selectedNode.requires.map((r) => (
                      <li key={r}>
                        {r} {learned.has(r) ? "✅" : ""}
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

                  // update panel immediately (graph will rebuild anyway)
                  setSelectedNode({ ...selectedNode, status: "learned" });
                }}
              >
                Отметить как learned
              </button>
            )}
          </>
        ) : (
          <p>Кликни на узел</p>
        )}
      </div>
    </div>
  );
}
