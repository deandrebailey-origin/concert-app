from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from fastapi import HTTPException
from lastfm import get_artist, normalize_tag
from cards import make_card
from db import load_artist, save_artist, to_vec, load_events

import threading
encode_lock = threading.Lock()

def encode(texts: list[str]):
    with encode_lock:
        return model.encode(texts, normalize_embeddings=True)

app = FastAPI()
model = SentenceTransformer("BAAI/bge-small-en-v1.5", device="cpu")  # or "cuda" if you have a GPU

class EmbedRequest(BaseModel):
    texts: list[str]

@app.post("/embed")
def embed(req: EmbedRequest):
    vectors = encode(req.texts)
    return {"embeddings": vectors.tolist()}

class EnrichRequest(BaseModel):
    name: str

@app.post("/enrich-artist")
def enrich_artist(req: EnrichRequest):
    artist = enrich_cached(req.name)
    if artist is None:
        raise HTTPException(status_code=404, detail="Artist not found on Last.fm")
    return {**artist, "embedding": artist["embedding"].tolist()}

@app.get("/health")
def health():
    return {"status": "ok"}

from concurrent.futures import ThreadPoolExecutor
import numpy as np

artist_cache: dict[str, dict] = {}   # in-memory layer on top of the Postgres artists table

class ArtistIn(BaseModel):
    name: str
    rank: int
    time_range: str = "long_term"   # "short_term" or "long_term"

class ProfileRequest(BaseModel):
    artists: list[ArtistIn]

TIME_WEIGHT = {"short_term": 0.6, "long_term": 0.4}

@app.post("/build-profile")
def build_profile(req: ProfileRequest):
    # combine weights when an artist appears in both lists
    weights: dict[str, float] = {}
    for a in req.artists[:40]:
        w = (1 / (1 + a.rank / 10)) * TIME_WEIGHT.get(a.time_range, 0.4) 
        # Hyberbolic decay a weight that shrinks as rank grows but never hits zero. Heuristic chosen because it make sense
        weights[a.name] = weights.get(a.name, 0) + w

    with ThreadPoolExecutor(max_workers=5) as pool:
        enriched = dict(zip(weights, pool.map(enrich_cached, weights)))

    vecs, ws, tag_scores = [], [], {}
    for name, artist in enriched.items():
        if artist is None:
            continue
        w = weights[name]
        vec = to_vec(artist["embedding"]).reshape(-1)
        if vec.shape != (384,):   # guard: one bad embedding shouldn't crash the whole profile
            print(f"[build_profile] skipping {name}: embedding shape {vec.shape}")
            continue
        vecs.append(vec)
        ws.append(w)
        for t in artist["tags"]:
            name = normalize_tag(t["name"])   # "hip hop" and "hip-hop" count as one tag
            tag_scores[name] = tag_scores.get(name, 0) + w * t["count"] / 100

    if not vecs:
        raise HTTPException(status_code=400, detail="No artists could be enriched")

    taste = np.average(vecs, axis=0, weights=ws)
    taste = taste / np.linalg.norm(taste)   # re-normalize after averaging

    top_tags = sorted(tag_scores.items(), key=lambda x: -x[1])[:10]
    return {
        "taste_vector": taste.tolist(),
        "top_tags": [{"name": n, "score": round(s, 3)} for n, s in top_tags],
        "artists_used": [n for n, a in enriched.items() if a],
    }

class RecommendRequest(BaseModel):
    taste_vector: list[float]
    known_artists: list[str]      # the user's own artists, to exclude
    limit: int = 10

@app.post("/recommend-artists")
def recommend_artists(req: RecommendRequest):
    taste = np.array(req.taste_vector)
    known = {n.lower() for n in req.known_artists}

    # build the candidate pool from similar artists, remembering who suggested each
    because: dict[str, str] = {}
    for name in req.known_artists:
        seed = enrich_cached(name)
        if seed:
            for s in seed["similar"]:
                if s.lower() not in known:
                    because.setdefault(s, seed["name"])

    with ThreadPoolExecutor(max_workers=5) as pool:
        enriched = dict(zip(because, pool.map(enrich_cached, because)))

    scored = [
        {
            "name": a["name"],
            "score": round(float(np.dot(taste, a["embedding"])), 3),
            "because_you_like": because[name],
            "card": a["card"],
        }
        for name, a in enriched.items() if a
    ]
    scored.sort(key=lambda x: -x["score"])
    return {"recommendations": scored[: req.limit]}

