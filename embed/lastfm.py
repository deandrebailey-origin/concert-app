import os, re
import httpx
from dotenv import load_dotenv

load_dotenv("../.env")
API_KEY = os.getenv("LASTFM_API_KEY")
BASE = "https://ws.audioscrobbler.com/2.0/"

JUNK_TAGS = {
    "seen live", "favorites", "favourite", "favorite", "my favorite",
    "american", "british", "usa", "male vocalists", "female vocalists",
    "00s", "10s", "20s", "90s", "80s", "70s", "awesome", "love", "beautiful",
}

def _get(params: dict) -> dict:
    params = {**params, "api_key": API_KEY, "format": "json", "autocorrect": 1}
    r = httpx.get(BASE, params=params, timeout=10)
    r.raise_for_status()
    return r.json()

def clean_bio(text: str) -> str:
    text = re.sub(r"<a [^>]*>.*?</a>", "", text or "")  # remove "Read more on Last.fm" link
    return text.strip()

def get_artist(name: str) -> dict | None:
    info = _get({"method": "artist.getinfo", "artist": name})
    if "error" in info:
        return None
    a = info["artist"]

    top = _get({"method": "artist.gettoptags", "artist": name})
    tags = [
        {"name": t["name"].lower(), "count": int(t["count"])}
        for t in top.get("toptags", {}).get("tag", [])
        if t["name"].lower() not in JUNK_TAGS and int(t["count"]) >= 10
    ][:10]

    similar = [s["name"] for s in a.get("similar", {}).get("artist", [])]

    return {
        "name": a["name"],          # corrected name, e.g. "frnak ocean" -> "Frank Ocean"
        "mbid": a.get("mbid"),
        "tags": tags,
        "similar": similar,
        "bio": clean_bio(a.get("bio", {}).get("summary", "")),
    }

if __name__ == "__main__":
    import json
    for artist in ["SZA", "Metallica", "Bad Bunny", "frank ocean"]:
        print(json.dumps(get_artist(artist), indent=2))