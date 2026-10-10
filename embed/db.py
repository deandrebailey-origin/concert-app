import os
import json
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

def to_vec(v) -> np.ndarray:
    """Turn whatever pgvector hands back into a flat float32 array of 384 numbers.
    Depending on version it can be a numpy array, a pgvector Vector object, or a string."""
    if isinstance(v, str):
        return np.array(json.loads(v), dtype=np.float32)
    if hasattr(v, "to_numpy"):
        return v.to_numpy().astype(np.float32)
    return np.asarray(v, dtype=np.float32)

def load_artist(name: str) -> dict | None:
    """Look up an already-enriched artist. Returns None if not saved yet."""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT name, mbid, tags, similar_artists, bio, card, embedding, listeners
               FROM artists WHERE lower(name) = lower(%s)""",
            (name,),
        ).fetchone()
    if row is None or row[6] is None:
        return None          # missing or half-saved row: re-enrich instead
    return {
        "name": row[0],
        "mbid": row[1],
        "tags": row[2] or [],
        "similar": row[3] or [],
        "bio": row[4] or "",
        "card": row[5],
        "embedding": to_vec(row[6]),
        "listeners": row[7] or 0,
    }

def save_artist(artist: dict) -> None:
    """Insert a new artist, or update it if the name already exists."""
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO artists (name, mbid, tags, similar_artists, bio, card, embedding, listeners)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (name) DO UPDATE SET
                 mbid = EXCLUDED.mbid,
                 tags = EXCLUDED.tags,
                 similar_artists = EXCLUDED.similar_artists,
                 bio = EXCLUDED.bio,
                 card = EXCLUDED.card,
                 embedding = EXCLUDED.embedding,
                 listeners = EXCLUDED.listeners,
                 updated_at = now()""",
            (
                artist["name"],
                artist.get("mbid"),
                Jsonb(artist["tags"]),
                artist["similar"],
                artist["bio"],
                artist["card"],
                artist["embedding"],
                artist.get("listeners", 0),
            ),
        )
        conn.commit()

# ---------- events + venues ----------
from datetime import date

def save_venue(conn, v: dict) -> int | None:
    """Insert or update a venue by its Ticketmaster id; returns our venues.id."""
    if not v or not v.get("tm_id"):
        return None
    return conn.execute(
        """INSERT INTO venues (tm_id, name, address, lat, lng)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (tm_id) DO UPDATE SET
             name = EXCLUDED.name, address = EXCLUDED.address,
             lat = EXCLUDED.lat, lng = EXCLUDED.lng
           RETURNING id""",
        (v["tm_id"], v.get("name"), v.get("address"), v.get("lat"), v.get("lng")),
    ).fetchone()[0]

def save_event(conn, ev: dict, venue_id, vec, tags: list[str], listeners: int) -> None:
    """Insert or update an event by its Ticketmaster id."""
    conn.execute(
        """INSERT INTO events (tm_id, name, performer, venue_id, starts_at, min_price,
                               genre, subgenre, tags, embedding, url, listeners)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (tm_id) DO UPDATE SET
             name = EXCLUDED.name, performer = EXCLUDED.performer,
             venue_id = EXCLUDED.venue_id, starts_at = EXCLUDED.starts_at,
             min_price = EXCLUDED.min_price, genre = EXCLUDED.genre,
             subgenre = EXCLUDED.subgenre, tags = EXCLUDED.tags,
             embedding = EXCLUDED.embedding, url = EXCLUDED.url,
             listeners = EXCLUDED.listeners""",
        (ev["id"], ev["name"], ev["performer"], venue_id,
         date.fromisoformat(ev["date"]) if ev.get("date") else None,
         ev.get("min_price"), ev.get("genre"), ev.get("subgenre"),
         tags, to_vec(vec), ev.get("url"), listeners),
    )

def existing_event_ids(conn) -> set[str]:
    return {r[0] for r in conn.execute("SELECT tm_id FROM events WHERE embedding IS NOT NULL")}

def load_events() -> list[dict]:
    """All upcoming events with embeddings, in the same shape get_events() returns,
    plus vec / tags / listeners for scoring."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT e.tm_id, e.name, e.performer, e.genre, e.subgenre, e.starts_at,
                      e.min_price, e.url, e.tags, e.embedding, e.listeners,
                      v.tm_id, v.name, v.address, v.lat, v.lng
               FROM events e LEFT JOIN venues v ON v.id = e.venue_id
               WHERE e.embedding IS NOT NULL
                 AND (e.starts_at IS NULL OR e.starts_at >= current_date)
               ORDER BY e.starts_at"""
        ).fetchall()
    return [{
        "id": r[0], "name": r[1], "performer": r[2], "genre": r[3], "subgenre": r[4],
        "date": r[5].isoformat() if r[5] else None, "min_price": r[6], "url": r[7],
        "tags": r[8] or [], "vec": to_vec(r[9]), "listeners": r[10] or 0,
        "venue": {"tm_id": r[11], "name": r[12], "address": r[13], "lat": r[14], "lng": r[15]},
    } for r in rows]

if __name__ == "__main__":
    with get_conn() as conn:
        version = conn.execute("SELECT version()").fetchone()[0]
        print("Connected!", version.split(",")[0])