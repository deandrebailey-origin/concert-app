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

# one spelling per genre: "hip hop" / "hiphop" / "Hip-Hop" all become "hip-hop"
TAG_ALIASES = {
    "hiphop": "hip-hop", "rnb": "r&b", "randb": "r&b", "rhythmandblues": "r&b",
    "alternativernb": "alternative r&b", "altrnb": "alternative r&b", "contemporaryrnb": "contemporary r&b",
    "neosoul": "neo-soul", "lofi": "lo-fi", "lofihiphop": "lo-fi hip-hop", "kpop": "k-pop", "jpop": "j-pop",
    "electronica": "electronic", "poprap": "pop rap", "cloudrap": "cloud rap", "indiepop": "indie pop",
    "indierock": "indie rock", "altrock": "alternative rock", "alternativerock": "alternative rock",
    "drumandbass": "drum and bass", "dnb": "drum and bass", "edm": "edm", "trap": "trap",
}


def _tag_key(name: str) -> str:
    """'Hip Hop', 'hip-hop' and 'HipHop' all become 'hiphop'; 'R&B' becomes 'rnb'."""
    key = re.sub(r"[\s\-_/.]+", "", name.lower()).replace("&", "and")
    return key.replace("randb", "rnb")


def normalize_tag(name: str) -> str:
    """Canonical lowercase tag name, so synonyms and spelling variants collapse into one."""
    clean = re.sub(r"\s+", " ", name.lower().strip())
    return TAG_ALIASES.get(_tag_key(clean), clean)


def merge_tags(tags: list[dict]) -> list[dict]:
    """Normalize tag names and merge duplicates, keeping the strongest count."""
    merged: dict[str, int] = {}
    for t in tags:
        n = normalize_tag(t["name"])
        merged[n] = max(merged.get(n, 0), int(t["count"]))
    return [{"name": n, "count": c} for n, c in sorted(merged.items(), key=lambda x: -x[1])]


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
    tags = merge_tags([
        {"name": t["name"], "count": int(t["count"])}
        for t in top.get("toptags", {}).get("tag", [])
        if t["name"].lower() not in JUNK_TAGS and int(t["count"]) >= 10
    ])[:10]

    similar = [s["name"] for s in a.get("similar", {}).get("artist", [])]

    return {
        "name": a["name"],          # corrected name, e.g. "frnak ocean" -> "Frank Ocean"
        "mbid": a.get("mbid"),
        "tags": tags,
        "similar": similar,
        "bio": clean_bio(a.get("bio", {}).get("summary", "")),
        "listeners": int(a.get("stats", {}).get("listeners", 0) or 0),  # popularity signal
    }

if __name__ == "__main__":
    import json
    for artist in ["SZA", "Metallica", "Bad Bunny", "frank ocean"]:
        print(json.dumps(get_artist(artist), indent=2))