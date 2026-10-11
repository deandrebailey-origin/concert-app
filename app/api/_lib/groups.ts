import "server-only";
import { randomInt } from "crypto";
import { sql } from "./db";
import { planGroup } from "./embed";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I mix-ups
const PICKS_PER_SESSION = 8;

export function makeInviteCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export async function isMember(groupId: number, userId: number) {
  const [row] = await sql`SELECT 1 FROM session_members WHERE session_id = ${groupId} AND user_id = ${userId}`;
  return Boolean(row);
}

/** Give older groups (made before invite codes existed) a code. */
export async function ensureInviteCode(groupId: number): Promise<string> {
  const [row] = await sql`SELECT invite_code FROM group_sessions WHERE id = ${groupId}`;
  if (row?.invite_code) return row.invite_code as string;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeInviteCode();
    const updated = await sql`
      UPDATE group_sessions SET invite_code = ${code}
      WHERE id = ${groupId} AND invite_code IS NULL
        AND NOT EXISTS (SELECT 1 FROM group_sessions WHERE invite_code = ${code})
      RETURNING invite_code`;
    if (updated[0]) return updated[0].invite_code as string;
  }
  throw new Error("Couldn't create an invite code.");
}

/** Close sessions whose 24 hours are up (done lazily whenever a group is read). */
async function expireOldSessions(groupId: number) {
  await sql`
    UPDATE plan_sessions SET status = 'expired'
    WHERE group_id = ${groupId} AND status = 'open' AND expires_at < now()`;
}

export type SessionPick = {
  event_id: string;
  rank: number;
  event: Record<string, unknown>;
  yes: number[];   // user ids who are in
  no: number[];    // user ids who passed
};

export type SessionState = {
  id: number;
  status: "open" | "picked" | "expired" | "ended";
  prompt: string | null;
  reply: string | null;
  created_at: string;
  expires_at: string;
  picked_event_id: string | null;
  picks: SessionPick[];
};

async function loadSession(sessionId: number): Promise<SessionState | null> {
  const [s] = await sql`
    SELECT id, status, prompt, reply, created_at, expires_at, picked_event_id FROM plan_sessions WHERE id = ${sessionId}`;
  if (!s) return null;
  const picks = await sql`
    SELECT p.event_id, p.rank, p.event,
           COALESCE(array_agg(v.user_id) FILTER (WHERE v.vote), '{}') AS yes,
           COALESCE(array_agg(v.user_id) FILTER (WHERE NOT v.vote), '{}') AS no
    FROM plan_picks p
    LEFT JOIN plan_votes v ON v.session_id = p.session_id AND v.event_id = p.event_id
    WHERE p.session_id = ${sessionId}
    GROUP BY p.event_id, p.rank, p.event
    ORDER BY p.rank`;
  return { ...(s as Omit<SessionState, "picks">), picks: picks as SessionPick[] };
}

/** The group's current session (open, or the most recent one so a picked plan stays visible). */
export async function currentSession(groupId: number): Promise<SessionState | null> {
  await expireOldSessions(groupId);
  const [s] = await sql`
    SELECT id FROM plan_sessions WHERE group_id = ${groupId}
    ORDER BY (status = 'open') DESC, created_at DESC LIMIT 1`;
  return s ? loadSession(s.id as number) : null;
}

/** The group's host (whoever created it) is the one who talks to the chatbot. */
export async function hostId(groupId: number): Promise<number | null> {
  const [g] = await sql`SELECT created_by FROM group_sessions WHERE id = ${groupId}`;
  return (g?.created_by as number | null) ?? null;
}

