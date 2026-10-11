import { currentUser, unauthorized } from "../_lib/user";
import { loadTaste } from "../_lib/taste";

export const runtime = "nodejs";

/** The signed-in user plus their saved taste (tags, artists, Spotify status). */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json({ user, ...(await loadTaste(user.id)) });
}
