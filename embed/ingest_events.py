"""Load the event pool into Neon: venues + events with embeddings and popularity.

Run from embed/ with the venv active:
    python ingest_events.py          # only new events (fast re-runs)
    python ingest_events.py --all    # re-embed everything

Safe to stop with Ctrl+C and re-run; it saves as it goes and skips finished events.
"""
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from ticketmaster import get_event_pool
from db import get_conn, save_venue, save_event, existing_event_ids
from main import event_embedding   # same Last.fm + Gemini + embedding logic the API uses

redo_all = "--all" in sys.argv
start = time.time()

print("Fetching event pool from Ticketmaster...")
pool = get_event_pool()
print(f"  {len(pool)} events (soonest 60 days + biggest 6 months)")

with get_conn() as conn:
    # drop shows that already happened
    gone = conn.execute("DELETE FROM events WHERE starts_at < current_date").rowcount
    conn.commit()
    if gone:
        print(f"  removed {gone} past events")

    done = set() if redo_all else existing_event_ids(conn)
    todo = [ev for ev in pool if ev["id"] not in done]
    print(f"  {len(pool) - len(todo)} already saved, {len(todo)} to process\n")

    saved = failed = 0
    # 3 workers: enough to overlap network calls without tripping Gemini rate limits
    with ThreadPoolExecutor(max_workers=3) as workers:
        def safe_embed(ev):
            try:
                return event_embedding(ev)
            except Exception as e:          # one bad event shouldn't kill the run
                print(f"  ! {ev['performer'][:40]}: {e}")
                return None

        for i, (ev, out) in enumerate(zip(todo, workers.map(safe_embed, todo)), 1):
            if out is None:
                failed += 1
                continue
            vec, tags, listeners = out
            venue_id = save_venue(conn, ev["venue"])
            save_event(conn, ev, venue_id, vec, tags, listeners)
            saved += 1
            if i % 10 == 0 or i == len(todo):
                conn.commit()               # checkpoint so Ctrl+C keeps progress
                print(f"  [{i}/{len(todo)}] {ev['date']}  {ev['performer'][:40]}")
        conn.commit()

    total = conn.execute("SELECT count(*) FROM events WHERE starts_at >= current_date").fetchone()[0]
    venues = conn.execute("SELECT count(*) FROM venues").fetchone()[0]

print(f"\nDone in {time.time() - start:.0f}s: saved {saved}, failed {failed}.")
print(f"Database now has {total} upcoming events across {venues} venues.")
