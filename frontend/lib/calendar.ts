/** Shared by the plan banner (Google link) and the .ics route, so both say the same thing. */
export type PlanDetails = {
  performer: string;
  event_name: string;
  group_name: string;
  date: string | null;          // "2026-11-14"
  time: string | null;          // "19:30" (local Orlando time) or null if Ticketmaster didn't list one
  min_price: number | null;
  max_price: number | null;
  venue_name: string | null;
  address: string | null;
  url: string | null;
  members: string[];
};

export const DEFAULT_TIME = "20:00";
export const EVENT_HOURS = 3;
export const TIMEZONE = "America/New_York";

export function priceLine(p: Pick<PlanDetails, "min_price" | "max_price">) {
  const fmt = (n: number) => `$${Math.round(n)}`;
  if (p.min_price == null) return "Price on Ticketmaster";
  if (p.max_price != null && Math.round(p.max_price) > Math.round(p.min_price)) return `${fmt(p.min_price)}–${fmt(p.max_price)} per ticket`;
  return `Tickets from ${fmt(p.min_price)}`;
}

export function timeLine(time: string | null) {
  if (!time) return "Time not listed — check your tickets";
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Local start/end as "YYYYMMDDTHHMMSS" strings (wall-clock time in Orlando). */
export function localStamps(p: Pick<PlanDetails, "date" | "time">) {
  const [y, mo, d] = (p.date ?? "").split("-").map(Number);
  const [h, mi] = (p.time ?? DEFAULT_TIME).split(":").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, d, h, mi));          // UTC used only as a calendar, not a timezone
  const end = new Date(start.getTime() + EVENT_HOURS * 3_600_000);
  const stamp = (t: Date) => t.toISOString().replace(/[-:]/g, "").slice(0, 15);
  return { start: stamp(start), end: stamp(end) };
}

export function eventTitle(p: PlanDetails) {
  return `${p.performer} · ${p.group_name}`;
}

export function eventNotes(p: PlanDetails) {
  return [
    `${p.event_name}`,
    `When: ${timeLine(p.time)}`,
    `Price: ${priceLine(p)}`,
    `Going: ${p.members.join(", ")}`,
    p.url ? `Tickets: ${p.url}` : null,
    "Planned with Certifi",
  ].filter(Boolean).join("\n");
}

export function eventLocation(p: PlanDetails) {
  return [p.venue_name, p.address].filter(Boolean).join(", ");
}

export function googleCalendarUrl(p: PlanDetails) {
  const { start, end } = localStamps(p);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(p),
    dates: `${start}/${end}`,
    ctz: TIMEZONE,
    details: eventNotes(p),
    location: eventLocation(p),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** iCalendar text escaping: backslash, comma, semicolon, newline. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Fold lines longer than 75 octets, as the iCalendar spec requires. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(p: PlanDetails, uid: string) {
  const { start, end } = localStamps(p);
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Certifi//Group concert plans//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${TIMEZONE}`,
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT",
    "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST",
    "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${TIMEZONE}:${start}`,
    `DTEND;TZID=${TIMEZONE}:${end}`,
    `SUMMARY:${esc(eventTitle(p))}`,
    `LOCATION:${esc(eventLocation(p))}`,
    `DESCRIPTION:${esc(eventNotes(p))}`,
    p.url ? `URL:${p.url}` : null,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`Tomorrow: ${p.performer}`)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return lines.map(fold).join("\r\n") + "\r\n";
}