from ticketmaster import get_events
import math

def popularity(listeners: int) -> float:
    """0 to 1 on a log scale: ~0.43 at 1,000 listeners, ~0.86 at 1M, capped at 1."""
    return min(math.log10((listeners or 0) + 1) / 7, 1.0)

TASTE_WEIGHT, POP_WEIGHT = 0.85, 0.15   # taste decides; popularity breaks near-ties

def unique_tags(names) -> list[str]:
    """Normalized tags with duplicates removed, order kept."""
    out: list[str] = []
    for n in names:
        t = normalize_tag(n)
        if t not in out:
            out.append(t)
    return out

def event_embedding(ev: dict):
    """Returns (embedding, tags, listeners) for an event's performer."""
    artist = enrich_cached(ev["performer"])
    if artist:
        return to_vec(artist["embedding"]), unique_tags(t["name"] for t in artist["tags"]), artist.get("listeners", 0)
    # performer unknown to Last.fm: fall back to Ticketmaster genres, zero popularity
    genres = [g for g in (ev.get("genre"), ev.get("subgenre"))
              if g and g not in ("Undefined", "Other")]
    card = f"Artist: {ev['performer']}\nGenres: {', '.join(genres) or 'unknown'}"
    vec = encode([card])[0]
    return vec, [g.lower() for g in genres], 0

class Member(BaseModel):
    name: str
    taste_vector: list[float]
    disliked_tags: list[str] = []
    weight: float = 1.0          # fairness rotation: raise for whoever compromised last time

class ScoreRequest(BaseModel):
    members: list[Member]
    limit: int = 10

def unit(x: np.ndarray) -> np.ndarray:
    """Scale vector(s) to length 1 so dot product = cosine similarity."""
    return x / np.linalg.norm(x, axis=-1, keepdims=True)

def _event_pool():
    """(events, embedded) from Neon, or a slow live fetch if ingestion hasn't run."""
    stored = load_events()
    if stored:
        events = [{k: v for k, v in e.items() if k not in ("vec", "tags", "listeners")}
                  for e in stored]
        embedded = [(e["vec"], unique_tags(e["tags"]), e["listeners"]) for e in stored]
    else:
        events = get_events(days=60, max_events=100)
        with ThreadPoolExecutor(max_workers=3) as pool:
            embedded = list(pool.map(event_embedding, events))
    return events, embedded


def _passes(ev: dict, filters: dict) -> bool:
    """Hard filters from the group's request (dates, budget)."""
    date = ev.get("date")
    if filters.get("date_from") and date and date < filters["date_from"]:
        return False
    if filters.get("date_to") and date and date > filters["date_to"]:
        return False
    price = ev.get("min_price")
    if filters.get("max_price") and price and price > filters["max_price"]:
        return False
    return True


