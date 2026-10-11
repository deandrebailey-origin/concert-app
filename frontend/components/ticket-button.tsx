"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, LoaderCircle, Ticket } from "lucide-react";
import { cn } from "@/frontend/lib/utils";

/** The bits of a show we save to My concerts. */
export type TicketEvent = {
  id: string;
  name?: string;
  performer: string;
  genre?: string | null;
  date: string | null;
  url: string | null;
  venue: { name: string | null; address: string | null };
  distance_mi?: number | null;
};

type Stage = "idle" | "ask" | "saving" | "saved" | "error";

/**
 * "Tickets" link that, once clicked, asks whether you actually bought tickets.
 * Yes -> the show is saved to My concerts.
 */
export function TicketButton({ event, saved = false, className, tone = "light" }: {
  event: TicketEvent; saved?: boolean; className?: string; tone?: "light" | "dark";
}) {
  const [stage, setStage] = useState<Stage>(saved ? "saved" : "idle");
  useEffect(() => { if (saved) setStage("saved"); }, [saved]);
  useEffect(() => {
    if (stage !== "ask" && stage !== "error") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setStage("idle"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);

  async function addToMyConcerts() {
    setStage("saving");
    try {
      const res = await fetch("/api/me/concerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      });
      setStage(res.ok ? "saved" : "error");
    } catch {
      setStage("error");
    }
  }

  const dark = tone === "dark";
  if (!event.url) return null;

  return (
    <>
      <a
        href={event.url}
        target="_blank"
        rel="noreferrer"
        onClick={() => { if (stage !== "saved") setStage("ask"); }}
        className={className}
      >
        <Ticket size={15} /> Tickets
      </a>

      {(stage === "ask" || stage === "saving" || stage === "error") && createPortal(
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => { if (e.target === e.currentTarget && stage !== "saving") setStage("idle"); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="ticket-q" className="w-full max-w-sm rounded-lg bg-white p-6 text-[#17141f] shadow-2xl">
            <span className="grid size-11 place-items-center rounded-md bg-[#f1ecff] text-[#6d4fd1]"><Ticket size={20} /></span>
            <h2 id="ticket-q" className="mt-4 text-lg font-bold tracking-[-0.02em]">Did you get tickets?</h2>
            <p className="mt-1 text-sm text-[#6b6676]">
              {event.performer}{event.venue.name ? ` at ${event.venue.name}` : ""}. If you did, we&apos;ll add it to My concerts.
            </p>
            {stage === "error" && <p className="mt-2 text-xs font-semibold text-red-700">Couldn&apos;t save it. Try again.</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStage("idle")}
                disabled={stage === "saving"}
                className="inline-flex h-10 items-center rounded-md border border-[#e2dcf0] bg-white px-4 text-sm font-semibold text-[#5a5368] transition hover:border-[#bdb8c7] disabled:opacity-60"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={addToMyConcerts}
                disabled={stage === "saving"}
                autoFocus
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[#6d4fd1] px-4 text-sm font-bold text-white transition hover:bg-[#5b3fc0] disabled:opacity-60"
              >
                {stage === "saving" ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Yes, add it
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {stage === "saved" && (
        <Link
          href="/my-concerts"
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-bold",
            dark ? "basis-full text-[#c9b8ff]" : "mt-2.5 justify-center text-[#6d4fd1]",
          )}
        >
          <Check size={14} /> In My concerts
        </Link>
      )}
    </>
  );
}
