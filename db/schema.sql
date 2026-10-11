CREATE EXTENSION IF NOT EXISTS vector;

-- app users, linked to Neon Auth by auth_id
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  auth_id     TEXT UNIQUE,          -- user id from Neon Auth
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  avatar_data TEXT,                 -- user-selected PNG/JPEG data URL
  area        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT;

CREATE TABLE IF NOT EXISTS spotify_accounts (
  user_id        INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  spotify_id     TEXT UNIQUE,
  access_token   TEXT,
  refresh_token  TEXT,
  expires_at     TIMESTAMPTZ
);

-- shared by all users: one row per artist, enriched once
CREATE TABLE IF NOT EXISTS artists (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  mbid        TEXT,
  tags        JSONB,                -- [{"name": "rnb", "count": 100}, ...]
  similar_artists     TEXT[],
  bio         TEXT,
  card        TEXT,
  embedding   vector(384),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_artists (
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  artist_id   INT REFERENCES artists(id) ON DELETE CASCADE,
  rank        INT,
  time_range  TEXT,                 -- short_term / long_term
  source      TEXT,                 -- spotify / screenshot / typed
  PRIMARY KEY (user_id, artist_id, time_range)
);

CREATE TABLE IF NOT EXISTS taste_profiles (
  user_id          INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  taste_vector     vector(384),
  top_tags         JSONB,           -- {"rnb": 1.34, "soul": 1.01, ...}
  disliked_genres  TEXT[],
  max_price        INT,
  venue_pref       TEXT,
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venues (
  id        SERIAL PRIMARY KEY,
  tm_id     TEXT UNIQUE,
  name      TEXT,
  address   TEXT,
  lat       DOUBLE PRECISION,
  lng       DOUBLE PRECISION,
  place_id  TEXT,
  rating    REAL,
  size      TEXT                    -- small / medium / arena
);

CREATE TABLE IF NOT EXISTS events (
  id         SERIAL PRIMARY KEY,
  tm_id      TEXT UNIQUE,
  name       TEXT,
  performer  TEXT,
  venue_id   INT REFERENCES venues(id),
  starts_at  DATE,
  min_price  REAL,
  genre      TEXT,
  subgenre   TEXT,
  tags       TEXT[],
  embedding  vector(384),
  url        TEXT
);

-- fast nearest-neighbor search on embeddings
CREATE INDEX IF NOT EXISTS artists_embedding_idx ON artists USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS events_embedding_idx  ON events  USING hnsw (embedding vector_cosine_ops);

-- popularity: Last.fm listener counts
ALTER TABLE artists ADD COLUMN IF NOT EXISTS listeners BIGINT;
ALTER TABLE events  ADD COLUMN IF NOT EXISTS listeners BIGINT;
-- groups of friends looking for a show together
CREATE TABLE IF NOT EXISTS group_sessions (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_by  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_members (
  session_id  INT REFERENCES group_sessions(id) ON DELETE CASCADE,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  weight      REAL DEFAULT 1.0,            -- fairness: raise for whoever compromised last time
  joined_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- the user's own ranked artist names, exactly as they gave them
-- (user_artists only links artists that made it into the artists table)
ALTER TABLE taste_profiles ADD COLUMN IF NOT EXISTS artists JSONB;
