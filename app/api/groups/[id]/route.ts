import { sql } from "../../_lib/db";
import { currentUser, unauthorized } from "../../_lib/user";
import { currentSession, ensureInviteCode, isMember } from "../../_lib/groups";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** One group: members, invite code, and its current planning session with votes. */
export async function GET(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await params).id);
  if (!(await isMember(id, user.id))) return Response.json({ detail: "Group not found." }, { status: 404 });

  const [group] = await sql`SELECT id, name FROM group_sessions WHERE id = ${id}`;
  const members = await sql`
    SELECT u.id, u.name, u.email, (t.user_id IS NOT NULL) AS has_profile,
           COALESCE(t.top_tags, '[]'::jsonb) AS top_tags
    FROM session_members sm
    JOIN users u ON u.id = sm.user_id
    LEFT JOIN taste_profiles t ON t.user_id = u.id
    WHERE sm.session_id = ${id}
    ORDER BY sm.joined_at`;

  return Response.json({
    group: { ...group, invite_code: await ensureInviteCode(id) },
    members,
    me: user.id,
    session: await currentSession(id),
  });
}
