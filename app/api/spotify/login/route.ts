import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { SPOTIFY_ACCOUNTS, STATE_COOKIE } from "../../_lib/spotify";

export const runtime = "nodejs";

/** Step 1: send the user to Spotify's login + permission screen. */
export function GET() {
  // random value we check in the callback, so nobody can forge the redirect back
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: "user-top-read",               // only permission we need: read top artists
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state,
  });

  const res = NextResponse.redirect(`${SPOTIFY_ACCOUNTS}/authorize?${params}`);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 600,
  });
  return res;
}
