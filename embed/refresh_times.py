"""Fill in show times, prices and full venue addresses for events already in Neon.
Only calls Ticketmaster (no Gemini, no re-embedding).  Run:  python refresh_times.py"""
import time

from db import get_conn
from ticketmaster import get_event_details

with get_conn() as conn:
    ids = [r[0] for r in conn.execute(
        "SELECT tm_id FROM events WHERE starts_at IS NULL OR starts_at >= current_date")]
    print(f"Refreshing {len(ids)} events...")

    timed = priced = 0
    for i, tm_id in enumerate(ids, 1):
        d = get_event_details(tm_id)
        time.sleep(0.25)                 # stay under Ticketmaster's 5 requests/second limit
        if not d:
            continue
        conn.execute(
            """UPDATE events SET start_time = %s,
                      min_price = COALESCE(%s, min_price), max_price = COALESCE(%s, max_price)
               WHERE tm_id = %s""",
            (d["time"], d["min_price"], d["max_price"], tm_id),
        )
        if d["venue_tm_id"] and d["address"]:
            conn.execute("UPDATE venues SET address = %s WHERE tm_id = %s", (d["address"], d["venue_tm_id"]))
        timed += bool(d["time"])
        priced += d["min_price"] is not None
        if i % 25 == 0 or i == len(ids):
            conn.commit()
            print(f"  [{i}/{len(ids)}]")
    conn.commit()

print(f"Done: {timed} with start times, {priced} with prices.")
