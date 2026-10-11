import { currentUser, unauthorized } from "../../../_lib/user";
import { isMember, startSession } from "../../../_lib/groups";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** The host's chat message starts a planning session: { "prompt": "something chill this weekend" } */
export async function POST(request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await params).id);
  if (!(await isMember(id, user.id))) return Response.json({ detail: "Group not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = String(body?.prompt ?? "").trim().slice(0, 500) || "Surprise us with something we'd all enjoy.";

  try {
    return Response.json({ session: await startSession(id, user.id, prompt) });
  } catch (err) {
    console.error("[groups/sessions]", err);
    return Response.json({ detail: err instanceof Error ? err.message : "Couldn't start a session." }, { status: 400 });
  }
}
