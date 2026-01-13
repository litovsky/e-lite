from __future__ import annotations

import os
from datetime import date
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import psycopg

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Put it into api/.env")

app = FastAPI(title="e-lite API")

# чтобы React (localhost:5173) мог ходить в API (localhost:8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_conn():
    # Supabase обычно требует SSL
    return psycopg.connect(DATABASE_URL)

@app.on_event("startup")
def startup():
    # создаём таблицу один раз при старте (для MVP ок)
    sql = """
    create table if not exists exercise_entries (
      id bigserial primary key,
      user_id text not null,
      exercise text not null,
      value int not null check (value >= 0),
      entry_date date not null,
      created_at timestamptz not null default now(),
      unique (user_id, exercise, entry_date)
    );
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()

class ExerciseCreate(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    exercise: str = Field(..., min_length=1, max_length=64)
    value: int = Field(..., ge=0, le=100000)
    entry_date: date

class ExerciseOut(BaseModel):
    entry_date: date
    value: int

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/exercise", status_code=201)
def upsert_exercise(payload: ExerciseCreate):
    sql = """
    insert into exercise_entries (user_id, exercise, value, entry_date)
    values (%s, %s, %s, %s)
    on conflict (user_id, exercise, entry_date)
    do update set value = excluded.value;
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (payload.user_id, payload.exercise, payload.value, payload.entry_date))
            conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    return {"saved": True}

@app.get("/exercise", response_model=list[ExerciseOut])
def list_exercise(user_id: str, exercise: str = "pushups", limit: int = 60):
    if limit < 1 or limit > 3650:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 3650")

    sql = """
    select entry_date, value
    from exercise_entries
    where user_id = %s and exercise = %s
    order by entry_date asc
    limit %s;
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (user_id, exercise, limit))
                rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    return [{"entry_date": r[0], "value": r[1]} for r in rows]
