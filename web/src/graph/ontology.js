// src/graph/ontology.js
// Ontology v0.1 — канон графа (без UI и без user-state)

export const REL = /** @type {const} */ ({
  REQUIRES: "requires",
  SUPPORTS: "supports",
  PART_OF: "part_of",
  MEASURES: "measures",
});

export const NODE_KIND = /** @type {const} */ ({
  CORE: "core",
  DOMAIN: "domain",
  PROBLEM: "problem",
  SKILL: "skill",
  ACTION: "action",
  METRIC: "metric",
  TOOL: "tool",
});

export function makeNode({ id, label, kind, domain, description, tags }) {
  if (!id || typeof id !== "string") throw new Error("Node.id is required");
  if (!label || typeof label !== "string") throw new Error("Node.label is required");
  if (!kind || typeof kind !== "string") throw new Error("Node.kind is required");

  return {
    id,
    label,
    kind,
    ...(domain ? { domain } : {}),
    ...(description ? { description } : {}),
    ...(tags?.length ? { tags } : {}),
  };
}

export function makeEdge({ id, source, target, rel }) {
  if (!id || typeof id !== "string") throw new Error("Edge.id is required");
  if (!source || typeof source !== "string") throw new Error("Edge.source is required");
  if (!target || typeof target !== "string") throw new Error("Edge.target is required");
  if (!rel || typeof rel !== "string") throw new Error("Edge.rel is required");

  return { id, source, target, rel };
}

/**
 * Валидирует канонический граф:
 * - уникальность node.id и edge.id
 * - все ссылки ребер существуют
 * - rel и kind из белых списков
 * - нет дублей (source,target,rel)
 * - нет циклов по requires (DAG)
 *
 * @param {{nodes:any[], edges:any[]}} graph
 * @returns {{ok:true} | {ok:false, errors:string[]}}
 */
export function validateOntology(graph) {
  const errors = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  const kindSet = new Set(Object.values(NODE_KIND));
  const relSet = new Set(Object.values(REL));

  const nodeIds = new Set();
  const nodeById = new Map();

  for (const n of nodes) {
    if (!n?.id || typeof n.id !== "string") {
      errors.push("Node without valid id");
      continue;
    }
    if (nodeIds.has(n.id)) errors.push(`Duplicate node.id: ${n.id}`);
    nodeIds.add(n.id);
    nodeById.set(n.id, n);

    if (!n.label) errors.push(`Node ${n.id} missing label`);
    if (!kindSet.has(n.kind)) errors.push(`Node ${n.id} has invalid kind: ${n.kind}`);
  }

  const edgeIds = new Set();
  const edgeSig = new Set();

  for (const e of edges) {
    if (!e?.id || typeof e.id !== "string") {
      errors.push("Edge without valid id");
      continue;
    }
    if (edgeIds.has(e.id)) errors.push(`Duplicate edge.id: ${e.id}`);
    edgeIds.add(e.id);

    if (!nodeById.has(e.source)) errors.push(`Edge ${e.id} source not found: ${e.source}`);
    if (!nodeById.has(e.target)) errors.push(`Edge ${e.id} target not found: ${e.target}`);
    if (!relSet.has(e.rel)) errors.push(`Edge ${e.id} has invalid rel: ${e.rel}`);

    const sig = `${e.source}__${e.target}__${e.rel}`;
    if (edgeSig.has(sig)) errors.push(`Duplicate edge (source,target,rel): ${sig}`);
    edgeSig.add(sig);
  }

  // cycles in requires
  const reqAdj = new Map(); // a -> [b] where a requires b (a -> b)
  for (const nId of nodeIds) reqAdj.set(nId, []);
  for (const e of edges) {
    if (e?.rel === REL.REQUIRES) {
      if (reqAdj.has(e.source)) reqAdj.get(e.source).push(e.target);
    }
  }

  // DFS cycle detect
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(Array.from(nodeIds, (id) => [id, WHITE]));

  const dfs = (v, stack) => {
    color.set(v, GRAY);
    stack.push(v);

    for (const to of reqAdj.get(v) ?? []) {
      const c = color.get(to);
      if (c === GRAY) {
        // cycle found
        const idx = stack.indexOf(to);
        const cycle = stack.slice(idx).concat(to).join(" -> ");
        errors.push(`Requires cycle: ${cycle}`);
        continue;
      }
      if (c === WHITE) dfs(to, stack);
    }

    stack.pop();
    color.set(v, BLACK);
  };

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) dfs(id, []);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
