import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../_lib/db";
import { USER_COOKIE } from "../../_lib/spotify";

export const runtime = "nodejs";

/** The logged-in user's saved taste: top tags + their Spotify artists. */
export async function GET(request: NextRequest) {
  const userId = Number(request.cookies.get(USER_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ detail: "Not connected. Visit /api/spotify/login first." }, { status: 401 });
  }

  const [user] = await sql`
    SELECT u.id, u.name, t.top_tags, t.updated_at, (t.taste_vector IS NOT NULL) AS has_profile
    FROM users u LEFT JOIN taste_profiles t ON t.user_id = u.id
    WHERE u.id = ${userId}`;
  if (!user) {
    return NextResponse.json({ detail: "User not found" }, { status: 404 });
  }

  const artists = await sql`
    SELECT a.name, ua.rank, ua.time_range
    FROM user_artists ua JOIN artists a ON a.id = ua.artist_id
    WHERE ua.user_id = ${userId}
    ORDER BY ua.time_range DESC, ua.rank`;

  return NextResponse.json({
    ...user,
    short_term: artists.filter((a) => a.time_range === "short_term").map((a) => a.name),
    long_term: artists.filter((a) => a.time_range === "long_term").map((a) => a.name),
  });
}
