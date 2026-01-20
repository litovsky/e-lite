import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const API_BASE = "http://127.0.0.1:8000";

function Card({ title, value }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, minWidth: 150 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default function PushupsStats({ userId = "arseniy", refreshKey = 0 }) {
  const [stats, setStats] = useState(null);
  const [series, setSeries] = useState([]);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const totalLastDays = useMemo(
    () => series.reduce((acc, x) => acc + (x.reps || 0), 0),
    [series]
  );

  async function fetchStats(u = userId) {
    const r = await fetch(`${API_BASE}/pushups/stats?user_id=${encodeURIComponent(u)}`);
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    setStats(j);
  }

  async function fetchDaily(u = userId, d = days) {
    const r = await fetch(
      `${API_BASE}/pushups/daily?user_id=${encodeURIComponent(u)}&days=${encodeURIComponent(d)}`
    );
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    setSeries(j.items || []);
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchStats(userId), fetchDaily(userId, days)]);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey]);

  useEffect(() => {
    // когда меняем период — перезагружаем серию
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchDaily(userId, days);
      } catch (e) {
        setError(String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>Отжимания</div>
          <div style={{ fontSize: 12, color: "#666" }}>user_id: {userId}</div>
        </div>

        <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
          <option value={7}>7 дней</option>
          <option value={14}>14 дней</option>
          <option value={30}>30 дней</option>
          <option value={90}>90 дней</option>
          <option value={365}>365 дней</option>
        </select>
      </div>

      {error ? (
        <div style={{ padding: 10, borderRadius: 12, border: "1px solid #f1c3c3", color: "crimson" }}>
          Ошибка: {error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Card title="Сегодня" value={stats ? stats.today_reps : "—"} />
        <Card title="Всего" value={stats ? stats.total_reps : "—"} />
        <Card title="Рекорд" value={stats ? stats.best_reps : "—"} />
        <Card title="Записей" value={stats ? stats.records_count : "—"} />
        <Card title={`Сумма за ${days} дней`} value={series.length ? totalLastDays : "—"} />
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
          График по дням {loading ? "(обновляю...)" : ""}
        </div>

        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="reps" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <button
        onClick={refreshAll}
        style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer", fontWeight: 800 }}
      >
        Обновить
      </button>
    </div>
  );
}
