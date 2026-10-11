import { currentUser, unauthorized } from "../../_lib/user";
import { addConcert, listConcerts, type ConcertSnapshot } from "../../_lib/concerts";

export const runtime = "nodejs";

/** Concerts the signed-in user bought tickets for. */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    return Response.json({ concerts: await listConcerts(user.id) });
  } catch (err) {
    console.error("[me/concerts GET]", err);
    return Response.json({ detail: "Couldn't load your concerts." }, { status: 500 });
  }
}

/** Add a show: { event: { id, performer, name, date, url, venue, genre, distance_mi } } */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as { event?: Partial<ConcertSnapshot> } | null;
  const ev = body?.event;
  if (!ev?.id || !ev.performer) return Response.json({ detail: "Missing the show to add." }, { status: 400 });

  const snap: ConcertSnapshot = {
    id: String(ev.id),
    name: ev.name ?? "",
    performer: String(ev.performer),
    genre: ev.genre ?? null,
    date: ev.date ?? null,
    url: ev.url ?? null,
    venue: { name: ev.venue?.name ?? null, address: ev.venue?.address ?? null },
    distance_mi: ev.distance_mi ?? null,
  };
  try {
    await addConcert(user.id, snap);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[me/concerts POST]", err);
    return Response.json({ detail: "Couldn't save that concert." }, { status: 500 });
  }
}
