import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";

export default function ForceGraphCanvas({
  graph,
  onNodeSelect,
  wheelSensitivity = 10,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  // Кеш позиций между обновлениями graph (статусы меняются → позиции сохраняем)
  const posRef = useRef(new Map()); // id -> {x,y,vx,vy}

  const data = useMemo(() => {
    const nodes = (graph?.nodes ?? []).map((n) => ({ ...n }));
    const links = (graph?.edges ?? []).map((e) => ({
      ...e,
      source: e.source,
      target: e.target,
    }));

    // восстановим позиции (если узел уже был)
    const prev = posRef.current;
    for (const n of nodes) {
      const p = prev.get(n.id);
      if (p) {
        n.x = p.x;
        n.y = p.y;
        n.vx = p.vx;
        n.vy = p.vy;
      }
    }

    return { nodes, links };
  }, [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const byId = new Map(data.nodes.map((n) => [n.id, n]));

    /* ================= SIZE / DPI ================= */
    let w = 1;
    let h = 1;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const setSize = () => {
      const rect = wrap.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      // рисуем в CSS-пикселях
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const clear = () => ctx.clearRect(0, 0, w, h);

    /* ================= HELPERS: TOOLS ================= */
    const isToolNode = (n) => n?.kind === "tool" || n?.isTool === true;

    const isToolEdge = (e) => {
      if (e?.isTool === true || e?.rel === "tool") return true;

      const s = typeof e.source === "object" ? e.source : byId.get(e.source);
      const t = typeof e.target === "object" ? e.target : byId.get(e.target);

      return isToolNode(s) || isToolNode(t);
    };

    /* ================= STYLE ================= */
    const nodeFill = (n) => {
      if (isToolNode(n)) return "#6c7a89";
      if (n.id === "surviving") return "#111";
      if (n.status === "learned") return "#3498db";
      if (n.status === "locked") return "#95a5a6";
      if (n.status === "unlocked") return "#f1c40f";
      return "#2ecc71";
    };

    const nodeAlpha = (n) => {
      if (n.id === "surviving") return 1;
      if (isToolNode(n)) return 0.75;
      if (n.status === "learned") return 1;
      if (n.status === "locked") return 0.12;
      return 0.4;
    };

    const edgeAlpha = (l) => {
      if (isToolEdge(l)) return 0.35;

      const s = typeof l.source === "object" ? l.source : byId.get(l.source);
      const t = typeof l.target === "object" ? l.target : byId.get(l.target);
      if (!s || !t) return 0.05;

      const sOk = s.id === "surviving" || s.status === "learned";
      const tOk = t.id === "surviving" || t.status === "learned";

      if (sOk && tOk) return 0.7;
      if (s.status === "locked" || t.status === "locked") return 0.08;
      return 0.15;
    };

    const nodeRadius = (n) =>
      n.id === "surviving" ? 46 : isToolNode(n) ? 24 : 39;

    /* ================= CAMERA ================= */
    let transform = d3.zoomIdentity;
    let zoomEnabled = true;

    const zoom = d3
      .zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (e) => {
        transform = e.transform;
        draw();
      });

    const enableZoom = () => {
      if (zoomEnabled) return;
      d3.select(canvas).call(zoom).call(zoom.transform, transform);
      zoomEnabled = true;
    };

    const disableZoom = () => {
      if (!zoomEnabled) return;
      d3.select(canvas).on(".zoom", null);
      zoomEnabled = false;
    };

    d3.select(canvas).call(zoom);

    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const base = e.deltaY > 0 ? 0.92 : 1.08;
      const k = Math.pow(base, wheelSensitivity / 2);

      d3.select(canvas).call(zoom.scaleBy, k, [px, py]);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });

    /* ================= DRAW ================= */
    function draw() {
      clear();
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // edges
      for (const l of data.links) {
        const s = typeof l.source === "object" ? l.source : byId.get(l.source);
        const t = typeof l.target === "object" ? l.target : byId.get(l.target);
        if (!s || !t) continue;

        ctx.globalAlpha = edgeAlpha(l);
        ctx.strokeStyle = isToolEdge(l) ? "#6c7a89" : "#27ae60";
        ctx.lineWidth = isToolEdge(l) ? 1.5 : 2;

        if (isToolEdge(l)) ctx.setLineDash([6, 6]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(s.x ?? 0, s.y ?? 0);
        ctx.lineTo(t.x ?? 0, t.y ?? 0);
        ctx.stroke();

        ctx.setLineDash([]);
      }

      // nodes
      for (const n of data.nodes) {
        const x = n.x ?? 0;
        const y = n.y ?? 0;
        const r = nodeRadius(n);
        const a = nodeAlpha(n);

        ctx.save();
        ctx.globalAlpha = a;

        ctx.shadowColor = isToolNode(n)
          ? "rgba(0,0,0,0.10)"
          : "rgba(0,0,0,0.18)";
        ctx.shadowBlur = isToolNode(n) ? 8 : 12;
        ctx.shadowOffsetY = isToolNode(n) ? 4 : 6;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = nodeFill(n);
        ctx.fill();
        ctx.restore();

        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = isToolNode(n) ? 1.5 : 2;
        ctx.stroke();

        ctx.globalAlpha = a;
        ctx.font = isToolNode(n) ? "12px system-ui" : "14px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = n.id === "surviving" ? "#fff" : "#111";
        ctx.fillText(n.label ?? n.id, x, y);
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* ================= INIT ================= */
    setSize();
    window.addEventListener("resize", setSize);

    if (!data.nodes.length) return;

    // Если позиций нет вообще — стартовая раскладка
    const hasAnyPosition = data.nodes.some(
      (n) => Number.isFinite(n.x) && Number.isFinite(n.y)
    );

    if (!hasAnyPosition) {
      const R = 220;
      data.nodes.forEach((n, i) => {
        const a = (i / data.nodes.length) * Math.PI * 2;
        n.x = Math.cos(a) * R;
        n.y = Math.sin(a) * R;
      });

      // фиксируем surviving в (0,0)
      const core = byId.get("surviving");
      if (core) {
        core.fx = 0;
        core.fy = 0;
      }

      // центрируем камеру один раз при ПЕРВОЙ загрузке
      transform = d3.zoomIdentity.translate(w / 2, h / 2).scale(1);
      d3.select(canvas).call(zoom.transform, transform);
    } else {
      // core всегда фиксирован
      const core = byId.get("surviving");
      if (core) {
        core.fx = 0;
        core.fy = 0;
      }
    }

    /* ================= SIMULATION ================= */
    const sim = d3
      .forceSimulation(data.nodes)
      .force(
        "link",
        d3
          .forceLink(data.links)
          .id((d) => d.id)
          .distance((l) => (isToolEdge(l) ? 110 : 190))
          .strength((l) => (isToolEdge(l) ? 0.35 : 0.6))
      )
      .force(
        "charge",
        d3.forceManyBody().strength((n) => (isToolNode(n) ? -550 : -950))
      )
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((n) =>
            n.id === "surviving" ? 54 : isToolNode(n) ? 30 : 46
          )
      )
      .force("x", d3.forceX(0).strength(0.03))
      .force("y", d3.forceY(0).strength(0.03))
      .alpha(1)
      .alphaDecay(0.03)
      .velocityDecay(0.35);

    /* ================= HIT TEST / DRAG ================= */
    const screenToWorld = (sx, sy) => ({
      x: (sx - transform.x) / transform.k,
      y: (sy - transform.y) / transform.k,
    });

    const findNodeAt = (sx, sy) => {
      const { x, y } = screenToWorld(sx, sy);
      for (let i = data.nodes.length - 1; i >= 0; i--) {
        const n = data.nodes[i];
        const r = nodeRadius(n);
        const dx = x - (n.x ?? 0);
        const dy = y - (n.y ?? 0);
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    };

    let dragging = null;
    let downAt = null; // {sx,sy}
    const CLICK_EPS = 4; // px в screen coords

    const onPointerDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      downAt = { sx, sy };

      const n = findNodeAt(sx, sy);
      if (!n) {
        enableZoom();
        return;
      }

      dragging = n;
      disableZoom();

      const p = screenToWorld(sx, sy);
      n.fx = p.x;
      n.fy = p.y;

      sim.alpha(0.25).restart();
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const p = screenToWorld(sx, sy);
      dragging.fx = p.x;
      dragging.fy = p.y;
    };

    const onPointerUp = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const dx = downAt ? sx - downAt.sx : 999;
      const dy = downAt ? sy - downAt.sy : 999;
      const isClick = dx * dx + dy * dy <= CLICK_EPS * CLICK_EPS;

      const clicked = isClick ? findNodeAt(sx, sy) : null;
      if (clicked) onNodeSelect?.({ ...clicked });

      if (dragging) {
        if (dragging.id !== "surviving") {
          dragging.fx = null;
          dragging.fy = null;
        }
        dragging = null;
        enableZoom();

        // мягко “успокоить” симуляцию, чтобы не отыгрывала назад
        sim.alphaTarget(0);
        sim.alpha(0.12).restart();
      }

      downAt = null;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // сохраняем позиции на каждом тике
    sim.on("tick", () => {
      const store = posRef.current;
      for (const n of data.nodes) {
        store.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
      }
      draw();
    });

    draw();

    return () => {
      sim.stop();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", setSize);
    };
  }, [data, onNodeSelect, wheelSensitivity]);

  return (
    <div
      ref={wrapRef}
      style={{ width: "100%", height: "100%", background: "#f5f5f5" }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
}
