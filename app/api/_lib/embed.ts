import "server-only";

const EMBED_SERVICE_URL = process.env.EMBED_SERVICE_URL ?? "http://127.0.0.1:8000";

/** POST JSON to the Python embed service and return its JSON, or throw with its error. */
export async function callEmbed<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${EMBED_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error("The recommendation service isn't running (start uvicorn in embed/).");
  }
  if (!res.ok) throw new Error(`Embed service ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export type ProfileArtist = { name: string; rank: number; time_range: "short_term" | "long_term" };
export type Profile = {
  taste_vector: number[];
  top_tags: { name: string; score: number }[];
  artists_used: string[];
};

export type ScoredEvent = {
  id: string;
  name: string;
  performer: string;
  genre: string | null;
  date: string | null;
  min_price: number | null;
  url: string | null;
  venue: { name: string | null; address: string | null; lat: number | null; lng: number | null };
  group_score: number;
  taste_score: number;
  popularity: number;
  listeners: number;
  member_scores: Record<string, number>;
  tags: string[];
};

export type ScoreMember = { name: string; taste_vector: number[]; disliked_tags?: string[]; weight?: number };

export function scoreEvents(members: ScoreMember[], limit = 12) {
  return callEmbed<{ events: ScoredEvent[] }>("/score-events", { members, limit });
}
export type PlanResult = { reply: string; filters: Record<string, unknown>; events: (ScoredEvent & { reason?: string })[] };

/** Group chatbot: the host's request + everyone's taste -> ranked shows with reasons. */
export function planGroup(members: ScoreMember[], prompt: string, limit = 8) {
  return callEmbed<PlanResult>("/plan-group", { members, prompt, limit });
}
