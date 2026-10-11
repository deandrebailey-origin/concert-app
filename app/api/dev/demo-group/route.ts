import { sql } from "../../_lib/db";
import { currentUser, unauthorized } from "../../_lib/user";
import { isMember } from "../../_lib/groups";
import { saveTaste } from "../../_lib/taste";
import { DEMO_FRIENDS, demoToolsEnabled } from "../_guard";

export const runtime = "nodejs";

/** Test helper: add three fake friends (with taste profiles) to a group: { "group_id": 1 } */
export async function POST(request: Request) {
  if (!demoToolsEnabled()) return Response.json({ detail: "Not found." }, { status: 404 });
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { group_id?: unknown } | null;
  const groupId = Number(body?.group_id);
  if (!(await isMember(groupId, user.id))) return Response.json({ detail: "Group not found." }, { status: 404 });

  try {
    for (const friend of DEMO_FRIENDS) {
      const [row] = await sql`
        INSERT INTO users (name, email) VALUES (${friend.name}, ${friend.email})
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING id`;
      const [hasProfile] = await sql`SELECT 1 FROM taste_profiles WHERE user_id = ${row.id}`;
      if (!hasProfile) {
        const ranked = friend.artists.map((name, i) => ({ name, rank: i + 1, range: "long_term" as const }));
        await saveTaste(row.id as number, "typed", ranked.map((r) => ({ name: r.name, rank: r.rank, time_range: r.range })), ranked);
      }
      await sql`
        INSERT INTO session_members (session_id, user_id) VALUES (${groupId}, ${row.id})
        ON CONFLICT DO NOTHING`;
    }
    return Response.json({ added: DEMO_FRIENDS.map((f) => f.name) });
  } catch (err) {
    console.error("[dev/demo-group]", err);
    return Response.json({ detail: err instanceof Error ? err.message : "Couldn't add demo friends." }, { status: 502 });
  }
}
