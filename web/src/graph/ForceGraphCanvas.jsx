import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";

export default function ForceGraphCanvas({
  graph,
  onNodeSelect,
  wheelSensitivity = 10,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  const nodesCount = graph?.nodes?.length ?? 0;
  const edgesCount = graph?.edges?.length ?? 0;

  const data = useMemo(() => {
    const nodes = (graph?.nodes ?? []).map((n) => ({ ...n }));
    const links = (graph?.edges ?? []).map((e) => ({
      ...e,
      source: e.source,
      target: e.target,
    }));
    return { nodes, links };
  }, [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const byId = new Map(data.nodes.map((n) => [n.id, n]));

    // --- size ---
    let w = 1;
    let h = 1;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const setSize = () => {
      const rect = wrap.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);

      // CSS размер в px (важно!)
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      // рисуем в CSS-пикселях
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // ✅ FIX: clear должен быть объявлен ДО draw()
    const clear = () => {
      ctx.clearRect(0, 0, w, h);
    };

    // --- draw ---
    const nodeFill = (n) => {
      if (n.id === "surviving") return "#111";
      if (n.status === "learned") return "#3498db";
      if (n.status === "locked") return "#95a5a6";
      if (n.status === "unlocked") return "#f1c40f";
      return "#2ecc71";
    };

    let t = d3.zoomIdentity.translate(w / 2, h / 2).scale(1);

    function draw() {
      if (w < 50 || h < 50) return;

      clear();

      // фон
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      // edges
      ctx.strokeStyle = "#27ae60";
      ctx.lineWidth = 2;

      for (const l of data.links) {
        const s = typeof l.source === "object" ? l.source : byId.get(l.source);
        const tg = typeof l.target === "object" ? l.target : byId.get(l.target);
        if (!s || !tg) continue;

        ctx.beginPath();
        ctx.moveTo(s.x ?? 0, s.y ?? 0);
        ctx.lineTo(tg.x ?? 0, tg.y ?? 0);
        ctx.stroke();
      }

      // nodes
      for (const n of data.nodes) {
        const x = n.x ?? 0;
        const y = n.y ?? 0;
        const r = n.id === "surviving" ? 46 : 39;

        // тень + заливка
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.18)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = nodeFill(n);
        ctx.fill();
        ctx.restore();

        // обводка
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // текст
        ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = n.id === "surviving" ? "#fff" : "#111";
        ctx.fillText(n.label ?? n.id, x, y);
      }

      ctx.restore();
    }

    // --- ResizeObserver ---
    const ro = new ResizeObserver(() => {
      setSize();
      draw();
    });
    ro.observe(wrap);

    setSize();

    // Если узлов нет — показываем сообщение на канвасе и выходим
    if (!data.nodes.length) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#b00020";
      ctx.font = "16px system-ui";
      ctx.fillText("NO NODES (graph.nodes.length === 0)", 16, 32);
      ctx.fillStyle = "#333";
      ctx.font = "14px system-ui";
      ctx.fillText("Проверь graph.json / computeGraphState()", 16, 56);

      return () => {
        ro.disconnect();
      };
    }

    // --- initial positions (кольцо) ---
    const R = 220;
    data.nodes.forEach((n, i) => {
      const a = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
      n.x = Math.cos(a) * R;
      n.y = Math.sin(a) * R;
    });

    // --- fix core ---
    const core = byId.get("surviving");
    if (core) {
      core.fx = 0;
      core.fy = 0;
    }

    // --- zoom/pan ---
    const zoom = d3
      .zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        t = event.transform;
        draw();
      });

    d3.select(canvas).call(zoom).call(zoom.transform, t);

    const onWheel = (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;

      const base = ev.deltaY > 0 ? 0.92 : 1.08;
      const k = Math.pow(base, wheelSensitivity / 2);

      d3.select(canvas).call(zoom.scaleBy, k, [px, py]);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // --- simulation ---
    const sim = d3
      .forceSimulation(data.nodes)
      .force(
        "link",
        d3
          .forceLink(data.links)
          .id((d) => d.id)
          .distance((l) => {
            const lbl = l.label || l.type;
            if (lbl === "поддерживает" || lbl === "supports") return 240;
            return 180;
          })
          .strength(0.6)
      )
      .force("charge", d3.forceManyBody().strength(-900))
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((n) => (n.id === "surviving" ? 54 : 46))
          .strength(0.9)
      )
      .force("x", d3.forceX(0).strength(0.03))
      .force("y", d3.forceY(0).strength(0.03))
      .alpha(1)
      .alphaDecay(0.02);

    // --- helpers for picking ---
    const screenToWorld = (sx, sy) => {
      const x = (sx - t.x) / t.k;
      const y = (sy - t.y) / t.k;
      return { x, y };
    };

    const findNodeAt = (sx, sy) => {
      const { x, y } = screenToWorld(sx, sy);
      for (let i = data.nodes.length - 1; i >= 0; i--) {
        const n = data.nodes[i];
        const r = n.id === "surviving" ? 46 : 39;
        const dx = x - (n.x ?? 0);
        const dy = y - (n.y ?? 0);
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    };

    // --- drag ---
    let dragging = null;
    let zoomEnabled = true;

    const disableZoom = () => {
      if (!zoomEnabled) return;
      d3.select(canvas).on(".zoom", null);
      zoomEnabled = false;
    };
    const enableZoom = () => {
      if (zoomEnabled) return;
      d3.select(canvas).call(zoom).call(zoom.transform, t);
      zoomEnabled = true;
    };

    const onDown = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;

      const n = findNodeAt(sx, sy);
      if (!n) return;

      dragging = n;
      disableZoom();

      sim.alphaTarget(0.2).restart();
      const { x, y } = screenToWorld(sx, sy);
      n.fx = x;
      n.fy = y;
    };

    const onMove = (ev) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;

      const { x, y } = screenToWorld(sx, sy);
      dragging.fx = x;
      dragging.fy = y;
    };

    const onUp = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;

      const clicked = findNodeAt(sx, sy);
      if (clicked) onNodeSelect?.({ ...clicked });

      if (dragging) {
        if (dragging.id !== "surviving") {
          dragging.fx = null;
          dragging.fy = null;
        }
        dragging = null;
        sim.alphaTarget(0);
        enableZoom();
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    sim.on("tick", draw);
    draw();

    return () => {
      ro.disconnect();
      sim.stop();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [data, onNodeSelect, wheelSensitivity]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "#f5f5f5",
        overflow: "hidden",
      }}
    >
      {/* overlay — виден всегда */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 10,
          padding: "6px 8px",
          background: "rgba(255,255,255,0.9)",
          border: "1px solid #ddd",
          borderRadius: 8,
          fontSize: 12,
          pointerEvents: "none",
        }}
      >
        ForceGraphCanvas mounted
        <br />
        nodes: {nodesCount} | edges: {edgesCount}
      </div>

      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          background: "#fff",
          outline: "2px solid rgba(255,0,0,0.18)",
        }}
      />
    </div>
  );
}
