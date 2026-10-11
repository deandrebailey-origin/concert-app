import { sql } from "../_lib/db";
import { currentUser, unauthorized } from "../_lib/user";

export const runtime = "nodejs";

/** Groups the signed-in user belongs to, with member names. */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  const groups = await sql`
    SELECT g.id, g.name, g.created_at,
           json_agg(json_build_object('id', u.id, 'name', u.name) ORDER BY sm.joined_at) AS members
    FROM group_sessions g
    JOIN session_members mine ON mine.session_id = g.id AND mine.user_id = ${user.id}
    JOIN session_members sm ON sm.session_id = g.id
    JOIN users u ON u.id = sm.user_id
    GROUP BY g.id
    ORDER BY g.created_at DESC`;
  return Response.json({ groups });
}

/** Create a group: { "name": "Saturday crew" }. The creator joins automatically. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = String(body?.name ?? "").trim().slice(0, 60);
  if (!name) return Response.json({ detail: "Give your group a name." }, { status: 400 });

  const [group] = await sql`
    INSERT INTO group_sessions (name, created_by) VALUES (${name}, ${user.id}) RETURNING id, name`;
  await sql`INSERT INTO session_members (session_id, user_id) VALUES (${group.id}, ${user.id})`;
  return Response.json({ group }, { status: 201 });
}
