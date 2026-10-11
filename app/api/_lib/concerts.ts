import "server-only";
import { sql } from "./db";
import type { PlanDetails } from "@/frontend/lib/calendar";

export type Concert = PlanDetails & { event_id: string; genre: string | null; distance_mi: number | null };

/** Snapshot saved when the user adds a show (subset of the EventItem the card had). */
export type ConcertSnapshot = {
  id: string;
  name?: string;
  performer: string;
  genre?: string | null;
  date?: string | null;
  url?: string | null;
  venue?: { name?: string | null; address?: string | null };
  distance_mi?: number | null;
};

// create the table on first use so the demo doesn't depend on re-running apply_schema.py
let ready: Promise<unknown> | null = null;
function ensureTable() {
  ready ??= sql`
    CREATE TABLE IF NOT EXISTS my_concerts (
      user_id  INT REFERENCES users(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      event    JSONB NOT NULL,
      added_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (user_id, event_id)
    )`.catch((e) => { ready = null; throw e; });
  return ready;
}

/** Live event data when the show is still in our events table, otherwise the saved snapshot. */
function toConcert(row: Record<string, unknown>): Concert {
  const snap = (row.snapshot ?? {}) as ConcertSnapshot;
  return {
    event_id: row.event_id as string,
    performer: (row.performer ?? snap.performer ?? "Concert") as string,
    event_name: (row.name ?? snap.name ?? "") as string,
    group_name: "",
    date: (row.starts_at ?? snap.date ?? null) as string | null,
    time: (row.start_time ?? null) as string | null,
    min_price: (row.min_price ?? null) as number | null,
    max_price: (row.max_price ?? null) as number | null,
    venue_name: (row.venue_name ?? snap.venue?.name ?? null) as string | null,
    address: (row.address ?? snap.venue?.address ?? null) as string | null,
    url: (row.url ?? snap.url ?? null) as string | null,
    members: [],
    genre: snap.genre ?? null,
    distance_mi: snap.distance_mi ?? null,
  };
}

const SELECT_CONCERTS = (userId: number, eventId: string | null) => sql`
  SELECT mc.event_id, mc.event AS snapshot,
         e.name, e.performer, to_char(e.starts_at, 'YYYY-MM-DD') AS starts_at, to_char(e.start_time, 'HH24:MI') AS start_time,
         e.min_price, e.max_price, e.url, v.name AS venue_name, v.address
  FROM my_concerts mc
  LEFT JOIN events e ON e.tm_id = mc.event_id
  LEFT JOIN venues v ON v.id = e.venue_id
  WHERE mc.user_id = ${userId} AND (${eventId}::text IS NULL OR mc.event_id = ${eventId})
  ORDER BY COALESCE(to_char(e.starts_at, 'YYYY-MM-DD'), mc.event->>'date') NULLS LAST, mc.added_at`;

export async function listConcerts(userId: number) {
  await ensureTable();
  return (await SELECT_CONCERTS(userId, null)).map(toConcert);
}

export async function getConcert(userId: number, eventId: string) {
  await ensureTable();
  const [row] = await SELECT_CONCERTS(userId, eventId);
  return row ? toConcert(row) : null;
}

export async function addConcert(userId: number, snap: ConcertSnapshot) {
  await ensureTable();
  await sql`
    INSERT INTO my_concerts (user_id, event_id, event) VALUES (${userId}, ${snap.id}, ${JSON.stringify(snap)}::jsonb)
    ON CONFLICT (user_id, event_id) DO UPDATE SET event = EXCLUDED.event`;
}

export async function removeConcert(userId: number, eventId: string) {
  await ensureTable();
  await sql`DELETE FROM my_concerts WHERE user_id = ${userId} AND event_id = ${eventId}`;
}
