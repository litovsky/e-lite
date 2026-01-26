import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

function isoTodayUTC() {
  // Так же, как в бэке: (now() at time zone 'utc')::date
  return new Date().toISOString().slice(0, 10);
}

function isValidISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseCreatedAtToISODate(createdAt) {
  // created_at приходит строкой (ISO-ish). Берём первые 10 символов YYYY-MM-DD.
  if (typeof createdAt !== "string") return null;
  const d = createdAt.slice(0, 10);
  return isValidISODate(d) ? d : null;
}

function addDays(iso, delta) {
  const dt = new Date(iso + "T00:00:00.000Z");
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function daysBetweenInclusive(startISO, endISO) {
  const a = new Date(startISO + "T00:00:00.000Z");
  const b = new Date(endISO + "T00:00:00.000Z");
  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / 86400000);
  return days + 1;
}

function computeStreak(daysMap, todayISO) {
  // daysMap: Map<YYYY-MM-DD, repsSumForDay>
  let streak = 0;
  let cur = todayISO;
  while (true) {
    const v = daysMap.get(cur) ?? 0;
    if (v > 0) {
      streak += 1;
      cur = addDays(cur, -1);
    } else {
      break;
    }
  }
  return streak;
}

function sumLastNDays(daysMap, todayISO, n) {
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = addDays(todayISO, -i);
    sum += daysMap.get(d) ?? 0;
  }
  return sum;
}

export default function ExerciseDashboard({ userId = "arseniy", refreshKey = 0 }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]); // raw rows from API: {id,user_id,reps,created_at}
  const [inputReps, setInputReps] = useState("");

  // загрузка логов
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr("");
      try {
        const url = `${API_BASE}/pushups?user_id=${encodeURIComponent(userId)}&limit=500`;
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok || !j?.ok) {
          throw new Error(j?.error || `HTTP ${r.status}`);
        }
        if (!alive) return;
        setItems(Array.isArray(j.items) ? j.items : []);
      } catch (e) {
        if (!alive) return;
        setErr(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [userId, refreshKey]);

  // агрегируем по дням (UTC-дата из created_at)
  const { days, daysMap, maxDayValue } = useMemo(() => {
    const map = new Map(); // date -> sum reps that day
    for (const it of items) {
      const d = parseCreatedAtToISODate(it.created_at);
      if (!d) continue;
      const reps = Number(it.reps) || 0;
      map.set(d, (map.get(d) ?? 0) + reps);
    }
    const dates = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    let max = 1;
    for (const d of dates) {
      max = Math.max(max, map.get(d) ?? 0);
    }
    return { days: dates, daysMap: map, maxDayValue: max };
  }, [items]);

  const todayISO = isoTodayUTC();

  const metrics = useMemo(() => {
    const todayReps = daysMap.get(todayISO) ?? 0;

    const last7Total = sumLastNDays(daysMap, todayISO, 7);
    const last14Total = sumLastNDays(daysMap, todayISO, 14);
    const streakDays = computeStreak(daysMap, todayISO);

    // простая оценка состояния
    let status = "red";
    if (last7Total > 0) status = "yellow";
    if (last7Total >= Math.floor(last14Total / 2) && streakDays >= 3) status = "green";

    const statusText =
      status === "green" ? "🟢 стабильно" : status === "yellow" ? "🟡 нестабильно" : "🔴 нет регулярности";

    const nextActionText =
      status === "red"
        ? "Сделай минимум сегодня (например, 10) и начни серию 3 дня подряд."
        : status === "yellow"
        ? "Цель: 3 дня подряд без пропусков. Минимум — хоть 5–10, но ежедневно."
        : "Подними планку: +5 к среднему дню или добавь второй подход 2–3 раза в неделю.";

    return { todayReps, last7Total, last14Total, streakDays, status, statusText, nextActionText };
  }, [daysMap, todayISO]);

  const last14DaysList = useMemo(() => {
    // хотим показывать всегда “последние 14 календарных дней”, даже если записей не было
    const out = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = addDays(todayISO, -i);
      out.push({ date: d, reps: daysMap.get(d) ?? 0 });
    }
    return out;
  }, [daysMap, todayISO]);

  async function addToday() {
    setErr("");
    const n = Number(inputReps);
    if (!Number.isFinite(n) || n <= 0) return;

    try {
      const r = await fetch(`${API_BASE}/pushups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, reps: n }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      // перезагрузим список (быстро, без внешнего refreshKey)
      setInputReps("");
      // оптимистично добавим в items (чтобы UI сразу обновился)
      const p = j.pushup;
      if (p?.created_at) {
        setItems((prev) => [p, ...prev]);
      } else {
        // если вдруг структура не та — просто принудительно обновим
        // (самый простой вариант: дернуть refreshKey на уровне App, но тут оставим локально)
      }
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  const badgeStyle = useMemo(() => {
    const bg =
      metrics.status === "green" ? "#eaf7ee" : metrics.status === "yellow" ? "#fff7e6" : "#ffecec";
    const br =
      metrics.status === "green" ? "#bfe6c9" : metrics.status === "yellow" ? "#ffd59a" : "#ffb3b3";
    return {
      background: bg,
      border: `1px solid ${br}`,
      padding: "6px 10px",
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontSize: 12,
    };
  }, [metrics.status]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h4 style={{ margin: 0 }}>Отжимания</h4>

      {/* статус + метрики */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div style={badgeStyle}>{metrics.statusText}</div>
          <div style={{ fontSize: 12, color: "#666" }}>user: {userId}</div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Сегодня</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{metrics.todayReps}</div>
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Серия (дней подряд)</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{metrics.streakDays}</div>
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Сумма за 7 дней</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{metrics.last7Total}</div>
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Сумма за 14 дней</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{metrics.last14Total}</div>
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Следующий шаг</div>
          <div style={{ marginTop: 6 }}>{metrics.nextActionText}</div>
        </div>
      </div>

      {/* ввод */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={inputReps}
          onChange={(e) => setInputReps(e.target.value)}
          placeholder="например, 30"
          style={{ width: 140, padding: 6 }}
        />
        <button onClick={addToday}>Записать сегодня</button>
        <div style={{ fontSize: 12, color: "#666" }}>{todayISO} (UTC)</div>
      </div>

      {err && (
        <div style={{ color: "#b00020", fontSize: 12, whiteSpace: "pre-wrap" }}>
          Ошибка: {err}
        </div>
      )}

      {/* график по дням (последние 14 календарных) */}
      <div>
        {loading ? (
          <p style={{ color: "#666" }}>Загрузка…</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {last14DaysList.map((x) => (
              <div key={x.date} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 90, fontSize: 12, color: "#555" }}>{x.date}</div>
                <div style={{ flex: 1, height: 10, background: "#eee", borderRadius: 6 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round((x.reps / Math.max(1, maxDayValue)) * 100)}%`,
                      background: "#3498db",
                      borderRadius: 6,
                      transition: "width 120ms ease",
                    }}
                  />
                </div>
                <div style={{ width: 40, textAlign: "right" }}>{x.reps}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
