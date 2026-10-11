import { sql } from "../../_lib/db";
import { currentUser, unauthorized } from "../../_lib/user";
import { DEMO_EMAIL_DOMAIN, demoToolsEnabled } from "../_guard";

export const runtime = "nodejs";

/**
 * Test helper: every demo friend in the session votes like a real person would:
 * "I'm in" on their 3 favorite picks (by their own taste score), "Pass" on the rest.
 * Body: { "session_id": 1 }
 */
export async function POST(request: Request) {
  if (!demoToolsEnabled()) return Response.json({ detail: "Not found." }, { status: 404 });
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { session_id?: unknown } | null;
  const sessionId = Number(body?.session_id);

  const [session] = await sql`
    SELECT ps.group_id FROM plan_sessions ps
    JOIN session_members sm ON sm.session_id = ps.group_id AND sm.user_id = ${user.id}
    WHERE ps.id = ${sessionId} AND ps.status = 'open'`;
  if (!session) return Response.json({ detail: "No open session found." }, { status: 404 });

  const demoMembers = await sql`
    SELECT u.id, u.name FROM session_members sm JOIN users u ON u.id = sm.user_id
    WHERE sm.session_id = ${session.group_id} AND u.email LIKE ${"%@" + DEMO_EMAIL_DOMAIN}`;
  const picks = await sql`SELECT event_id, event FROM plan_picks WHERE session_id = ${sessionId}`;

  for (const m of demoMembers) {
    const ranked = [...picks].sort((a, b) =>
      ((b.event as { member_scores?: Record<string, number> }).member_scores?.[m.name as string] ?? 0) -
      ((a.event as { member_scores?: Record<string, number> }).member_scores?.[m.name as string] ?? 0));
    for (const [i, p] of ranked.entries()) {
      await sql`
        INSERT INTO plan_votes (session_id, event_id, user_id, vote) VALUES (${sessionId}, ${p.event_id}, ${m.id}, ${i < 3})
        ON CONFLICT (session_id, event_id, user_id) DO UPDATE SET vote = EXCLUDED.vote`;
    }
  }
  // same rule as a real vote: a show everyone says yes to becomes the plan
  const [{ n: memberCount }] = await sql`SELECT count(*)::int AS n FROM session_members WHERE session_id = ${session.group_id}`;
  const [agreed] = await sql`
    SELECT v.event_id FROM plan_votes v
    JOIN session_members sm ON sm.session_id = ${session.group_id} AND sm.user_id = v.user_id
    JOIN plan_picks p ON p.session_id = v.session_id AND p.event_id = v.event_id
    WHERE v.session_id = ${sessionId} AND v.vote
    GROUP BY v.event_id, p.rank HAVING count(*) = ${memberCount}
    ORDER BY p.rank LIMIT 1`;
  if (agreed) {
    await sql`UPDATE plan_sessions SET status = 'picked', picked_event_id = ${agreed.event_id}
              WHERE id = ${sessionId} AND status = 'open'`;
  }

  return Response.json({ voted: demoMembers.map((m) => m.name), picked: agreed?.event_id ?? null });
}
