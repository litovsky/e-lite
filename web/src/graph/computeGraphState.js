export function computeGraphState(graph, learnedSet) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const isSatisfied = (reqId) => {
    const reqNode = nodeById.get(reqId);
    if (!reqNode) return false;
    return learnedSet.has(reqId) || reqNode.status === "base";
  };

  const computedNodes = graph.nodes.map((n) => {
    if (learnedSet.has(n.id)) return { ...n, status: "learned" };
    if (n.status === "base") return n;

    const reqs = Array.isArray(n.requires) ? n.requires : [];
    if (reqs.length > 0) {
      const ok = reqs.every(isSatisfied);
      return { ...n, status: ok ? "unlocked" : "locked" };
    }
    return n;
  });

  const labelById = new Map(
    computedNodes.map((n) => [n.id, n.label ?? n.id])
  );

  return { computedNodes, labelById };
}
