"""One-time script: fill in Last.fm listener counts for artists saved before
the listeners column existed. Safe to re-run; it only touches NULL rows."""
from db import get_conn
from lastfm import get_artist

with get_conn() as conn:
    names = [r[0] for r in conn.execute("SELECT name FROM artists WHERE listeners IS NULL")]
    print(f"Backfilling {len(names)} artists...")
    for name in names:
        info = get_artist(name)
        listeners = info["listeners"] if info else 0   # 0 = not on Last.fm, so we don't retry forever
        conn.execute("UPDATE artists SET listeners = %s WHERE name = %s", (listeners, name))
        print(f"  {name}: {listeners:,}")
    conn.commit()
print("Done.")
