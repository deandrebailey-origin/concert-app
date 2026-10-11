import { currentUser, unauthorized } from "../../../_lib/user";
import { removeConcert } from "../../../_lib/concerts";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ eventId: string }> };

/** Remove a show from My concerts. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  await removeConcert(user.id, decodeURIComponent((await params).eventId));
  return Response.json({ ok: true });
}
