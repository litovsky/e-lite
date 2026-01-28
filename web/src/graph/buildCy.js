import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

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
          shape: "ellipse",
          width: 78,
          height: 78,
          "border-width": 2,
          "border-color": "#fff",
          "shadow-blur": 12,
          "shadow-opacity": 0.18,
          "shadow-offset-x": 0,
          "shadow-offset-y": 6,
        },
      },
      { selector: 'node[status = "base"]', style: { "background-color": "#2ecc71" } },
      { selector: 'node[status = "learned"]', style: { "background-color": "#3498db" } },
      { selector: 'node[status = "locked"]', style: { "background-color": "#95a5a6" } },
      { selector: 'node[status = "unlocked"]', style: { "background-color": "#f1c40f" } },
      {
        selector: "#surviving",
        style: {
          "background-color": "#111",
          color: "#fff",
          width: 92,
          height: 92,
          "font-size": 15,
          "shadow-opacity": 0.28,
        },
      },
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

  // ---------- 1) TREE layout (чтобы было именно "ветками") ----------
  const runTree = () => {
    cy.layout({
      name: "breadthfirst",
      roots: "#surviving",
      directed: true,
      padding: 80,
      spacingFactor: 2.2,   // ↑ расстояние между ветками
      avoidOverlap: true,
      animate: true,
      animationDuration: 500,

      // ВАЖНО: делаем радиально (как Obsidian-ветки вокруг центра)
      // Если хочешь "вправо" — поставь circle:false и укажи orientation (но в breadthfirst orientation не всегда работает)
      circle: true,
    }).run();
  };

  // ---------- 2) Micro-relax (плавающий вайб) ----------
  // очень мало итераций, randomize:false, чтобы не ломать дерево
  const runMicroRelax = (opts = {}) => {
    const cx = Math.max(1, container.clientWidth / 2);
    const cyy = Math.max(1, container.clientHeight / 2);

    cy.layout({
      name: "fcose",
      quality: "draft",
      animate: true,
      animationDuration: 220,
      fit: false,
      padding: 80,

      randomize: false,
      numIter: 60, // МАЛО — это ключ "дыхания", а не пересборки

      nodeRepulsion: 12000,
      nodeSeparation: 80,
      idealEdgeLength: 170,
      edgeElasticity: 0.22,
      gravity: 0.03, // почти ноль, чтобы не стягивало в комок

      separateConnectedComponents: false,
      tile: false,

      fixedNodeConstraint: [{ nodeId: "surviving", position: { x: cx, y: cyy } }],

      ...opts,
    }).run();
  };

  // ---------- 3) Live feel: запускаем micro-relax по таймеру ----------
  let floatTimer = null;
  let isUserDragging = false;

  const startFloat = () => {
    stopFloat();
    floatTimer = setInterval(() => {
      if (!isUserDragging) runMicroRelax();
    }, 220); // частота "плавания"
  };

  const stopFloat = () => {
    if (floatTimer) clearInterval(floatTimer);
    floatTimer = null;
  };

  cy.ready(() => {
    // 1) сначала дерево
    setTimeout(() => {
      runTree();

      // 2) затем первый релакс чуть сильнее, чтобы раздвинуть и убрать наложения
      setTimeout(() => {
        runMicroRelax({ numIter: 180, animationDuration: 600 });
        // 3) и включаем постоянное "дыхание"
        startFloat();
      }, 120);
    }, 0);
  });

  // ---------- 4) Drag interaction ----------
  cy.nodes().grabify();

  cy.on("drag", "node", () => {
    isUserDragging = true;
  });

  cy.on("dragfree", "node", () => {
    isUserDragging = false;
    // после отпускания — чуть больше итераций для “разъезда”
    runMicroRelax({ numIter: 220, animationDuration: 450 });
  });

  // ---------- 5) Click ----------
  cy.on("tap", "node", (evt) => {
    onNodeSelect?.(evt.target.data());
  });

  // чистим таймер при уничтожении инстанса (важно, иначе утечки)
  cy.on("destroy", () => stopFloat());

  return cy;
}
