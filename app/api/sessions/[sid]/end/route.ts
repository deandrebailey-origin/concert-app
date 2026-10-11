import { currentUser, unauthorized } from "../../../_lib/user";
import { endSession } from "../../../_lib/groups";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ sid: string }> };

/** Host ends the current session early. */
export async function POST(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const result = await endSession(Number((await params).sid), user.id);
  if ("error" in result) return Response.json({ detail: result.error }, { status: result.status });
  return Response.json({ session: result.session });
}
