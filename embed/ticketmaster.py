import os
from datetime import datetime, timedelta, timezone
import httpx
from dotenv import load_dotenv

load_dotenv("../.env")
KEY = os.getenv("TICKETMASTER_API_KEY")
URL = "https://app.ticketmaster.com/discovery/v2/events.json"

# listings in the "music" category that aren't actually concerts
JUNK_WORDS = ("parking", "vip", "package", "upgrade", "shuttle", "locker",
              "add-on", "gift card", "voucher", "camping", "hotel")


def is_junk(name: str) -> bool:
    n = name.lower()
    return any(w in n for w in JUNK_WORDS)


def full_address(venue: dict) -> str | None:
    """'1490 E Lake Buena Vista Dr, Orlando, FL 32830' so calendars and maps can find it."""
    parts = [
        venue.get("address", {}).get("line1"),
        venue.get("city", {}).get("name"),
        " ".join(x for x in (venue.get("state", {}).get("stateCode"), venue.get("postalCode")) if x),
    ]
    return ", ".join(p for p in parts if p) or None


def get_event_details(event_id: str) -> dict | None:
    """Start time, prices and venue address for one event (used by refresh_times.py)."""
    r = httpx.get(f"https://app.ticketmaster.com/discovery/v2/events/{event_id}.json",
                  params={"apikey": KEY}, timeout=15)
    if r.status_code != 200:
        return None
    e = r.json()
    prices = e.get("priceRanges") or [{}]
    venue = e.get("_embedded", {}).get("venues", [{}])[0]
    return {
        "time": e.get("dates", {}).get("start", {}).get("localTime"),
        "min_price": prices[0].get("min"),
        "max_price": prices[0].get("max"),
        "venue_tm_id": venue.get("id"),
        "address": full_address(venue),
    }


def get_events(lat=28.6024, lng=-81.2001, radius=40, days=60,
               max_events=400, page_size=100, sort="date,asc") -> list[dict]:
    """Upcoming music events near UCF within the next `days` days.

    sort="date,asc" gives the soonest shows; sort="relevance,desc" gives the biggest.
    """
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days)
    fmt = "%Y-%m-%dT%H:%M:%SZ"

    events, page = [], 0
    while len(events) < max_events:
        params = {
            "apikey": KEY, "latlong": f"{lat},{lng}", "radius": radius,
            "unit": "miles", "classificationName": "music",
            "startDateTime": now.strftime(fmt), "endDateTime": end.strftime(fmt),
            "size": page_size, "page": page, "sort": sort,
        }
        data = httpx.get(URL, params=params, timeout=15).json()
        batch = data.get("_embedded", {}).get("events", [])
        if not batch:
            break

        for e in batch:
            if is_junk(e["name"]):
                continue
            attractions = e.get("_embedded", {}).get("attractions", [])
            venue = e.get("_embedded", {}).get("venues", [{}])[0]
            cls = (e.get("classifications") or [{}])[0]
            prices = e.get("priceRanges") or [{}]
            loc = venue.get("location", {})
            events.append({
                "id": e["id"],
                "name": e["name"],
                "performer": attractions[0]["name"] if attractions else e["name"],
                "genre": cls.get("genre", {}).get("name"),
                "subgenre": cls.get("subGenre", {}).get("name"),
                "date": e.get("dates", {}).get("start", {}).get("localDate"),
                "time": e.get("dates", {}).get("start", {}).get("localTime"),   # "19:30:00" or None
                "min_price": prices[0].get("min"),
                "max_price": prices[0].get("max"),
                "url": e.get("url"),
                "venue": {
                    "tm_id": venue.get("id"),
                    "name": venue.get("name"),
                    "address": full_address(venue),
                    "lat": float(loc["latitude"]) if loc.get("latitude") else None,
                    "lng": float(loc["longitude"]) if loc.get("longitude") else None,
                },
            })

        total_pages = data.get("page", {}).get("totalPages", 1)
        page += 1
        if page >= total_pages:
            break
    return events[:max_events]


UCF = (28.6024, -81.2001)
LOCAL_MILES = 40        # everything within this range, big or small
ROAD_TRIP_MILES = 250   # beyond local, only the biggest shows (Tampa, Jacksonville, Miami...)


def miles_from_ucf(lat, lng) -> float | None:
    """Straight-line distance in miles (haversine)."""
    if lat is None or lng is None:
        return None
    from math import asin, cos, radians, sin, sqrt
    la1, lo1, la2, lo2 = map(radians, (UCF[0], UCF[1], lat, lng))
    h = sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2
    return round(3958.8 * 2 * asin(sqrt(h)), 1)


def get_event_pool() -> list[dict]:
    """Local shows (soonest + biggest within 40 mi) + road-trip shows (biggest within 250 mi).
    Road-trip shows are filtered again by artist popularity in ingest_events.py."""
    local_soon = get_events(radius=LOCAL_MILES, days=60, max_events=300, sort="date,asc")
    local_big = get_events(radius=LOCAL_MILES, days=180, max_events=300, sort="relevance,desc")
    road_big = get_events(radius=ROAD_TRIP_MILES, days=180, max_events=500, sort="relevance,desc")

    seen, pool = set(), []
    for ev in local_soon + local_big + road_big:
        if ev["id"] in seen:
            continue
        seen.add(ev["id"])
        ev["distance_mi"] = miles_from_ucf(ev["venue"]["lat"], ev["venue"]["lng"])
        ev["road_trip"] = (ev["distance_mi"] or 0) > LOCAL_MILES
        pool.append(ev)
    return pool


if __name__ == "__main__":
    evs = get_events()
    print(f"{len(evs)} events (soonest, next 60 days)")
    for ev in evs[:10]:
        print(ev["date"], "|", ev["performer"], "|", ev["genre"], "|", ev["venue"]["name"])
