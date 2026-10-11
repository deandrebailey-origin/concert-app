import { NextRequest, NextResponse } from "next/server";
import { sql, toVectorLiteral } from "../../_lib/db";
import {
  SPOTIFY_ACCOUNTS, STATE_COOKIE, USER_COOKIE, spotifyGet, topArtists,
} from "../../_lib/spotify";

export const runtime = "nodejs";

const EMBED_SERVICE_URL = process.env.EMBED_SERVICE_URL ?? "http://127.0.0.1:8000";
// /build-profile only uses the first 40 artists, so send 20 recent + 20 all-time
const PER_RANGE_FOR_PROFILE = 20;

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type Profile = {
  taste_vector: number[];
  top_tags: { name: string; score: number }[];
  artists_used: string[];
};

/** Step 2: Spotify sends the user back here with a one-time code. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  if (params.get("error")) {
    return NextResponse.json({ detail: `Spotify login cancelled: ${params.get("error")}` }, { status: 400 });
  }
  if (!code || !state || state !== request.cookies.get(STATE_COOKIE)?.value) {
    return NextResponse.json({ detail: "Invalid or expired login attempt. Try again." }, { status: 400 });
  }

  try {
    // 1. swap the one-time code for an access token
    const basic = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
    ).toString("base64");
    const tokenRes = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    }
    const token = (await tokenRes.json()) as TokenResponse;

    // 2. who is this, and what do they listen to?
    const [me, recent, allTime] = await Promise.all([
      spotifyGet<{ id: string; display_name: string | null }>("/me", token.access_token),
      topArtists(token.access_token, "short_term"),
      topArtists(token.access_token, "long_term"),
    ]);
    if (recent.length + allTime.length === 0) {
      return NextResponse.json(
        { detail: "Spotify has no top artists for this account yet. Try typing your taste instead." },
        { status: 422 },
      );
    }

    // 3. find or create our user, keyed by Spotify id
    const existing = await sql`SELECT user_id FROM spotify_accounts WHERE spotify_id = ${me.id}`;
    let userId: number = existing[0]?.user_id;
    if (!userId) {
      const created = await sql`INSERT INTO users (name) VALUES (${me.display_name ?? me.id}) RETURNING id`;
      userId = created[0].id;
    }
    await sql`
      INSERT INTO spotify_accounts (user_id, spotify_id, access_token, refresh_token, expires_at)
      VALUES (${userId}, ${me.id}, ${token.access_token}, ${token.refresh_token ?? null},
              now() + make_interval(secs => ${token.expires_in}))
      ON CONFLICT (user_id) DO UPDATE SET
        access_token  = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, spotify_accounts.refresh_token),
        expires_at    = EXCLUDED.expires_at`;

    // 4. build the taste profile with the Python embed service
    const profileArtists = [
      ...recent.slice(0, PER_RANGE_FOR_PROFILE).map((a, i) => ({ name: a.name, rank: i + 1, time_range: "short_term" })),
      ...allTime.slice(0, PER_RANGE_FOR_PROFILE).map((a, i) => ({ name: a.name, rank: i + 1, time_range: "long_term" })),
    ];
    const profileRes = await fetch(`${EMBED_SERVICE_URL}/build-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artists: profileArtists }),
      cache: "no-store",
    });
    if (!profileRes.ok) {
      throw new Error(`Embed service /build-profile failed: ${profileRes.status} ${await profileRes.text()}`);
    }
    const profile = (await profileRes.json()) as Profile;

    // 5. save the taste profile
    await sql`
      INSERT INTO taste_profiles (user_id, taste_vector, top_tags, updated_at)
      VALUES (${userId}, ${toVectorLiteral(profile.taste_vector)}::vector,
              ${JSON.stringify(profile.top_tags)}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET
        taste_vector = EXCLUDED.taste_vector,
        top_tags     = EXCLUDED.top_tags,
        updated_at   = now()`;

    // 6. save the full ranked artist lists (artists the embed service saved to the artists table)
    const ranked = [
      ...recent.map((a, i) => ({ name: a.name, rank: i + 1, range: "short_term" })),
      ...allTime.map((a, i) => ({ name: a.name, rank: i + 1, range: "long_term" })),
    ];
    await sql`DELETE FROM user_artists WHERE user_id = ${userId} AND source = 'spotify'`;
    await sql`
      INSERT INTO user_artists (user_id, artist_id, rank, time_range, source)
      SELECT ${userId}, a.id, x.rank, x.time_range, 'spotify'
      FROM unnest(${ranked.map((r) => r.name)}::text[],
                  ${ranked.map((r) => r.rank)}::int[],
                  ${ranked.map((r) => r.range)}::text[]) AS x(name, rank, time_range)
      JOIN artists a ON lower(a.name) = lower(x.name)
      ON CONFLICT DO NOTHING`;

    // 7. remember who's logged in, then show their profile
    const res = NextResponse.redirect(new URL("/api/me/profile", request.url));
    res.cookies.delete(STATE_COOKIE);
    res.cookies.set(USER_COOKIE, String(userId), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err) {
    console.error("[spotify/callback]", err);
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Spotify connection failed" },
      { status: 502 },
    );
  }
}
