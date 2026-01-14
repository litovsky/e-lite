import { useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

export default function PushupsForm({ userId = "arseniy", onCreated }) {
  const [reps, setReps] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);

    const n = Number(reps);
    if (!Number.isFinite(n) || n <= 0) {
      setMsg({ type: "error", text: "Введите число больше 0" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/pushups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, reps: n }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setReps("");
      setMsg({ type: "ok", text: `Записано: ${data.pushup.reps}` });
      onCreated?.(data.pushup);
    } catch (err) {
      setMsg({ type: "error", text: String(err.message || err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
      <h3 style={{ marginTop: 0 }}>Отжимания — добавить запись</h3>

      <form onSubmit={submit} style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="number"
          min="1"
          step="1"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="Например: 30"
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", width: 180 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
        >
          {loading ? "Сохраняю..." : "Добавить"}
        </button>
      </form>

      {msg && (
        <div style={{ marginTop: 12 }}>
          <span style={{ fontWeight: 600 }}>
            {msg.type === "ok" ? "✅ " : "❌ "}
          </span>
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}
