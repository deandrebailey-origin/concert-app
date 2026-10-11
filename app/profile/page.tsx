"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoaderCircle, Music, Plus, X } from "lucide-react";
import { AppShell } from "@/frontend/components/app-shell";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { ArtistTile, Avatar, Notice, TagChips } from "@/frontend/components/music-bits";

type Me = {
  user: { name: string; email: string | null };
  has_profile: boolean;
  top_tags: { name: string }[];
  source: "spotify" | "typed" | null;
  recent: string[];
  all_time: string[];
  spotify_connected: boolean;
};

const SPOTIFY_MESSAGES: Record<string, { kind: "success" | "error"; text: string }> = {
  connected: { kind: "success", text: "Spotify connected. Your taste profile is ready." },
  cancelled: { kind: "error", text: "Spotify connection was cancelled." },
  expired: { kind: "error", text: "That Spotify link expired. Try connecting again." },
  empty: { kind: "error", text: "Spotify has no top artists for this account yet. Type a few favorites instead." },
  error: { kind: "error", text: "Something went wrong connecting Spotify. Your account may not be on the app's allowed-user list." },
};

function ProfileContent() {
  const params = useSearchParams();
  const spotifyNotice = SPOTIFY_MESSAGES[params.get("spotify") ?? ""];

  const [me, setMe] = useState<Me | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((data: Me) => {
      setMe(data);
      if (data.source === "typed") setPicks(data.all_time);
    });
  }, []);

  function addPick(e: FormEvent) {
    e.preventDefault();
    const names = draft.split(",").map((s) => s.trim()).filter(Boolean);
    setPicks((p) => [...new Set([...p, ...names])].slice(0, 20));
    setDraft("");
  }

  async function saveTyped() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/me/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artists: picks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setMe(data);
      setNotice({ kind: "success", text: "Taste profile updated." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  const favorites = [...new Set([...(me?.recent ?? []), ...(me?.all_time ?? [])])];

  return (
    <div className="max-w-5xl">
      {/* header, like the profile mockup */}
      <section className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar name={me?.user.name ?? "?"} className="size-28 text-4xl" />
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.05em]">{me?.user.name ?? "…"}</h1>
          <p className="text-sm text-[#66716b]">{me?.user.email}</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#53604e]">
            <Music size={13} /> {me?.spotify_connected ? "Spotify connected" : me?.has_profile ? "Taste typed by hand" : "No taste profile yet"}
          </p>
        </div>
      </section>

      <div className="mt-6 space-y-3">
        {spotifyNotice && <Notice kind={spotifyNotice.kind}>{spotifyNotice.text}</Notice>}
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      </div>

      {me?.has_profile && (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Music preferences</h2>
          <div className="mt-3"><TagChips tags={me.top_tags} /></div>
        </section>
      )}

      {favorites.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Favorite artists</h2>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-6">
            {favorites.slice(0, 12).map((a) => (
              <ArtistTile key={a} name={a} />
            ))}
          </div>
        </section>
      )}

      {/* two ways to build taste */}
      <section className="mt-12 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[24px] border border-white bg-white/90 p-6 shadow-[0_12px_40px_rgba(48,63,48,.06)]">
          <h3 className="text-lg font-bold">Connect Spotify</h3>
          <p className="mt-1 text-sm text-[#66716b]">We read your top artists from the last month and all time. Nothing else.</p>
          <a href="/api/spotify/login" className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1ed760] px-5 text-sm font-bold text-[#0b2a16] transition hover:-translate-y-0.5">
            {me?.spotify_connected ? "Refresh from Spotify" : "Connect Spotify"}
          </a>
          <p className="mt-3 text-xs text-[#8a938d]">Spotify only allows accounts we've added during the hackathon. Everyone else can type their favorites.</p>
        </div>

        <div className="rounded-[24px] border border-white bg-white/90 p-6 shadow-[0_12px_40px_rgba(48,63,48,.06)]">
          <h3 className="text-lg font-bold">Type your favorites</h3>
          <p className="mt-1 text-sm text-[#66716b]">Add 3 to 20 artists, most loved first.</p>
          <form onSubmit={addPick} className="mt-4 flex gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="SZA, Bad Bunny, Kendrick Lamar" />
            <Button type="submit" variant="outline" aria-label="Add artist"><Plus size={17} /></Button>
          </form>
          {picks.length > 0 && (
            <ol className="mt-4 flex flex-wrap gap-2">
              {picks.map((p, i) => (
                <li key={p} className="flex items-center gap-1.5 rounded-full bg-[#f0f3ee] py-1.5 pl-3 pr-1.5 text-xs font-semibold">
                  <span className="text-[#8a938d]">{i + 1}</span> {p}
                  <button onClick={() => setPicks(picks.filter((x) => x !== p))} className="grid size-5 place-items-center rounded-full hover:bg-white" aria-label={`Remove ${p}`}><X size={12} /></button>
                </li>
              ))}
            </ol>
          )}
          <Button onClick={saveTyped} disabled={busy || picks.length < 3} className="mt-5 w-full">
            {busy ? <><LoaderCircle className="animate-spin" size={17} /> Building your profile (new artists take a moment)…</> : "Save my taste"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ProfileContent />
      </Suspense>
    </AppShell>
  );
}
