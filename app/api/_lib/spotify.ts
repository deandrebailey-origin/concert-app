export const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";
export const SPOTIFY_API = "https://api.spotify.com/v1";
export const STATE_COOKIE = "spotify_state";
export const USER_COOKIE = "user_id";

export type SpotifyArtist = { id: string; name: string };
export type TimeRange = "short_term" | "long_term";

/** GET a Spotify Web API endpoint with the user's access token. */
export async function spotifyGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Spotify ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** A user's top artists, most-listened first. short_term = ~4 weeks, long_term = ~1 year. */
export async function topArtists(accessToken: string, range: TimeRange, limit = 50) {
  const data = await spotifyGet<{ items: SpotifyArtist[] }>(
    `/me/top/artists?time_range=${range}&limit=${limit}`,
    accessToken,
  );
  return data.items;
}
