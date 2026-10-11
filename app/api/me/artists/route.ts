import { currentUser, unauthorized } from "../../_lib/user";
import { loadTaste, saveTaste } from "../../_lib/taste";

export const runtime = "nodejs";

/** Build a taste profile from typed artist names: { "artists": ["SZA", "Frank Ocean", ...] } */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { artists?: unknown } | null;
  const names = Array.isArray(body?.artists)
    ? [...new Set(body.artists.map((a) => String(a).trim()).filter(Boolean))].slice(0, 40)
    : [];
  if (names.length < 3) {
    return Response.json({ detail: "Add at least 3 artists." }, { status: 400 });
  }

  try {
    const ranked = names.map((name, i) => ({ name, rank: i + 1, range: "long_term" as const }));
    await saveTaste(
      user.id,
      "typed",
      ranked.map((r) => ({ name: r.name, rank: r.rank, time_range: r.range })),
      ranked,
    );
    return Response.json({ user, ...(await loadTaste(user.id)) });
  } catch (err) {
    console.error("[me/artists]", err);
    return Response.json({ detail: err instanceof Error ? err.message : "Couldn't build your profile." }, { status: 502 });
  }
}
