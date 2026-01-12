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

    // clear container so Cytoscape doesn't stack canvases
    cyRef.current.innerHTML = "";

    const cy = cytoscape({
      container: cyRef.current,
      elements: [
        ...graph.nodes.map((n) => ({
          data: {
            ...n,
            status: learned.has(n.id) ? "learned" : n.status,
          },
        })),
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
        {
          selector: 'node[status = "base"]',
          style: { "background-color": "#2ecc71" },
        },
        {
          selector: 'node[status = "learned"]',
          style: { "background-color": "#3498db" },
        },
        {
          selector: 'node[status = "locked"]',
          style: { "background-color": "#95a5a6" },
        },

        // Special styling for the central node
        {
          selector: "#surviving",
          style: { "background-color": "#111", color: "#fff" },
        },

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

    cy.nodes().grabify(); // allow dragging nodes

    cy.on("tap", "node", (evt) => {
      setSelectedNode(evt.target.data());
    });

    return () => cy.destroy();
  }, [learned]);

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex" }}>
      {/* Canvas */}
      <div
        ref={cyRef}
        style={{ flex: 1, background: "#f5f5f5" }}
      />

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

            {selectedNode.status !== "learned" && (
              <button
                onClick={() => {
                  const next = new Set(learned);
                  next.add(selectedNode.id);
                  setLearned(next);

                  // update panel immediately (graph will be rebuilt anyway)
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
