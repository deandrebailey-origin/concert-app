import { sql } from "../../_lib/db";
import { currentUser, unauthorized } from "../../_lib/user";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** One group with its members and whether each has a taste profile yet. */
export async function GET(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await params).id);

  const members = await sql`
    SELECT u.id, u.name, u.email, (t.user_id IS NOT NULL) AS has_profile,
           COALESCE(t.top_tags, '[]'::jsonb) AS top_tags
    FROM session_members sm
    JOIN users u ON u.id = sm.user_id
    LEFT JOIN taste_profiles t ON t.user_id = u.id
    WHERE sm.session_id = ${id}
    ORDER BY sm.joined_at`;
  if (!members.some((m) => m.id === user.id)) {
    return Response.json({ detail: "Group not found." }, { status: 404 });
  }
  const [group] = await sql`SELECT id, name FROM group_sessions WHERE id = ${id}`;
  return Response.json({ group, members });
}
