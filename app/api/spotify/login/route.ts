import { NextResponse } from "next/server";
import { SPOTIFY_ACCOUNTS, makeState, APP_URL } from "../../_lib/spotify";
import { currentUser } from "../../_lib/user";

export const runtime = "nodejs";

/** Step 1: send the signed-in user to Spotify's permission screen. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${APP_URL}/sign-in`);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: "user-top-read",               // only permission we need: read top artists
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state: makeState(user.id),
  });
  return NextResponse.redirect(`${SPOTIFY_ACCOUNTS}/authorize?${params}`);
}
