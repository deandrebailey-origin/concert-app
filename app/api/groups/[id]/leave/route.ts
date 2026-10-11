import { sql } from "../../../_lib/db";
import { currentUser, unauthorized } from "../../../_lib/user";
import { isMember } from "../../../_lib/groups";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Leave a group. If the host leaves, the longest-standing member becomes host.
 * If nobody is left, the group is deleted.
 */
export async function POST(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await params).id);
  if (!(await isMember(id, user.id))) return Response.json({ detail: "Group not found." }, { status: 404 });

  await sql`DELETE FROM session_members WHERE session_id = ${id} AND user_id = ${user.id}`;

  const [next] = await sql`
    SELECT user_id FROM session_members WHERE session_id = ${id} ORDER BY joined_at LIMIT 1`;
  if (!next) {
    await sql`DELETE FROM group_sessions WHERE id = ${id}`;   // sessions, picks and votes cascade
    return Response.json({ left: true, deleted: true });
  }
  await sql`
    UPDATE group_sessions SET created_by = ${next.user_id}
    WHERE id = ${id} AND (created_by = ${user.id} OR created_by IS NULL)`;
  return Response.json({ left: true, deleted: false });
}
