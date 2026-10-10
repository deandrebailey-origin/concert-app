import os
import psycopg
from pgvector.psycopg import register_vector
from dotenv import load_dotenv

load_dotenv("../.env")

def get_conn():
    conn = psycopg.connect(os.getenv("DATABASE_URL"))
    conn.execute("CREATE EXTENSION IF NOT EXISTS vector")  # make sure vector exists before registering
    register_vector(conn)
    return conn

if __name__ == "__main__":
    with get_conn() as conn:
        version = conn.execute("SELECT version()").fetchone()[0]
        print("Connected!", version.split(",")[0])