"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { AppShell } from "@/frontend/components/app-shell";
import { ArtistTile, EventCard, Notice, TagChips, type EventItem } from "@/frontend/components/music-bits";

type Me = {
  user: { name: string };
  has_profile: boolean;
  top_tags: { name: string }[];
  recent: string[];
  all_time: string[];
};

export default function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => setError("Couldn't load your profile."));
    fetch("/api/me/recommendations")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail);
        setEvents(data.events);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load shows."));
  }, []);

  const artists = [...new Set([...(me?.recent ?? []), ...(me?.all_time ?? [])])].slice(0, 12);
  const best = Math.max(...(events ?? []).map((e) => e.group_score), 0.0001);

  return (
    <AppShell>
      <header className="max-w-5xl">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#819a56]">Discover</p>
        <h1 className="mt-2 text-4xl font-bold tracking-[-0.05em]">{me ? `Hey ${me.user.name.split(" ")[0]}, here's what's on.` : "Here's what's on."}</h1>
        <p className="mt-2 text-[#66716b]">Upcoming shows near UCF, ranked for your taste.</p>
      </header>

      {me && !me.has_profile && (
        <Link href="/profile" className="mt-8 flex items-center gap-4 rounded-[22px] border border-[#dfe7d8] bg-[#f0f8e6] p-5 transition hover:-translate-y-0.5">
          <Sparkles className="text-[#7d9f35]" />
          <div className="flex-1">
            <p className="font-bold">Build your taste profile first</p>
            <p className="text-sm text-[#66716b]">Connect Spotify or type a few favorite artists, and we'll find shows for you.</p>
          </div>
          <ArrowRight size={18} />
        </Link>
      )}

      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}

      {me?.has_profile && (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Shows for you</h2>
          {events === null && !error && (
            <p className="mt-4 flex items-center gap-2 text-sm text-[#66716b]"><LoaderCircle className="animate-spin" size={16} /> Matching shows to your taste…</p>
          )}
          {events && events.length === 0 && <div className="mt-4"><Notice>No upcoming shows found yet. Try again after the next event refresh.</Notice></div>}
          <div className="mt-4 grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]">
            {events?.map((e, i) => <EventCard key={e.id} event={e} best={best} rank={i + 1} />)}
          </div>
        </section>
      )}

      {me?.has_profile && (
        <section className="mt-12">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.03em]">Your sound</h2>
              <p className="text-sm text-[#66716b]">What your recommendations are built from.</p>
            </div>
            <Link href="/profile" className="text-sm font-semibold text-[#53604e] underline decoration-[#c9f36b] decoration-2 underline-offset-4">Edit taste</Link>
          </div>
          <div className="mt-4"><TagChips tags={me.top_tags.slice(0, 8)} /></div>
          <div className="mt-6 grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))]">
            {artists.map((a) => <ArtistTile key={a} name={a} />)}
          </div>
        </section>
      )}
    </AppShell>
  );
}
