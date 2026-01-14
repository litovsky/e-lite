# api/main.py
from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import date
from typing import Iterator, Optional, List, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import psycopg

load_dotenv()

app = FastAPI(title="e-lite API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val


def get_db_settings() -> dict:
    host = _require_env("DB_HOST")
    port = int(os.getenv("DB_PORT", "5432"))
    dbname = os.getenv("DB_NAME", "postgres")
    user = _require_env("DB_USER")
    password = _require_env("DB_PASSWORD")
    sslmode = os.getenv("DB_SSLMODE", "require")
    return {
        "host": host,
        "port": port,
        "dbname": dbname,
        "user": user,
        "password": password,
        "sslmode": sslmode,
    }


@contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    cfg = get_db_settings()
    conn = psycopg.connect(**cfg)
    try:
        yield conn
    finally:
        conn.close()


# ---------- Models ----------
class PushupCreate(BaseModel):
    user_id: str = Field(default="arseniy", min_length=1)
    reps: int = Field(gt=0, le=10000)


class PushupRow(BaseModel):
    id: int
    user_id: str
    reps: int
    created_at: str  # ISO string


# ---------- Health ----------
@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "e-lite-api"}


@app.get("/health/db")
def health_db() -> JSONResponse:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("select now();")
                now = cur.fetchone()[0]
        return JSONResponse({"ok": True, "db": "connected", "now": str(now)}, status_code=200)
    except Exception as e:
        return JSONResponse({"ok": False, "db": "error", "error": str(e)}, status_code=503)


# ---------- Pushups API ----------
@app.post("/pushups")
def create_pushup(payload: PushupCreate) -> JSONResponse:
    """
    Adds one pushups record.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into public.pushups (user_id, reps)
                    values (%s, %s)
                    returning id, user_id, reps, created_at;
                    """,
                    (payload.user_id, payload.reps),
                )
                row = cur.fetchone()
            conn.commit()

        data = {
            "id": row[0],
            "user_id": row[1],
            "reps": row[2],
            "created_at": str(row[3]),
        }
        return JSONResponse({"ok": True, "pushup": data}, status_code=201)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/pushups")
def list_pushups(
    user_id: str = Query(default="arseniy"),
    limit: int = Query(default=50, ge=1, le=500),
) -> JSONResponse:
    """
    Returns last N records for a user.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, user_id, reps, created_at
                    from public.pushups
                    where user_id = %s
                    order by created_at desc
                    limit %s;
                    """,
                    (user_id, limit),
                )
                rows = cur.fetchall()

        items = [
            {"id": r[0], "user_id": r[1], "reps": r[2], "created_at": str(r[3])}
            for r in rows
        ]
        return JSONResponse({"ok": True, "items": items}, status_code=200)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/pushups/stats")
def pushups_stats(user_id: str = Query(default="arseniy")) -> JSONResponse:
    """
    Basic stats:
    - total reps (all-time)
    - best reps in a single record
    - total reps today
    - records count
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select
                      coalesce(sum(reps), 0) as total_reps,
                      coalesce(max(reps), 0) as best_reps,
                      count(*)::int as records_count
                    from public.pushups
                    where user_id = %s;
                    """,
                    (user_id,),
                )
                total_reps, best_reps, records_count = cur.fetchone()

                cur.execute(
                    """
                    select coalesce(sum(reps), 0) as today_reps
                    from public.pushups
                    where user_id = %s
                      and created_at::date = (now() at time zone 'utc')::date;
                    """,
                    (user_id,),
                )
                today_reps = cur.fetchone()[0]

        return JSONResponse(
            {
                "ok": True,
                "user_id": user_id,
                "total_reps": int(total_reps),
                "best_reps": int(best_reps),
                "today_reps": int(today_reps),
                "records_count": int(records_count),
            },
            status_code=200,
        )
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
