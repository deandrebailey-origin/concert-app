import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type LastFmArtistInfo = {
  artist?: {
    image?: { size?: string; "#text"?: string }[];
  };
  error?: number;
};

type SpotifyArtistSearch = {
  artists?: {
    items?: { name: string; images?: { url: string; width: number | null }[] }[];
  };
};

type SpotifyTokenResponse = { access_token: string; expires_in: number };

let spotifyToken: string | null = null;
let spotifyTokenExpiresAt = 0;

function usableImage(url: string | undefined) {
  if (!url || url.includes("2a96cbd8b46e442fc41c2b86b821562f")) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function lastFmArtistImage(name: string) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.search = new URLSearchParams({
      method: "artist.getinfo",
      artist: name,
      api_key: apiKey,
      format: "json",
      autocorrect: "1",
    }).toString();

    const response = await fetch(url, { next: { revalidate: 86_400 } });
    if (!response.ok) return null;

    const data = (await response.json()) as LastFmArtistInfo;
    const images = data.artist?.image ?? [];
    const preferredSizes = ["mega", "extralarge", "large", "medium", "small"];
    for (const size of preferredSizes) {
      const candidate = images.find((image) => image.size === size)?.["#text"];
      const image = usableImage(candidate);
      if (image) return image;
    }
    return null;
  } catch {
    return null;
  }
}

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < spotifyTokenExpiresAt) return spotifyToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const data = (await response.json()) as SpotifyTokenResponse;
    spotifyToken = data.access_token;
    spotifyTokenExpiresAt = Date.now() + Math.max(0, data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch {
    return null;
  }
}

async function spotifyArtistImage(name: string) {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const url = new URL("https://api.spotify.com/v1/search");
    url.search = new URLSearchParams({ q: `artist:${name}`, type: "artist", limit: "5" }).toString();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86_400 },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as SpotifyArtistSearch;
    const artists = data.artists?.items ?? [];
    const normalizedName = name.trim().toLocaleLowerCase();
    const artist = artists.find((item) => item.name.trim().toLocaleLowerCase() === normalizedName) ?? artists[0];
    const images = artist?.images ?? [];
    return images
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
      .map((image) => usableImage(image.url))
      .find((image) => image !== null) ?? null;
  } catch {
    return null;
  }
}

/** Serve an artist image, preferring Last.fm and falling back to Spotify. */
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const provider = request.nextUrl.searchParams.get("provider") ?? "auto";

  if (!name || name.length > 120) {
    return NextResponse.json({ detail: "A valid artist name is required." }, { status: 400 });
  }
  if (provider !== "auto" && provider !== "spotify") {
    return NextResponse.json({ detail: "Unsupported image provider." }, { status: 400 });
  }

  if (provider === "auto") {
    const lastFmImage = await lastFmArtistImage(name);
    if (lastFmImage) {
      return NextResponse.redirect(lastFmImage, {
        headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
      });
    }
  }

  const spotifyImage = await spotifyArtistImage(name);
  if (spotifyImage) {
    return NextResponse.redirect(spotifyImage, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  }

  return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
}
