import { sql } from "../../../_lib/db";
import { currentUser, unauthorized } from "../../../_lib/user";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Add a friend by email: { "email": "friend@example.com" }. They must have signed in once. */
export async function POST(request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await params).id);

  const [mine] = await sql`
    SELECT 1 FROM session_members WHERE session_id = ${id} AND user_id = ${user.id}`;
  if (!mine) return Response.json({ detail: "Group not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const [friend] = await sql`SELECT id, name FROM users WHERE lower(email) = ${email}`;
  if (!friend) {
    return Response.json(
      { detail: "No one with that email yet. Ask them to sign in to Certifi first." },
      { status: 404 },
    );
  }

  await sql`
    INSERT INTO session_members (session_id, user_id) VALUES (${id}, ${friend.id})
    ON CONFLICT DO NOTHING`;
  return Response.json({ added: friend });
}
