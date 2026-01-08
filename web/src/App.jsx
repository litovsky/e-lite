import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import graph from "./data/graph.json";

export default function App() {
  const cyRef = useRef(null);

  useEffect(() => {
    if (!cyRef.current) return;

    const cy = cytoscape({
      container: cyRef.current,

      elements: [
        ...graph.nodes.map((n) => ({ data: n })),
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

    return () => cy.destroy();
  }, []);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <div
        ref={cyRef}
        style={{ height: "100%", width: "100%", background: "#f5f5f5" }}
      />
    </div>
  );
}
