import { currentUser, unauthorized } from "../../../../_lib/user";
import { getConcert } from "../../../../_lib/concerts";
import { buildIcs } from "@/frontend/lib/calendar";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ eventId: string }> };

/** Calendar invite for one of the user's concerts. */
export async function GET(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const eventId = decodeURIComponent((await params).eventId);
  const concert = await getConcert(user.id, eventId);
  if (!concert) return Response.json({ detail: "That concert isn't in your list." }, { status: 404 });
  if (!concert.date) return Response.json({ detail: "This show doesn't have a date yet." }, { status: 409 });

  const slug = concert.performer.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "concert";
  return new Response(buildIcs(concert, `certifi-concert-${user.id}-${eventId}@certifi.app`), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
    },
  });
}
