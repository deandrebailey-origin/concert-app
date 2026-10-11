"use client";

import { useState } from "react";
import { CalendarDays, Car, MapPin, Ticket } from "lucide-react";
import { cn } from "@/frontend/lib/utils";
import { normalizeTag, uniqueTags } from "@/frontend/lib/tags";

/** Same name always gets the same colors, so tiles stay consistent between pages. */
function palette(name: string) {
  const swatches = [
    ["#f2bba7", "#57392e"], ["#c8d9fd", "#364969"], ["#e1d2f3", "#58486a"],
    ["#e4d9ff", "#3f2690"], ["#fde2a7", "#6a4c12"], ["#bfe8e0", "#1f5a50"],
  ];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return swatches[h % swatches.length];
}

export function ArtistTile({ name }: { name: string }) {
  const [provider, setProvider] = useState<"auto" | "spotify" | "none">("auto");
  const [bg, fg] = palette(name);
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const imageSrc = provider === "auto"
    ? `/api/artists/image?name=${encodeURIComponent(name)}`
    : `/api/artists/image?provider=spotify&name=${encodeURIComponent(name)}`;

  return (
    <div className="min-w-0 transition-transform duration-200 ease-out hover:scale-[1.04] motion-reduce:transition-none motion-reduce:hover:scale-100">
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg text-2xl font-extrabold tracking-[-0.04em]" style={{ background: bg, color: fg }}>
        {provider !== "none" ? (
          <img
            src={imageSrc}
            alt={`${name} artist profile`}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
            onError={() => setProvider((current) => current === "auto" ? "spotify" : "none")}
          />
        ) : initials}
      </div>
      <p className="mt-2 truncate text-sm font-bold">{name}</p>
    </div>
  );
}

export function Avatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  const [bg, fg] = palette(name);
  return (
    <span className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-bold", className)} style={{ background: bg, color: fg }}>
      {image ? <img src={image} alt={`${name}'s profile`} className="absolute inset-0 size-full object-cover" /> : name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function TagChips({ tags }: { tags: { name: string }[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {uniqueTags(tags).map((t) => (
        <span key={t.name} className="rounded-md border border-[#e2dcf0] bg-white px-3 py-1.5 text-xs font-semibold capitalize text-[#5a5368]">
          {t.name}
        </span>
      ))}
    </div>
  );
}

export type EventItem = {
  id: string;
  name: string;
  performer: string;
  genre: string | null;
  date: string | null;
  url: string | null;
  venue: { name: string | null; address: string | null };
  group_score: number;
  member_scores: Record<string, number>;
  tags: string[];
  reason?: string;
  distance_mi?: number | null;
};

/** Ranked show card. `best` and `showMembers` are accepted for older callers but scores are never shown. */
export function EventCard({ event, rank, footer }: { event: EventItem; best?: number; rank: number; showMembers?: boolean; footer?: React.ReactNode }) {
  const date = event.date ? new Date(`${event.date}T12:00:00`) : null;
  const top = rank === 1;

  return (
    <article className={cn(
      "relative flex flex-col rounded-lg border bg-white p-5",
      top ? "border-[#a98bff] ring-2 ring-[#a98bff]/40" : "border-white",
    )}>
      <span className={cn(
        "absolute -top-3 left-5 rounded-md px-2.5 py-1 text-xs font-extrabold tracking-[-.01em] shadow-sm",
        top ? "bg-[#a98bff] text-[#17141f]" : "bg-[#17141f] text-white",
      )}>#{rank}{top ? " · Top pick" : ""}</span>

      <div className="mt-1 flex items-start gap-4">
        <div className="grid w-14 shrink-0 place-items-center rounded-lg bg-[#17141f] py-2 text-white">
          <span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a98bff]">{date ? date.toLocaleString("en-US", { month: "short" }) : "TBA"}</span>
          <span className="text-xl font-extrabold leading-none">{date ? date.getDate() : "—"}</span>
        </div>
        <div className="min-w-0 flex-1">
          {event.genre && event.genre !== "Undefined" && event.genre !== "Other" && (
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#7c5cdb]">{event.genre}</p>
          )}
          <h3 className="mt-1 truncate text-lg font-bold tracking-[-.03em]">{event.performer}</h3>
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-[#6b6676]"><MapPin size={14} className="shrink-0" /> {event.venue.name ?? "Venue TBA"}</p>
          {date && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#8d8898]"><CalendarDays size={13} /> {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>}
          {event.distance_mi != null && (
            event.distance_mi > 40 ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-[#fff3d6] px-2 py-0.5 text-[11px] font-bold text-[#7a5a12]">
                <Car size={12} /> {Math.round(event.distance_mi)} mi away · Road trip
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-[#8d8898]">{Math.round(event.distance_mi)} mi from UCF</p>
            )
          )}
        </div>
      </div>

      {event.reason && (
        <p className="mt-4 rounded-md bg-[#f6f3ff] px-3 py-2.5 text-sm leading-6 text-[#3d3557]">{event.reason}</p>
      )}

      {event.tags.length > 0 && (
        <p className="mt-3 truncate text-xs capitalize text-[#8d8898]">{[...new Set(event.tags.map(normalizeTag))].slice(0, 4).join(" · ")}</p>
      )}

      {event.url && (
        <a href={event.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#e6e3ec] text-sm font-semibold transition hover:border-[#bdb8c7] hover:bg-[#fcfbfd]">
          <Ticket size={15} /> Tickets
        </a>
      )}

      {footer}
    </article>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: React.ReactNode }) {
  return (
    <p className={cn(
      "rounded-md px-4 py-3 text-sm",
      kind === "error" && "bg-red-50 text-red-700",
      kind === "success" && "bg-[#f1ecff] text-[#4b2fa8]",
      kind === "info" && "bg-white text-[#6b6676]",
    )}>{children}</p>
  );
}
