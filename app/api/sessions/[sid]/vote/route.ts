import { currentUser, unauthorized } from "../../../_lib/user";
import { castVote } from "../../../_lib/groups";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ sid: string }> };

/** Vote on a show in a session: { "event_id": "...", "vote": true } */
export async function POST(request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const sid = Number((await params).sid);

  const body = (await request.json().catch(() => null)) as { event_id?: unknown; vote?: unknown } | null;
  if (typeof body?.event_id !== "string" || typeof body.vote !== "boolean") {
    return Response.json({ detail: "Send event_id and vote (true or false)." }, { status: 400 });
  }

  const result = await castVote(sid, user.id, body.event_id, body.vote);
  if ("error" in result) return Response.json({ detail: result.error }, { status: result.status });
  return Response.json({ session: result.session });
}
