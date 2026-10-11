"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, CalendarPlus, Clock, LoaderCircle, MapPin, Ticket, Trash2 } from "lucide-react";
import { AppShell } from "@/frontend/components/app-shell";
import { Notice } from "@/frontend/components/music-bits";
import { googleCalendarUrl, priceLine, timeLine, type PlanDetails } from "@/frontend/lib/calendar";

type Concert = PlanDetails & { event_id: string; genre: string | null; distance_mi: number | null };

const today = () => new Date().toISOString().slice(0, 10);

export default function MyConcertsPage() {
  const [concerts, setConcerts] = useState<Concert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/concerts")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.detail ?? "Couldn't load your concerts.");
        setConcerts(data.concerts);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your concerts."));
  }, []);

  async function remove(id: string) {
    setRemoving(id);
    const res = await fetch(`/api/me/concerts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setConcerts((list) => list?.filter((c) => c.event_id !== id) ?? null);
    else setError("Couldn't remove that concert. Try again.");
    setRemoving(null);
  }

  const upcoming = concerts?.filter((c) => !c.date || c.date >= today()) ?? [];
  const past = concerts?.filter((c) => c.date && c.date < today()) ?? [];

  return (
    <AppShell>
      <header>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#7c5cdb]">Your tickets</p>
        <h1 className="mt-2 text-4xl font-bold tracking-[-0.05em]">My concerts</h1>
        <p className="mt-2 text-[#6b6676]">Shows you&apos;ve got tickets for.</p>
      </header>

      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}

      {concerts === null && !error && (
        <p className="mt-8 flex items-center gap-2 text-sm text-[#6b6676]"><LoaderCircle className="animate-spin" size={16} /> Loading your tickets…</p>
      )}

      {concerts && concerts.length === 0 && (
        <div className="mt-8 border-t border-[#e6e3ec] pt-8">
          <p className="font-semibold">No concerts yet.</p>
          <p className="mt-1 text-sm text-[#6b6676]">When you open Tickets on a show and say you bought them, it lands here.</p>
          <Link href="/" className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-[#6d4fd1] px-4 text-sm font-bold text-white transition hover:bg-[#5b3fc0]">Find a show</Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8 border-t border-[#e6e3ec] pt-8">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Upcoming <span className="ml-1 text-base font-semibold text-[#8d8898]">{upcoming.length}</span></h2>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {upcoming.map((c) => <Stub key={c.event_id} concert={c} onRemove={remove} removing={removing === c.event_id} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-10 border-t border-[#e6e3ec] pt-8">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Past shows <span className="ml-1 text-base font-semibold text-[#8d8898]">{past.length}</span></h2>
          <div className="mt-5 grid gap-5 opacity-70 xl:grid-cols-2">
            {past.map((c) => <Stub key={c.event_id} concert={c} onRemove={remove} removing={removing === c.event_id} past />)}
          </div>
        </section>
      )}
    </AppShell>
  );
}

/** A ticket stub: details on the left, tear-off date stub on the right. */
function Stub({ concert: c, onRemove, removing, past = false }: { concert: Concert; onRemove: (id: string) => void; removing: boolean; past?: boolean }) {
  const date = c.date ? new Date(`${c.date}T12:00:00`) : null;
  const action = "inline-flex h-9 items-center gap-1.5 rounded-md border border-[#e6e3ec] bg-white px-3 text-xs font-semibold text-[#5a5368] transition hover:border-[#bdb8c7]";

  return (
    <article className="flex overflow-hidden rounded-lg border border-[#e6e3ec] bg-white">
      <div className="min-w-0 flex-1 p-5">
        {c.genre && c.genre !== "Undefined" && c.genre !== "Other" && (
          <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#7c5cdb]">{c.genre}</p>
        )}
        <h3 className="mt-1 truncate text-xl font-bold tracking-[-.03em]">{c.performer}</h3>
        {c.event_name && c.event_name !== c.performer && <p className="truncate text-sm text-[#8d8898]">{c.event_name}</p>}

        <dl className="mt-4 space-y-1.5 text-sm text-[#5a5368]">
          <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-[#8d8898]" />
            <span className="min-w-0"><span className="font-semibold text-[#17141f]">{c.venue_name ?? "Venue TBA"}</span>{c.address && <span className="block truncate text-xs text-[#8d8898]">{c.address}</span>}</span>
          </div>
          <div className="flex items-center gap-2"><CalendarDays size={15} className="shrink-0 text-[#8d8898]" />
            {date ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Date TBA"}
          </div>
          <div className="flex items-center gap-2"><Clock size={15} className="shrink-0 text-[#8d8898]" />{timeLine(c.time)}</div>
          <div className="flex items-center gap-2"><Ticket size={15} className="shrink-0 text-[#8d8898]" />{priceLine(c)}</div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-[#efedf3] pt-4">
          {!past && date && (
            <>
              <a href={`/api/me/concerts/${encodeURIComponent(c.event_id)}/calendar.ics`} className={action}><CalendarPlus size={14} /> Add to calendar</a>
              <a href={googleCalendarUrl(c)} target="_blank" rel="noreferrer" className={action}>Google Calendar</a>
            </>
          )}
          {c.url && <a href={c.url} target="_blank" rel="noreferrer" className={action}><Ticket size={14} /> Tickets</a>}
          <button type="button" onClick={() => onRemove(c.event_id)} disabled={removing} className={`${action} hover:border-red-200 hover:text-red-700 disabled:opacity-50`}>
            {removing ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />} Remove
          </button>
        </div>
      </div>

      {/* tear-off stub */}
      <div className="relative flex w-28 shrink-0 flex-col items-center justify-center border-l-2 border-dashed border-[#e2dcf0] bg-[#f6f3ff] px-3 text-center sm:w-32">
        <span aria-hidden="true" className="absolute -left-[9px] -top-2 size-4 rounded-full border border-[#e6e3ec] bg-[#f8f7fa]" />
        <span aria-hidden="true" className="absolute -bottom-2 -left-[9px] size-4 rounded-full border border-[#e6e3ec] bg-[#f8f7fa]" />
        <span className="text-xs font-bold uppercase tracking-[.16em] text-[#7c5cdb]">{date ? date.toLocaleString("en-US", { month: "short" }) : "TBA"}</span>
        <span className="text-4xl font-extrabold leading-none tracking-[-0.04em] text-[#17141f]">{date ? date.getDate() : "—"}</span>
        <span className="mt-1 text-xs font-semibold text-[#6b6676]">{date ? date.toLocaleDateString("en-US", { weekday: "short" }) : ""}</span>
        <span className="mt-3 text-[9px] font-bold uppercase tracking-[.22em] text-[#96919f]">Admit one</span>
      </div>
    </article>
  );
}
