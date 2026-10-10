from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from fastapi import HTTPException
from lastfm import get_artist
from cards import make_card

app = FastAPI()
model = SentenceTransformer("BAAI/bge-small-en-v1.5")

class EmbedRequest(BaseModel):
    texts: list[str]

@app.post("/embed")
def embed(req: EmbedRequest):
    vectors = model.encode(req.texts, normalize_embeddings=True)
    return {"embeddings": vectors.tolist()}

class EnrichRequest(BaseModel):
    name: str

@app.post("/enrich-artist")
def enrich_artist(req: EnrichRequest):
    artist = get_artist(req.name)
    if artist is None:
        raise HTTPException(status_code=404, detail="Artist not found on Last.fm")
    card = make_card(artist)
    embedding = model.encode([card], normalize_embeddings=True)[0].tolist()
    return {**artist, "card": card, "embedding": embedding}

@app.get("/health")
def health():
    return {"status": "ok"}

from concurrent.futures import ThreadPoolExecutor
import numpy as np

artist_cache: dict[str, dict] = {}   # temporary; later this lives in Postgres

def enrich_cached(name: str) -> dict | None:
    key = name.lower()
    if key not in artist_cache:
        artist = get_artist(name)
        if artist is None:
            return None
        card = make_card(artist)
        artist["card"] = card
        artist["embedding"] = model.encode([card], normalize_embeddings=True)[0]
        artist_cache[key] = artist
    return artist_cache[key]

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
        vecs.append(artist["embedding"])
        ws.append(w)
        for t in artist["tags"]:
            tag_scores[t["name"]] = tag_scores.get(t["name"], 0) + w * t["count"] / 100

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

#cd embed
#python3 -m venv .venv
#source .venv/bin/activate
#pip install -r requirements.txt
