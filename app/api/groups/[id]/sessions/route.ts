import { currentUser, unauthorized } from "../../../_lib/user";
import { isMember, startSession } from "../../../_lib/groups";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Start a planning session (or return the one already open). */
export async function POST(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const id = Number((await params).id);
  if (!(await isMember(id, user.id))) return Response.json({ detail: "Group not found." }, { status: 404 });

  try {
    return Response.json({ session: await startSession(id, user.id) });
  } catch (err) {
    console.error("[groups/sessions]", err);
    return Response.json({ detail: err instanceof Error ? err.message : "Couldn't start a session." }, { status: 400 });
  }
}
