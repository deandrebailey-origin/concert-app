import { sql } from "../../../_lib/db";
import { currentUser, unauthorized } from "../../../_lib/user";
import { planDetails } from "../../../_lib/groups";
import { buildIcs } from "@/frontend/lib/calendar";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ sid: string }> };

/** Download the group's plan as a calendar invite (Apple Calendar, Google Calendar, Outlook). */
export async function GET(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const sid = Number((await params).sid);

  const [member] = await sql`
    SELECT 1 FROM plan_sessions ps
    JOIN session_members sm ON sm.session_id = ps.group_id AND sm.user_id = ${user.id}
    WHERE ps.id = ${sid}`;
  if (!member) return Response.json({ detail: "Session not found." }, { status: 404 });

  const plan = await planDetails(sid);
  if (!plan) return Response.json({ detail: "This session doesn't have a plan yet." }, { status: 409 });

  const slug = plan.performer.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "concert";
  return new Response(buildIcs(plan, `certifi-session-${sid}@certifi.app`), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
    },
  });
}
