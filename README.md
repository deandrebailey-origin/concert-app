# Concert App (Knight Hacks IX)

Find concerts your whole friend group will actually enjoy.

Users build a **music taste profile** (from Spotify, a screenshot, or by typing their taste), get matched with people who share their taste, and ask for shows in plain language, like *"find a show for me, @maya and @jordan next weekend under $50."* The app pulls real upcoming concerts from Ticketmaster, ranks them for everyone in the group, and explains why each pick is fair.

---

## What's built so far

The **embedding / AI service** (`embed/`) is working:

| Endpoint | What it does | Status |
|---|---|---|
| `POST /embed` | Turns a list of texts into 384-number vectors | ✅ Done |
| `POST /enrich-artist` | Artist name → Last.fm tags + similar artists → Gemini-written artist card → embedding | ✅ Done |
| `POST /build-profile` | A user's ranked artists → one weighted **taste vector** + top genre tags | ✅ Done |
| `POST /recommend-artists` | Taste vector → new artists to discover, with "because you like X" | ✅ Done |
| `POST /recommend-from-artists` | Test shortcut: artist names → recommendations in one call | ✅ Done |
| `POST /score-events` | Scores real Ticketmaster concerts for one person or a group | 🔜 Next |
| `POST /parse-profile` | Typed taste ("love SZA, hate country, under $60") → structured profile | 🔜 Planned |
| `POST /parse-screenshot` | Spotify Wrapped / top-artists screenshot → artist list | 🔜 Planned |

Supporting files:
- `embed/lastfm.py`: fetches artist info, weighted tags, and similar artists from Last.fm; filters out junk tags ("seen live", "favorites", decades).
- `embed/cards.py`: has Gemini write a short, sound-focused **artist card**. It retries when Gemini is overloaded and falls back to a basic card built from Last.fm data, so requests never crash.

---

## How the pieces fit together

```
Next.js (UI + API routes)
    |-- Neon Auth and Postgres (users, profiles, events, vectors)
    |-- FastAPI embed service (embeddings and music recommendations)
    -- Outside APIs (Last.fm, Ticketmaster, Gemini, etc.)
```

### Next.js site and API
- The Next.js app serves the UI and same-origin API routes under `app/api/`.
- The Certifi sign-in page is implemented in `frontend/pages/` and mounted at `/` by `app/page.tsx`.
- Neon Managed Auth handles email/password and Google/GitHub OAuth through `app/api/auth/[...path]/route.ts`; user, session, and provider-account records are managed by Neon Auth in its `neon_auth` schema.
- Browser requests use routes such as `GET /api/health`, `POST /api/build-profile`, and `POST /api/score-events`.
- These routes proxy embedding work to FastAPI at `EMBED_SERVICE_URL`; the Python service is not called directly by browser code.
- Neon Auth and server-side database access belong in the Next.js server layer. The shared schema is in `db/schema.sql`.

### Neon Managed Auth setup
1. Enable Neon Auth for the Neon project/branch. `neon.ts` already sets `auth: true`; complete the provider setup in Neon so managed auth provisions its `neon_auth` schema.
2. Copy `.env.example` to `.env.local` and configure `NEON_AUTH_BASE_URL` with the Neon Auth endpoint and `NEON_AUTH_COOKIE_SECRET` with a unique random secret of at least 32 characters. Keep that secret private.
3. Configure Google and/or GitHub OAuth credentials in Neon Auth. Add the deployed site origin as an allowed redirect/trusted origin. Neon Auth's provider callback URLs are `{NEON_AUTH_BASE_URL}/callback/google` and `{NEON_AUTH_BASE_URL}/callback/github`.
4. Start Next.js with `npm run dev`. The custom sign-in page uses the same-origin `/api/auth/*` handler, so browser code does not connect directly to the Neon Auth endpoint.

Neon Managed Auth currently supports Google and GitHub social sign-in. Discord is not available as a managed provider; the UI therefore offers GitHub in its place. OAuth buttons require the corresponding provider credentials to be configured in Neon.

### Next.js → Embed service
- Next.js sends embedding and recommendation requests to the Python service over HTTP.
- Locally, the embed service runs on `http://127.0.0.1:8000`. Set `EMBED_SERVICE_URL` to a reachable private service URL in production.

---

## The embed service, explained

The embed service is a small Python web server whose job is to turn music into math.

