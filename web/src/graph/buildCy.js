import cytoscape from "cytoscape";

export function buildCy({ container, nodes, edges, onNodeSelect }) {
  container.innerHTML = "";

  const cy = cytoscape({
    container,
    elements: [
      ...nodes.map((n) => ({ data: n })),
      ...edges.map((e) => ({ data: e })),
    ],
    style: [
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

      { selector: 'node[status = "base"]', style: { "background-color": "#2ecc71" } },
      { selector: 'node[status = "learned"]', style: { "background-color": "#3498db" } },
      { selector: 'node[status = "locked"]', style: { "background-color": "#95a5a6" } },
      { selector: 'node[status = "unlocked"]', style: { "background-color": "#f1c40f" } },

      { selector: "#surviving", style: { "background-color": "#111", color: "#fff" } },

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
    layout: { name: "preset" },
    wheelSensitivity: 10,
  });

  // базовые позиции (пока так, позже сделаем сохранение)
  cy.getElementById("surviving").position({ x: 650, y: 300 });
  cy.getElementById("intellect").position({ x: 380, y: 260 });
  cy.getElementById("python").position({ x: 160, y: 180 });
  cy.getElementById("fastapi").position({ x: 60, y: 80 });

  cy.getElementById("physical_activity").position({ x: 380, y: 420 });
  cy.getElementById("exercises_dashboard").position({ x: 160, y: 520 });

  cy.nodes().grabify();

  cy.on("tap", "node", (evt) => {
    onNodeSelect?.(evt.target.data());
  });

  return cy;
}
