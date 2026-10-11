import { createHmac, randomBytes, timingSafeEqual } from "crypto";

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

// ---- signed "state" so the callback knows which signed-in user is connecting ----
// Spotify must redirect to 127.0.0.1, but the login cookie lives on localhost, so the
// callback can't read the session. Instead we sign the user id into the OAuth state.

const STATE_TTL_MS = 10 * 60 * 1000;

function sign(payload: string) {
  return createHmac("sha256", process.env.NEON_AUTH_COOKIE_SECRET!).update(payload).digest("base64url");
}

export function makeState(userId: number) {
  const payload = `${userId}.${Date.now()}.${randomBytes(8).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id if the state is genuine and fresh, otherwise null. */
export function readState(state: string | null): number | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const payload = parts.slice(0, 3).join(".");
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Date.now() - Number(parts[1]) > STATE_TTL_MS) return null;
  return Number(parts[0]) || null;
}

/** Where to send people back after Spotify (the address they're logged in on). */
export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