1. **Embeddings:** an embedding model converts text into a list of 384 numbers that captures its meaning. Similar artists get similar numbers, so "how close are these two vectors?" means "how similar is this music?"
2. **Model:** [`BAAI/bge-small-en-v1.5`](https://huggingface.co/BAAI/bge-small-en-v1.5) from Hugging Face, an open-source model that is small, fast, and runs on a laptop. Vectors are normalized, so similarity is a simple dot product.
3. **Artist cards:** instead of embedding just a name, we embed a structured card:
   ```
   Artist: SZA
   Genres: rnb, soul, alternative rnb, electronic, neo-soul
   Sound: Soulful vocals over atmospheric beats
   Mood: Intimate, sultry, introspective
   Similar to: Summer Walker, Doja Cat, Kali Uchis, Victoria Monét, Mariah the Scientist
   Era: 2010s
   ```
   Cards describe how the music **sounds**, which makes matching much better than names alone.
4. **Taste profiles:** a user's vector is a **weighted average** of their artists' vectors:
   - Rank weight: `1 / (1 + rank / 10)` (a tunable heuristic: #1 matters most, #20 still counts)
   - Time weight: short-term (recent) × 0.6, long-term (all-time) × 0.4
   - Artists appearing in both lists get their weights added together
5. **Dislikes are filters, not vectors:** embeddings don't understand "not," so "I hate country" is stored as a tag to penalize, never embedded.
6. **Group scoring (planned):** we don't average people's tastes. We score every concert for every member, then combine:
   `group score = 0.6 × average member score + 0.4 × lowest member score`
   This protects whoever likes the pick least. Fairness weights boost whoever compromised last time.

Why Python here: the embedding model lives in Python's machine-learning ecosystem (`sentence-transformers`, PyTorch). Next.js handles the site and its API routes while Python stays focused on embedding and recommendation work.

---

## Tool choices and alternatives

### Web app and API: Next.js + TypeScript
- The App Router serves the site and defines HTTP handlers in `app/api/*/route.ts`.
- The handlers provide a same-origin boundary for browser requests and proxy Python-specific work to FastAPI.
- Neon Auth and Neon Postgres integration run in the Next.js server environment.

### Embed service: Python + FastAPI
- **FastAPI:** automatic request validation (Pydantic) and free interactive docs at `/docs`.
- **sentence-transformers:** loads Hugging Face embedding models in a few lines.
- **Alternatives:** Flask (simpler, no auto-validation), calling Hugging Face's hosted Inference API instead of running the model locally (no local compute, but depends on network and rate limits).

### Database: Neon (Postgres + pgvector)
**Why:**
- **One database for everything:** normal tables (users, events, venues) and vector search in the same place.
- **pgvector** finds the nearest vectors with a single SQL query, with indexes for speed.
- **Neon** is serverless Postgres with a free tier, a web SQL editor, and branching. It's also a Knight Hacks IX sponsor prize.

**Alternatives:**

| Option | Pros | Cons |
|---|---|---|
| **Supabase** | Postgres + pgvector + built-in auth and storage | Slightly more setup; auth overlaps with our Spotify flow |
| **Tiger Data** (Postgres-based) | Postgres you already know, strong for time-series data; MLH prize at this event | Vector features differ from plain pgvector; check docs |
| **MongoDB Atlas** | Flexible documents + Atlas Vector Search | Different query language; joins are harder |
| **Dedicated vector DB** (Pinecone, Qdrant, Weaviate) | Built for huge-scale vector search | Second database to manage; overkill for a hackathon |
| **SQLite** | Zero setup, single file | No built-in vector search; not great for multiple teammates |

### Outside data sources
- **Spotify Web API:** user top artists/tracks. Development Mode allows only 5 pre-added users, and genres now come back empty, so it's one of three import options (with screenshot and typed taste).
- **Last.fm API:** artist bios, weighted genre tags, similar artists.
- **Gemini API:** writes artist cards, parses typed profiles, reads screenshots, powers the @mention agent.
- **Ticketmaster Discovery API:** upcoming concerts by location, date, and genre.
- **Google Places API:** venue ratings, photos, and accessibility info.

---

## Running the embed service locally

```bash
cd embed
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

Then open **http://127.0.0.1:8000/docs** to test every endpoint in the browser.

### Environment variables (`.env` in the project root, never committed)

```
DATABASE_URL=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8080/auth/spotify/callback
TICKETMASTER_API_KEY=
LASTFM_API_KEY=
GOOGLE_PLACES_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
HF_TOKEN=
EMBED_SERVICE_URL=http://127.0.0.1:8000
```

---

## Project structure

```
concert-app/
├── app/                Next.js App Router and API routes
│   └── api/            Same-origin proxies to FastAPI
├── db/                 PostgreSQL schema
├── embed/              Python embedding + AI service
│   ├── main.py         FastAPI endpoints
│   ├── lastfm.py       Last.fm fetching + tag cleanup
│   └── cards.py        Gemini artist cards with retry + fallback
├── package.json        Next.js and Neon dependencies/scripts
├── neon.ts             Neon configuration
└── .env.example        required environment variables
```

---

## Next steps
1. `/score-events`: score real Ticketmaster concerts for a person or group.
2. Tag cleanup: merge synonyms ("r&b" → "rnb") and drop non-genre tags.
3. `/parse-profile` and `/parse-screenshot`: the two non-Spotify ways to import taste.
4. Next.js server features: authentication, profile storage, and embed-service calls.
5. Site UI: profile screen, @mention search, and concert cards with venue info.
6. Pre-enrich all demo artists and events so the demo never depends on live API speed.
