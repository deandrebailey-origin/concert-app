import { currentUser, unauthorized } from "../../../_lib/user";
import { isMember, startSession } from "../../../_lib/groups";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Start a planning session from the host's chat message, or a quick taste-only ranking. */
export async function POST(request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await params).id);
  if (!(await isMember(id, user.id))) return Response.json({ detail: "Group not found." }, { status: 404 });

  // { "prompt": "..." } asks the chatbot; { "quick": true } just ranks on everyone's taste
  const body = (await request.json().catch(() => null)) as { prompt?: unknown; quick?: unknown } | null;
  const prompt = body?.quick === true
    ? null
    : String(body?.prompt ?? "").trim().slice(0, 500) || "Surprise us with something we'd all enjoy.";

  try {
    return Response.json({ session: await startSession(id, user.id, prompt) });
  } catch (err) {
    console.error("[groups/sessions]", err);
    return Response.json({ detail: err instanceof Error ? err.message : "Couldn't start a session." }, { status: 400 });
  }
}
