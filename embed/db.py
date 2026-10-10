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

from psycopg.types.json import Jsonb
import numpy as np

def load_artist(name: str) -> dict | None:
    """Look up an already-enriched artist. Returns None if not saved yet."""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT name, mbid, tags, similar_artists, bio, card, embedding
               FROM artists WHERE lower(name) = lower(%s)""",
            (name,),
        ).fetchone()
    if row is None:
        return None
    return {
        "name": row[0],
        "mbid": row[1],
        "tags": row[2] or [],
        "similar": row[3] or [],
        "bio": row[4] or "",
        "card": row[5],
        "embedding": np.array(row[6]),
    }

def save_artist(artist: dict) -> None:
    """Insert a new artist, or update it if the name already exists."""
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO artists (name, mbid, tags, similar_artists, bio, card, embedding)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (name) DO UPDATE SET
                 mbid = EXCLUDED.mbid,
                 tags = EXCLUDED.tags,
                 similar_artists = EXCLUDED.similar_artists,
                 bio = EXCLUDED.bio,
                 card = EXCLUDED.card,
                 embedding = EXCLUDED.embedding,
                 updated_at = now()""",
            (
                artist["name"],
                artist.get("mbid"),
                Jsonb(artist["tags"]),
                artist["similar"],
                artist["bio"],
                artist["card"],
                artist["embedding"],
            ),
        )
        conn.commit()

if __name__ == "__main__":
    with get_conn() as conn:
        version = conn.execute("SELECT version()").fetchone()[0]
        print("Connected!", version.split(",")[0])