def rank_events(members: list["Member"], limit: int,
                prompt_vector: list[float] | None = None, filters: dict | None = None):
    filters = filters or {}
    events, embedded = _event_pool()

    # mean-centering: every music embedding shares a common "this is music" direction,
    # which makes everything ~0.8 similar. Subtract the average event embedding from
    # both sides so only what makes each artist *different* is compared.
    event_vecs = np.stack([to_vec(v) for v, _, _ in embedded])
    center = event_vecs.mean(axis=0)
    event_vecs = unit(event_vecs - center)
    tastes = {m.name: unit(np.array(m.taste_vector, dtype=np.float32) - center) for m in members}
    prompt = unit(np.array(prompt_vector, dtype=np.float32) - center) if prompt_vector else None
    avoid = {a.lower() for a in filters.get("avoid", [])}

    results = []
    for ev, vec, (_, tags, listeners) in zip(events, event_vecs, embedded):
        if not _passes(ev, filters):
            continue
        tagset = {t.lower() for t in tags}
        per_member = {}
        for m in members:
            s = float(np.dot(tastes[m.name], vec))   # roughly -0.5 to 0.7 after centering
            if tagset & ({d.lower() for d in m.disliked_tags} | avoid):
                s -= 0.5                              # dislike / "not tonight" penalty
            per_member[m.name] = round(s, 3)

        ws = [m.weight for m in members]
        scores = [per_member[m.name] for m in members]
        avg = float(np.average(scores, weights=ws))
        group_taste = 0.6 * avg + 0.4 * min(scores)  # protect the least-happy member
        pop = popularity(listeners)
        if prompt is not None:
            # the host's request ("something chill this weekend") steers the taste match
            vibe = float(np.dot(prompt, vec))
            group = 0.6 * group_taste + 0.25 * vibe + POP_WEIGHT * pop
        else:
            vibe = None
            group = TASTE_WEIGHT * group_taste + POP_WEIGHT * pop

        results.append({**ev, "group_score": round(group, 3),
                        "taste_score": round(group_taste, 3),
                        "vibe_score": None if vibe is None else round(vibe, 3),
                        "popularity": round(pop, 3), "listeners": listeners,
                        "member_scores": per_member, "tags": tags[:5]})

    results.sort(key=lambda r: -r["group_score"])
    return results[:limit]


@app.post("/score-events")
def score_events(req: ScoreRequest):
    return {"events": rank_events(req.members, req.limit)}


class PlanRequest(BaseModel):
    members: list[Member]
    prompt: str
    limit: int = 8


@app.post("/plan-group")
def plan_group(req: PlanRequest):
    """Group chatbot: read the host's request, rank shows for everyone, explain each pick."""
    from planner import parse_request, explain_picks
    parsed = parse_request(req.prompt)
    vibe_text = parsed["vibe"]
    if parsed["genres"]:
        vibe_text += ". Genres: " + ", ".join(parsed["genres"])
    prompt_vector = encode([vibe_text])[0].tolist()

    events = rank_events(req.members, req.limit, prompt_vector, parsed)
    if not events and any(parsed.get(k) for k in ("date_from", "date_to", "max_price")):
        # filters too strict: relax them rather than come back empty
        events = rank_events(req.members, req.limit, prompt_vector, {"avoid": parsed["avoid"]})
        parsed["reply"] += " Nothing matched every filter, so I loosened the dates and budget."

    reasons = explain_picks(req.prompt, req.members, events)
    for ev, why in zip(events, reasons):
        ev["reason"] = why
    return {"reply": parsed["reply"], "filters": parsed, "events": events}

class GroupTestMember(BaseModel):
    name: str
    artists: list[str]
    disliked_tags: list[str] = []

@app.post("/test-group")
def test_group(members: list[GroupTestMember]):
    built = []
    for m in members:
        profile = build_profile(ProfileRequest(artists=[
            ArtistIn(name=a, rank=i + 1) for i, a in enumerate(m.artists)
        ]))
        built.append(Member(name=m.name, taste_vector=profile["taste_vector"],
                            disliked_tags=m.disliked_tags))
    return score_events(ScoreRequest(members=built))

def enrich_cached(name: str) -> dict | None:
    key = name.lower()

    # 1. fastest: already in memory this session
    if key in artist_cache:
        return artist_cache[key]

    # 2. saved in the database from an earlier run
    stored = load_artist(name)
    if stored:
        artist_cache[key] = stored
        return stored

    # 3. not seen before: enrich from Last.fm + Gemini
    artist = get_artist(name)
    if artist is None:
        return None
    card = make_card(artist)
    artist["card"] = card
    artist["embedding"] = to_vec(encode([card])[0])

    # always save, so this artist never needs enriching again.
    # fallback cards ("Sound: unknown") can be upgraded later with refresh_cards.py
    artist_cache[key] = artist
    save_artist(artist)
    return artist

#cd embed
#python3 -m venv .venv
#source .venv/bin/activate
#pip install -r requirements.txt
