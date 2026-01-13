import os
from dotenv import load_dotenv
import psycopg

load_dotenv()

host = os.getenv("DB_HOST")
port = int(os.getenv("DB_PORT", "5432"))
dbname = os.getenv("DB_NAME", "postgres")
user = os.getenv("DB_USER")
password = os.getenv("DB_PASSWORD")
sslmode = os.getenv("DB_SSLMODE", "require")

print("Connecting to:", f"host={host} port={port} dbname={dbname} user={user} sslmode={sslmode}")

with psycopg.connect(
    host=host,
    port=port,
    dbname=dbname,
    user=user,
    password=password,
    sslmode=sslmode,
) as conn:
    with conn.cursor() as cur:
        cur.execute("select now();")
        print("OK:", cur.fetchone())
