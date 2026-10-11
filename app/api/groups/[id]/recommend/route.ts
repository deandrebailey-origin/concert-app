import { sql } from "../../../_lib/db";
import { currentUser, unauthorized } from "../../../_lib/user";
import { scoreEvents } from "../../../_lib/embed";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Shows ranked for the whole group: everyone's taste counts, nobody gets left out. */
export async function GET(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await params).id);

  const rows = await sql`
    SELECT u.id, u.name, sm.weight, t.taste_vector::text AS v,
           COALESCE(t.disliked_genres, '{}') AS disliked
    FROM session_members sm
    JOIN users u ON u.id = sm.user_id
    LEFT JOIN taste_profiles t ON t.user_id = u.id
    WHERE sm.session_id = ${id}`;
  if (!rows.some((r) => r.id === user.id)) {
    return Response.json({ detail: "Group not found." }, { status: 404 });
  }

  const ready = rows.filter((r) => r.v);
  const missing = rows.filter((r) => !r.v).map((r) => r.name as string);
  if (ready.length === 0) {
    return Response.json({ detail: "Nobody in this group has a taste profile yet.", missing }, { status: 400 });
  }

  try {
    const { events } = await scoreEvents(
      ready.map((r) => ({
        name: r.name as string,
        taste_vector: JSON.parse(r.v as string) as number[],
        disliked_tags: r.disliked as string[],
        weight: Number(r.weight ?? 1),
      })),
      12,
    );
    return Response.json({ events, missing });
  } catch (err) {
    console.error("[groups/recommend]", err);
    return Response.json({ detail: err instanceof Error ? err.message : "Couldn't score shows." }, { status: 502 });
  }
}
