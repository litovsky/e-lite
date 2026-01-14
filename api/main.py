# api/main.py
"""
e-lite backend (FastAPI)
- Reads DB connection settings from api/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSLMODE)
- Does NOT connect to DB on startup (so server doesn't crash if DB is temporarily unavailable)
- Provides health endpoints:
    GET /health         -> basic service health
    GET /health/db      -> checks DB connectivity (select now())
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import psycopg

# Load env vars from api/.env (works when uvicorn is run from api/ folder)
load_dotenv()

app = FastAPI(title="e-lite API", version="0.1.0")


def _require_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val


def get_db_settings() -> dict:
    """
    Reads DB settings from environment variables.
    Expected variables in api/.env:
      DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSLMODE
    """
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
    """
    Opens and yields a psycopg (v3) connection using keyword args.
    Using kwargs avoids issues with special characters in password.
    """
    cfg = get_db_settings()
    conn = psycopg.connect(**cfg)
    try:
        yield conn
    finally:
        conn.close()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "e-lite-api"}


@app.get("/health/db")
def health_db() -> JSONResponse:
    """
    Checks DB connectivity. If DB is down/misconfigured, returns ok=false with error details.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("select now();")
                now = cur.fetchone()[0]
        return JSONResponse({"ok": True, "db": "connected", "now": str(now)}, status_code=200)
    except Exception as e:
        # Do not crash the app; just report the error.
        return JSONResponse({"ok": False, "db": "error", "error": str(e)}, status_code=503)
