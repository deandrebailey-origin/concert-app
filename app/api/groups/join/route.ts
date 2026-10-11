import { sql } from "../../_lib/db";
import { currentUser, unauthorized } from "../../_lib/user";

export const runtime = "nodejs";

/** Join a group with its invite code: { "code": "K7P2QX" } */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = String(body?.code ?? "").trim().toUpperCase();
  const [group] = await sql`SELECT id, name FROM group_sessions WHERE invite_code = ${code}`;
  if (!group) return Response.json({ detail: "That invite code doesn't match any group." }, { status: 404 });

  await sql`
    INSERT INTO session_members (session_id, user_id) VALUES (${group.id}, ${user.id})
    ON CONFLICT DO NOTHING`;
  return Response.json({ group });
}
