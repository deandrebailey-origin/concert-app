import os
import httpx
from dotenv import load_dotenv

load_dotenv("../.env")
KEY = os.getenv("TICKETMASTER_API_KEY")
URL = "https://app.ticketmaster.com/discovery/v2/events.json"

def get_events(lat=28.6024, lng=-81.2001, radius=40, size=50) -> list[dict]:
    """Upcoming music events near UCF by default."""
    params = {
        "apikey": KEY, "latlong": f"{lat},{lng}", "radius": radius,
        "unit": "miles", "classificationName": "music",
        "size": size, "sort": "date,asc",
    }
    data = httpx.get(URL, params=params, timeout=15).json()
    events = []
    for e in data.get("_embedded", {}).get("events", []):
        attractions = e.get("_embedded", {}).get("attractions", [])
        venue = e.get("_embedded", {}).get("venues", [{}])[0]
        cls = (e.get("classifications") or [{}])[0]
        prices = e.get("priceRanges") or [{}]
        events.append({
            "id": e["id"],
            "name": e["name"],
            "performer": attractions[0]["name"] if attractions else e["name"],
            "genre": cls.get("genre", {}).get("name"),
            "subgenre": cls.get("subGenre", {}).get("name"),
            "venue": venue.get("name"),
            "date": e.get("dates", {}).get("start", {}).get("localDate"),
            "min_price": prices[0].get("min"),
            "url": e.get("url"),
        })
    return events

if __name__ == "__main__":
    for ev in get_events()[:10]:
        print(ev["date"], "|", ev["performer"], "|", ev["genre"], "|", ev["venue"])