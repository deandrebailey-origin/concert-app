"use client";

import { ChangeEvent, FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoaderCircle, Music, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { AppShell } from "@/frontend/components/app-shell";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { ArtistTile, Avatar, Notice, TagChips } from "@/frontend/components/music-bits";

const MAX_ARTISTS = 40;

/** Split "SZA, Bad Bunny" into names and merge into the list, keeping order and skipping repeats. */
function mergeNames(list: string[], text: string) {
  const seen = new Set(list.map((n) => n.toLowerCase()));
  const out = [...list];
  for (const name of text.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out.slice(0, MAX_ARTISTS);
}

type Me = {
  user: { name: string; email: string | null; avatar_data: string | null };
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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [confirmAvatarReset, setConfirmAvatarReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.detail ?? "Couldn't load your profile. Try refreshing the page.");
        if (!data) throw new Error("The server returned an empty profile response. Try refreshing the page.");
        return data as Me;
      })
      .then((data) => {
        setMe(data);
        // start from the current favorites (Spotify or typed) so typing adds to them instead of replacing
        setPicks(mergeNames([], [...data.recent, ...data.all_time].join(",")));
      })
      .catch((error: unknown) => {
        setNotice({ kind: "error", text: error instanceof Error ? error.message : "Couldn't load your profile." });
      });
  }, []);

  function addPick(e: FormEvent) {
    e.preventDefault();
    setPicks((p) => mergeNames(p, draft));
    setDraft("");
  }

  async function saveTyped() {
    const artists = mergeNames(picks, draft);   // include anything still sitting in the box
    setPicks(artists);
    setDraft("");
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/me/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artists }),
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

  async function updateAvatar(image: string | null) {
    setAvatarBusy(true);
    setAvatarError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/me/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (/image type|file type|png|jpeg/i.test(data?.detail ?? "")) {
          setAvatarError("Invalid file type");
          return;
        }
        throw new Error(data?.detail ?? "Couldn't update your profile picture.");
      }
      if (!data?.user) throw new Error("The server returned an invalid profile response.");
      setMe((current) => current ? { ...current, user: { ...current.user, avatar_data: data.user.avatar_data } } : current);
      setNotice({ kind: "success", text: image ? "Profile picture updated." : "Initials avatar restored." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Couldn't update your profile picture." });
    } finally {
      setAvatarBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!(extension === "png" && file.type === "image/png") &&
        (!(extension === "jpg" || extension === "jpeg") || file.type !== "image/jpeg")) {
      setAvatarError("Invalid file type");
      event.target.value = "";
      return;
    }
    setAvatarError(null);
    if (file.size > 2 * 1024 * 1024) {
      setNotice({ kind: "error", text: "Images must be 2 MB or smaller." });
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") void updateAvatar(reader.result);
    };
    reader.onerror = () => setNotice({ kind: "error", text: "Couldn't read that image file." });
    reader.readAsDataURL(file);
  }

  const favorites = [...new Set([...(me?.recent ?? []), ...(me?.all_time ?? [])])];
  const pending = mergeNames(picks, draft);
  const needed = Math.max(0, 3 - pending.length);

  return (
    <div>
      {/* header, like the profile mockup */}
      <section className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="relative">
            <Avatar name={me?.user.name ?? "?"} image={me?.user.avatar_data} className="size-28 text-4xl" />
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,.png,.jpeg,.jpg" onChange={chooseAvatar} className="sr-only" aria-label="Choose a profile picture" />
            {me?.user.avatar_data && (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => setConfirmAvatarReset(true)}
                aria-label="Revert profile picture to initials"
                title="Revert to initials"
                className="absolute bottom-0 left-0 grid size-8 -translate-x-1/4 translate-y-1/4 place-items-center rounded-full border-2 border-[#17141f] bg-white text-[#17141f] shadow-md transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17141f] focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:scale-100"
              >
                <RotateCcw size={15} />
              </button>
            )}
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileInput.current?.click()}
              aria-label="Change profile picture"
              className="absolute bottom-0 right-0 grid size-9 translate-x-1/4 translate-y-1/4 place-items-center rounded-full border-2 border-[#17141f] bg-white text-[#17141f] shadow-md transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17141f] focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              {avatarBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Pencil size={16} />}
            </button>
          </div>
          {avatarError && <p role="alert" className="text-xs font-semibold text-red-700">{avatarError}</p>}
        </div>
        <div className="min-w-0 text-center sm:text-left">
          <h1 className="text-3xl font-bold tracking-[-0.05em]">{me?.user.name ?? "…"}</h1>
          <p className="text-sm text-[#6b6676]">{me?.user.email}</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-[#e2dcf0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5a5368]">
            <Music size={13} /> {me?.spotify_connected ? "Spotify connected" : me?.has_profile ? "Taste typed by hand" : "No taste profile yet"}
          </p>
        </div>
      </section>

      <div className="mt-6 space-y-3">
        {spotifyNotice && <Notice kind={spotifyNotice.kind}>{spotifyNotice.text}</Notice>}
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      </div>

      {me?.has_profile && (
        <section className="mt-10 border-t border-[#e6e3ec] pt-8">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Music preferences</h2>
          <div className="mt-3"><TagChips tags={me.top_tags} /></div>
        </section>
      )}

      {favorites.length > 0 && (
        <section className="mt-10 border-t border-[#e6e3ec] pt-8">
          <h2 className="text-xl font-bold tracking-[-0.03em]">
            Favorite artists <span className="ml-1 text-base font-semibold text-[#8d8898]">{favorites.length}</span>
          </h2>
          <div className="mt-4 grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))]">
            {favorites.map((a) => (
              <ArtistTile key={a} name={a} />
            ))}
          </div>
        </section>
      )}

      {/* two ways to build taste */}
      <section className="mt-12 grid border-t border-[#e6e3ec] lg:grid-cols-2 lg:divide-x lg:divide-[#e6e3ec]">
        <div className="py-8 lg:pr-8">
          <h3 className="text-lg font-bold">Connect Spotify</h3>
          <p className="mt-1 text-sm text-[#6b6676]">We read your top artists from the last month and all time. Nothing else.</p>
          <a href="/api/spotify/login" className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#1ed760] px-5 text-sm font-bold text-[#0b2a16] transition hover:-translate-y-0.5">
            {me?.spotify_connected ? "Refresh from Spotify" : "Connect Spotify"}
          </a>
          <p className="mt-3 text-xs text-[#8d8898]">Spotify only allows accounts we've added during the hackathon. Everyone else can type their favorites.</p>
        </div>

        <div className="border-t border-[#e6e3ec] py-8 lg:border-t-0 lg:pl-8">
          <h3 className="text-lg font-bold">Type your favorites</h3>
          <p className="mt-1 text-sm text-[#6b6676]">Add at least 3 artists, most loved first. Separate names with commas.</p>
          <form onSubmit={addPick} className="mt-4 flex gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="SZA, Bad Bunny, Kendrick Lamar" />
            <Button type="submit" variant="outline" aria-label="Add artist"><Plus size={17} /></Button>
          </form>
          <p className="mt-2 text-xs font-semibold text-[#8d8898]">
            {pending.length}/{MAX_ARTISTS} artists{needed > 0 ? ` · add ${needed} more to save` : ""}
          </p>
          {picks.length > 0 && (
            <ol className="mt-4 flex flex-wrap gap-2">
              {picks.map((p, i) => (
                <li key={p} className="flex items-center gap-1.5 rounded-md bg-[#f2f0f6] py-1.5 pl-3 pr-1.5 text-xs font-semibold">
                  <span className="text-[#8d8898]">{i + 1}</span> {p}
                  <button type="button" onClick={() => setPicks(picks.filter((x) => x !== p))} className="grid size-5 place-items-center rounded-full hover:bg-white" aria-label={`Remove ${p}`}><X size={12} /></button>
                </li>
              ))}
            </ol>
          )}
          <Button onClick={saveTyped} disabled={busy || pending.length < 3} className="mt-5 w-full">
            {busy ? <><LoaderCircle className="animate-spin" size={17} /> Building your profile (new artists take a moment)…</> : "Save my taste"}
          </Button>
        </div>
      </section>

      {confirmAvatarReset && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setConfirmAvatarReset(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="avatar-reset-title" className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 id="avatar-reset-title" className="text-lg font-bold">Revert profile picture?</h2>
            <p className="mt-2 text-sm text-[#6b6676]">Are you sure you want to revert your profile pic?</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setConfirmAvatarReset(false)}>No</Button>
              <Button type="button" onClick={() => {
                setConfirmAvatarReset(false);
                void updateAvatar(null);
              }}>Yes</Button>
            </div>
          </section>
        </div>
      )}
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
