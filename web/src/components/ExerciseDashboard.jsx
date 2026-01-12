import { useEffect, useMemo, useState } from "react";
import { loadExercises, saveExercises } from "../storage/exerciseStore";

export default function ExerciseDashboard() {
  const [entries, setEntries] = useState(() => loadExercises());
  const [pushups, setPushups] = useState("");

  useEffect(() => {
    saveExercises(entries);
  }, [entries]);

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => a.date.localeCompare(b.date));
  }, [entries]);

  const max = useMemo(() => {
    return Math.max(1, ...sorted.map((x) => x.pushups));
  }, [sorted]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <h4 style={{ marginTop: 12 }}>Отжимания</h4>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={pushups}
          onChange={(e) => setPushups(e.target.value)}
          placeholder="например, 30"
          style={{ width: 120, padding: 6 }}
        />
        <button
          onClick={() => {
            const n = Number(pushups);
            if (!Number.isFinite(n) || n <= 0) return;

            const next = entries.filter((x) => x.date !== today);
            next.push({ date: today, pushups: n });
            setEntries(next);
            setPushups("");
          }}
        >
          Записать сегодня
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        {sorted.length === 0 ? (
          <p style={{ color: "#666" }}>Пока нет записей.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {sorted.slice(-14).map((x) => (
              <div key={x.date} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 90, fontSize: 12, color: "#555" }}>{x.date}</div>
                <div style={{ flex: 1, height: 10, background: "#eee", borderRadius: 6 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round((x.pushups / max) * 100)}%`,
                      background: "#3498db",
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div style={{ width: 40, textAlign: "right" }}>{x.pushups}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