/** Start a session from the host's chat message: rank shows for everyone and freeze the top picks. */
export async function startSession(groupId: number, userId: number, prompt: string): Promise<SessionState> {
  await expireOldSessions(groupId);
  const host = await hostId(groupId);
  if (host !== null && host !== userId) throw new Error("Only the group's host can ask for shows.");

  const [open] = await sql`SELECT id FROM plan_sessions WHERE group_id = ${groupId} AND status = 'open'`;
  if (open) return (await loadSession(open.id as number))!;

  const members = await sql`
    SELECT u.name, sm.weight, t.taste_vector::text AS v, COALESCE(t.disliked_genres, '{}') AS disliked
    FROM session_members sm
    JOIN users u ON u.id = sm.user_id
    JOIN taste_profiles t ON t.user_id = u.id
    WHERE sm.session_id = ${groupId}`;
  if (members.length === 0) throw new Error("Nobody in this group has a taste profile yet. Build one on the Profile page.");

  const plan = await planGroup(
    members.map((m) => ({
      name: m.name as string,
      taste_vector: JSON.parse(m.v as string) as number[],
      disliked_tags: m.disliked as string[],
      weight: Number(m.weight ?? 1),
    })),
    prompt,
    PICKS_PER_SESSION,
  );

  const [session] = await sql`
    INSERT INTO plan_sessions (group_id, created_by, prompt, reply, filters)
    VALUES (${groupId}, ${userId}, ${prompt}, ${plan.reply}, ${JSON.stringify(plan.filters)}::jsonb)
    RETURNING id`;
  await sql`
    INSERT INTO plan_picks (session_id, event_id, rank, event)
    SELECT ${session.id}, e->>'id', (ord)::int, e
    FROM jsonb_array_elements(${JSON.stringify(plan.events)}::jsonb) WITH ORDINALITY AS t(e, ord)`;
  return (await loadSession(session.id as number))!;
}

/** Record a vote; if every group member says yes to the same show, that's the plan. */
export async function castVote(sessionId: number, userId: number, eventId: string, vote: boolean) {
  const [s] = await sql`
    SELECT ps.id, ps.group_id, ps.status, ps.expires_at < now() AS past_due
    FROM plan_sessions ps
    JOIN session_members sm ON sm.session_id = ps.group_id AND sm.user_id = ${userId}
    WHERE ps.id = ${sessionId}`;
  if (!s) return { error: "Session not found.", status: 404 } as const;
  if (s.status !== "open" || s.past_due) return { error: "This session is closed. Start a new one.", status: 409 } as const;

  const [pick] = await sql`SELECT 1 FROM plan_picks WHERE session_id = ${sessionId} AND event_id = ${eventId}`;
  if (!pick) return { error: "That show isn't in this session.", status: 400 } as const;

  await sql`
    INSERT INTO plan_votes (session_id, event_id, user_id, vote) VALUES (${sessionId}, ${eventId}, ${userId}, ${vote})
    ON CONFLICT (session_id, event_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, voted_at = now()`;

  // unanimous yes from current members -> lock it in
  await sql`
    UPDATE plan_sessions SET status = 'picked', picked_event_id = ${eventId}
    WHERE id = ${sessionId} AND status = 'open'
      AND (SELECT count(*) FROM session_members WHERE session_id = ${s.group_id})
        = (SELECT count(*) FROM plan_votes v
           JOIN session_members sm ON sm.session_id = ${s.group_id} AND sm.user_id = v.user_id
           WHERE v.session_id = ${sessionId} AND v.event_id = ${eventId} AND v.vote)`;

  return { session: await loadSession(sessionId) } as const;
}

/** The host ends the open session early (no plan picked). */
export async function endSession(sessionId: number, userId: number) {
  const [s] = await sql`
    SELECT ps.status, g.created_by
    FROM plan_sessions ps JOIN group_sessions g ON g.id = ps.group_id
    JOIN session_members sm ON sm.session_id = ps.group_id AND sm.user_id = ${userId}
    WHERE ps.id = ${sessionId}`;
  if (!s) return { error: "Session not found.", status: 404 } as const;
  if (s.created_by !== null && s.created_by !== userId) return { error: "Only the host can end the session.", status: 403 } as const;
  if (s.status !== "open") return { error: "This session is already closed.", status: 409 } as const;
  await sql`UPDATE plan_sessions SET status = 'ended' WHERE id = ${sessionId}`;
  return { session: await loadSession(sessionId) } as const;
}
