import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../_lib/db";
import { saveTaste } from "../../_lib/taste";
import { APP_URL, SPOTIFY_ACCOUNTS, readState, spotifyGet, topArtists } from "../../_lib/spotify";

export const runtime = "nodejs";

// /build-profile only uses the first 40 artists, so send 20 recent + 20 all-time
const PER_RANGE_FOR_PROFILE = 20;

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

const backToProfile = (status: string) => NextResponse.redirect(`${APP_URL}/profile?spotify=${status}`);

/** Step 2: Spotify sends the user back here with a one-time code. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return backToProfile("cancelled");

  const userId = readState(params.get("state"));
  const code = params.get("code");
  if (!userId || !code) return backToProfile("expired");

  try {
    // 1. swap the one-time code for an access token
    const basic = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
    ).toString("base64");
    const tokenRes = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    const token = (await tokenRes.json()) as TokenResponse;

    // 2. who is this on Spotify, and what do they listen to?
    const [me, recent, allTime] = await Promise.all([
      spotifyGet<{ id: string }>("/me", token.access_token),
      topArtists(token.access_token, "short_term"),
      topArtists(token.access_token, "long_term"),
    ]);
    if (recent.length + allTime.length === 0) return backToProfile("empty");

    // 3. remember the Spotify link for this user
    await sql`
      INSERT INTO spotify_accounts (user_id, spotify_id, access_token, refresh_token, expires_at)
      VALUES (${userId}, ${me.id}, ${token.access_token}, ${token.refresh_token ?? null},
              now() + make_interval(secs => ${token.expires_in}))
      ON CONFLICT (user_id) DO UPDATE SET
        spotify_id    = EXCLUDED.spotify_id,
        access_token  = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, spotify_accounts.refresh_token),
        expires_at    = EXCLUDED.expires_at`;

    // 4. build + save the taste profile
    await saveTaste(
      userId,
      "spotify",
      [
        ...recent.slice(0, PER_RANGE_FOR_PROFILE).map((a, i) => ({ name: a.name, rank: i + 1, time_range: "short_term" as const })),
        ...allTime.slice(0, PER_RANGE_FOR_PROFILE).map((a, i) => ({ name: a.name, rank: i + 1, time_range: "long_term" as const })),
      ],
      [
        ...recent.map((a, i) => ({ name: a.name, rank: i + 1, range: "short_term" as const })),
        ...allTime.map((a, i) => ({ name: a.name, rank: i + 1, range: "long_term" as const })),
      ],
    );
    return backToProfile("connected");
  } catch (err) {
    console.error("[spotify/callback]", err);
    return backToProfile("error");
  }
}
