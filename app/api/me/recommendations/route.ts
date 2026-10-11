import { currentUser, unauthorized } from "../../_lib/user";
import { loadVector } from "../../_lib/taste";
import { scoreEvents } from "../../_lib/embed";

export const runtime = "nodejs";

/** Upcoming shows ranked for just the signed-in user. */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  const vector = await loadVector(user.id);
  if (!vector) return Response.json({ events: [], needs_profile: true });

  try {
    const { events } = await scoreEvents([{ name: user.name, taste_vector: vector }], 12);
    return Response.json({ events, needs_profile: false });
  } catch (err) {
    console.error("[me/recommendations]", err);
    return Response.json({ detail: err instanceof Error ? err.message : "Couldn't load shows." }, { status: 502 });
  }
}
