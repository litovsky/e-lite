// src/graph/computeGraphState.js
// State = user-layer (learned/unlocked/locked) поверх онтологии (nodes+edges)

export function computeGraphState(graph, learnedSet) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  const learned = learnedSet instanceof Set ? learnedSet : new Set(learnedSet || []);

  const labelById = new Map(nodes.map((n) => [n.id, n.label]));

  // requires: source -> [target...]
  const requiresById = new Map();
  for (const n of nodes) requiresById.set(n.id, []);

  for (const e of edges) {
    if (e?.rel === "requires") {
      if (!requiresById.has(e.source)) requiresById.set(e.source, []);
      requiresById.get(e.source).push(e.target);
    }
  }

  // helper: all requirements learned?
  const isUnlocked = (id) => {
    const reqs = requiresById.get(id) || [];
    return reqs.every((r) => learned.has(r));
  };

  const computedNodes = nodes.map((n) => {
    const reqs = requiresById.get(n.id) || [];
    let status = "base";

    // core/domain всегда видны; но блокировки считаем для всех одинаково
    if (learned.has(n.id)) status = "learned";
    else if (reqs.length > 0 && !isUnlocked(n.id)) status = "locked";
    else if (reqs.length > 0 && isUnlocked(n.id)) status = "unlocked";
    else status = "base";

    return {
      ...n,
      requires: reqs, // <-- computed from edges (single source of truth)
      status,
    };
  });

  return { computedNodes, labelById };
}
