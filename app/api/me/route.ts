import { currentUser, unauthorized } from "../_lib/user";
import { loadTaste } from "../_lib/taste";

export const runtime = "nodejs";

/** The signed-in user plus their saved taste (tags, artists, Spotify status). */
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return unauthorized();
    return Response.json({ user, ...(await loadTaste(user.id)) });
  } catch (error) {
    console.error("Failed to load the signed-in user's profile:", error);
    return Response.json(
      { detail: "Couldn't load your profile. Check the server logs and confirm the database schema is up to date." },
      { status: 500 },
    );
  }
}
