import { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

export default function PushupsStats({ userId = "arseniy", refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/pushups/stats?user_id=${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey]);

  return (
    <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
      <h3 style={{ marginTop: 0 }}>Статистика</h3>

      {loading && <div>Загрузка...</div>}
      {err && <div style={{ color: "crimson" }}>Ошибка: {err}</div>}

      {data && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Stat label="Сегодня" value={data.today_reps} />
          <Stat label="Всего" value={data.total_reps} />
          <Stat label="Лучший сет" value={data.best_reps} />
          <Stat label="Записей" value={data.records_count} />
        </div>
      )}

      <button
        onClick={load}
        style={{ marginTop: 12, padding: "8px 12px", borderRadius: 10, border: "1px solid #ccc" }}
      >
        Обновить
      </button>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ minWidth: 140, padding: 12, borderRadius: 12, border: "1px solid #eee" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
