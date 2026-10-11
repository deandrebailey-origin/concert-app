import "server-only";
import { sql, toVectorLiteral } from "./db";
import { callEmbed, type Profile, type ProfileArtist } from "./embed";

type Source = "spotify" | "typed";
type RankedArtist = { name: string; rank: number; range: "short_term" | "long_term" };

/**
 * Build a taste profile with the embed service and save it:
 * taste_profiles gets the vector + top tags, user_artists gets the ranked list.
 */
export async function saveTaste(
  userId: number,
  source: Source,
  forProfile: ProfileArtist[],   // what /build-profile embeds (max 40 used)
  ranked: RankedArtist[],        // full list to show on the profile page
) {
  const profile = await callEmbed<Profile>("/build-profile", { artists: forProfile });

  await sql`
    INSERT INTO taste_profiles (user_id, taste_vector, top_tags, updated_at)
    VALUES (${userId}, ${toVectorLiteral(profile.taste_vector)}::vector,
            ${JSON.stringify(profile.top_tags)}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET
      taste_vector = EXCLUDED.taste_vector,
      top_tags     = EXCLUDED.top_tags,
      updated_at   = now()`;

  // the embed service saved each artist to the artists table; link them to this user
  await sql`DELETE FROM user_artists WHERE user_id = ${userId}`;
  await sql`
    INSERT INTO user_artists (user_id, artist_id, rank, time_range, source)
    SELECT ${userId}, a.id, x.rank, x.time_range, ${source}
    FROM unnest(${ranked.map((r) => r.name)}::text[],
                ${ranked.map((r) => r.rank)}::int[],
                ${ranked.map((r) => r.range)}::text[]) AS x(name, rank, time_range)
    JOIN artists a ON lower(a.name) = lower(x.name)
    ON CONFLICT DO NOTHING`;

  return profile;
}

/** Everything the profile page shows about a user's taste. */
export async function loadTaste(userId: number) {
  const [profile] = await sql`
    SELECT top_tags, updated_at FROM taste_profiles WHERE user_id = ${userId}`;
  const artists = await sql`
    SELECT a.name, ua.rank, ua.time_range, ua.source
    FROM user_artists ua JOIN artists a ON a.id = ua.artist_id
    WHERE ua.user_id = ${userId}
    ORDER BY ua.time_range DESC, ua.rank`;
  const [spotify] = await sql`SELECT 1 AS ok FROM spotify_accounts WHERE user_id = ${userId}`;

  return {
    has_profile: Boolean(profile),
    top_tags: (profile?.top_tags ?? []) as { name: string; score: number }[],
    updated_at: profile?.updated_at ?? null,
    source: (artists[0]?.source ?? null) as Source | null,
    recent: artists.filter((a) => a.time_range === "short_term").map((a) => a.name as string),
    all_time: artists.filter((a) => a.time_range === "long_term").map((a) => a.name as string),
    spotify_connected: Boolean(spotify),
  };
}

/** A user's saved taste vector as numbers, or null if they haven't built one. */
export async function loadVector(userId: number): Promise<number[] | null> {
  const [row] = await sql`SELECT taste_vector::text AS v FROM taste_profiles WHERE user_id = ${userId}`;
  return row ? (JSON.parse(row.v as string) as number[]) : null;
}
