"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Clock, Copy, LoaderCircle, PartyPopper, Plus, Sparkles, ThumbsDown, ThumbsUp, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/frontend/components/app-shell";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Avatar, EventCard, Notice, type EventItem } from "@/frontend/components/music-bits";
import { cn } from "@/frontend/lib/utils";

type GroupSummary = { id: number; name: string; members: { id: number; name: string }[]; has_open_session: boolean };
type Member = { id: number; name: string; email: string | null; has_profile: boolean; top_tags: { name: string }[] };
type Pick = { event_id: string; rank: number; event: EventItem; yes: number[]; no: number[] };
type Session = { id: number; status: "open" | "picked" | "expired"; expires_at: string; picked_event_id: string | null; picks: Pick[] };
type GroupDetail = { group: { id: number; name: string; invite_code: string }; members: Member[]; me: number; session: Session | null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Something went wrong.");
  return data as T;
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function timeLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "closing now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function GroupsContent() {
  const params = useSearchParams();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(Number(params.get("g")) || null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [email, setEmail] = useState("");
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const loadGroups = useCallback(async () => {
    const { groups } = await api<{ groups: GroupSummary[] }>("/api/groups");
    setGroups(groups);
    setSelected((s) => s ?? groups[0]?.id ?? null);
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    setDetail(await api<GroupDetail>(`/api/groups/${id}`));
  }, []);

  useEffect(() => { loadGroups().catch((e) => setNotice({ kind: "error", text: e.message })); }, [loadGroups]);

  useEffect(() => {
    if (selected === null) return;
    setNotice(null);
    loadDetail(selected).catch((e) => setNotice({ kind: "error", text: e.message }));
    // refresh every 10s so friends' votes show up without reloading
    const timer = setInterval(() => loadDetail(selected).catch(() => {}), 10_000);
    return () => clearInterval(timer);
  }, [selected, loadDetail]);

  const run = async (fn: () => Promise<void>) => {
    setNotice(null);
    try { await fn(); } catch (err) { setNotice({ kind: "error", text: (err as Error).message }); }
  };

  const createGroup = (e: FormEvent) => { e.preventDefault(); if (!newName.trim()) return; run(async () => {
    const { group } = await api<{ group: { id: number } }>("/api/groups", postJson({ name: newName }));
    setNewName(""); await loadGroups(); setSelected(group.id);
  }); };

  const joinGroup = (e: FormEvent) => { e.preventDefault(); if (!joinCode.trim()) return; run(async () => {
    const { group } = await api<{ group: { id: number; name: string } }>("/api/groups/join", postJson({ code: joinCode }));
    setJoinCode(""); await loadGroups(); setSelected(group.id);
    setNotice({ kind: "success", text: `You joined ${group.name}.` });
  }); };

  const addMember = (e: FormEvent) => { e.preventDefault(); if (selected === null || !email.trim()) return; run(async () => {
    const { added } = await api<{ added: { name: string } }>(`/api/groups/${selected}/members`, postJson({ email }));
    setEmail(""); setNotice({ kind: "success", text: `${added.name} joined the group.` });
    await Promise.all([loadDetail(selected), loadGroups()]);
  }); };

  const startSession = () => { if (selected === null) return; setStarting(true); run(async () => {
    await api(`/api/groups/${selected}/sessions`, postJson({}));
    await Promise.all([loadDetail(selected), loadGroups()]);
  }).finally(() => setStarting(false)); };

  const vote = (sessionId: number, eventId: string, value: boolean) => run(async () => {
    const { session } = await api<{ session: Session }>(`/api/sessions/${sessionId}/vote`, postJson({ event_id: eventId, vote: value }));
    setDetail((d) => (d ? { ...d, session } : d));
    if (session.status === "picked") loadGroups().catch(() => {});
  });

  async function copyInvite() {
    if (!detail) return;
    await navigator.clipboard.writeText(`${window.location.origin}/join/${detail.group.invite_code}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const session = detail?.session ?? null;
  const memberName = (id: number) => detail?.members.find((m) => m.id === id)?.name ?? "Someone";
  const picked = session?.status === "picked" ? session.picks.find((p) => p.event_id === session.picked_event_id) : undefined;
  const best = Math.max(...(session?.picks ?? []).map((p) => p.event.group_score), 0.0001);

  return (
    <div className="grid max-w-6xl gap-6 lg:grid-cols-[280px_1fr]">
      {/* group list, like the chat list in the mockup */}
      <aside className="rounded-[24px] border border-white bg-white/90 p-4 shadow-[0_12px_40px_rgba(48,63,48,.06)] lg:self-start">
        <h1 className="px-1 text-lg font-bold">Groups</h1>
        <form onSubmit={createGroup} className="mt-3 flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group name" className="h-10" />
          <Button type="submit" size="sm" className="h-10 px-3" aria-label="Create group"><Plus size={16} /></Button>
        </form>
        <form onSubmit={joinGroup} className="mt-2 flex gap-2">
          <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Join with code" maxLength={6} className="h-10 uppercase tracking-[.2em] placeholder:normal-case placeholder:tracking-normal" />
          <Button type="submit" variant="outline" size="sm" className="h-10 px-3">Join</Button>
        </form>
        <ul className="mt-4 space-y-1">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                onClick={() => setSelected(g.id)}
                className={cn("flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition", g.id === selected ? "bg-[#f0f3ee]" : "hover:bg-[#f7f8f5]")}
              >
                <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-[#17211c] text-[#c9f36b]">
                  <Users size={17} />
                  {g.has_open_session && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-white bg-[#9bc851]" title="Session open" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{g.name}</span>
                  <span className="block truncate text-xs text-[#66716b]">{g.members.map((m) => m.name.split(" ")[0]).join(", ")}</span>
                </span>
              </button>
            </li>
          ))}
          {groups.length === 0 && <li className="px-1 py-6 text-center text-sm text-[#8a938d]">No groups yet. Create one or join with a code.</li>}
        </ul>
      </aside>

      <section className="min-w-0">
        {notice && <div className="mb-4"><Notice kind={notice.kind}>{notice.text}</Notice></div>}

        {!detail ? (
          <div className="grid min-h-80 place-items-center rounded-[24px] border border-dashed border-[#dfe7d8] text-center text-[#66716b]">
            <div><Users className="mx-auto mb-3 text-[#819a56]" /> Create or join a group to plan a show together.</div>
          </div>
        ) : (
          <>
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#819a56]">Group</p>
                <h2 className="mt-1 text-3xl font-bold tracking-[-0.05em]">{detail.group.name}</h2>
              </div>
              <button onClick={copyInvite} className="inline-flex items-center gap-2 self-start rounded-xl border border-[#e3e8e2] bg-white px-3 py-2 text-sm font-semibold transition hover:border-[#b8c3b9] sm:self-auto">
                <span className="font-mono tracking-[.2em]">{detail.group.invite_code}</span>
                {copied ? <><Check size={15} className="text-[#7d9f35]" /> Link copied</> : <><Copy size={15} /> Copy invite link</>}
              </button>
            </header>

            {/* members */}
            <div className="mt-6 rounded-[24px] border border-white bg-white/90 p-5 shadow-[0_12px_40px_rgba(48,63,48,.06)]">
              <h3 className="text-sm font-bold">Members</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {detail.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <Avatar name={m.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{m.name}{m.id === detail.me && <span className="font-normal text-[#8a938d]"> (you)</span>}</p>
                      <p className="truncate text-xs capitalize text-[#66716b]">
                        {m.has_profile ? m.top_tags.slice(0, 3).map((t) => t.name).join(" · ") : "No taste profile yet"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <form onSubmit={addMember} className="mt-5 flex gap-2">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Or add a friend by email" className="h-10" />
                <Button type="submit" variant="outline" size="sm" className="h-10 px-3"><UserPlus size={16} /> Add</Button>
              </form>
            </div>

            {/* the plan, once everyone agrees */}
            {picked && (
              <div className="mt-6 rounded-[24px] bg-[#17211c] p-6 text-white">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#c9f36b]"><PartyPopper size={15} /> It&apos;s a plan</p>
                <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Everyone&apos;s in for {picked.event.performer}</h3>
                <p className="mt-1 text-sm text-white/70">
                  {picked.event.venue.name}{picked.event.date ? ` · ${new Date(`${picked.event.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}` : ""}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {picked.event.url && <a href={picked.event.url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-xl bg-[#c9f36b] px-5 text-sm font-bold text-[#17211c]">Get tickets</a>}
                  <button onClick={startSession} disabled={starting} className="inline-flex h-11 items-center rounded-xl border border-white/20 px-5 text-sm font-semibold hover:bg-white/10">Plan another show</button>
                </div>
              </div>
            )}

            {/* no open session: offer to start one */}
            {(!session || session.status === "expired") && (
              <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-dashed border-[#cfdcc4] bg-[#f0f8e6]/60 p-6 sm:flex-row sm:items-center">
                <Sparkles className="shrink-0 text-[#7d9f35]" />
                <div className="flex-1">
                  <p className="font-bold">{session?.status === "expired" ? "Your last session expired" : "Start a session"}</p>
                  <p className="text-sm text-[#66716b]">We&apos;ll find shows that fit everyone. Vote on them; the first show everyone says yes to becomes the plan. Sessions close after 24 hours.</p>
                </div>
                <Button onClick={startSession} disabled={starting}>
                  {starting ? <><LoaderCircle className="animate-spin" size={17} /> Finding shows…</> : "Start session"}
                </Button>
              </div>
            )}

            {/* open session: vote */}
            {session?.status === "open" && (
              <div className="mt-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-xl font-bold tracking-[-0.03em]"><Sparkles size={18} className="text-[#7d9f35]" /> Vote on the picks</h3>
                    <p className="text-sm text-[#66716b]">First show everyone says yes to becomes the plan.</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#66716b]"><Clock size={13} /> {timeLeft(session.expires_at)}</span>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {session.picks.map((p) => {
                    const myVote = p.yes.includes(detail.me) ? true : p.no.includes(detail.me) ? false : null;
                    return (
                      <EventCard
                        key={p.event_id}
                        event={p.event}
                        best={best}
                        rank={p.rank}
                        showMembers
                        footer={
                          <div className="mt-4 border-t border-[#eef2ea] pt-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => vote(session.id, p.event_id, true)}
                                className={cn("flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition", myVote === true ? "bg-[#9bc851] text-[#17211c]" : "bg-[#f0f3ee] hover:bg-[#e4eadf]")}
                              ><ThumbsUp size={15} /> I&apos;m in</button>
                              <button
                                onClick={() => vote(session.id, p.event_id, false)}
                                className={cn("flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition", myVote === false ? "bg-[#17211c] text-white" : "bg-[#f0f3ee] hover:bg-[#e4eadf]")}
                              ><ThumbsDown size={15} /> Pass</button>
                            </div>
                            <p className="mt-2 text-xs text-[#66716b]">
                              <span className="font-bold text-[#17211c]">{p.yes.length}/{detail.members.length}</span> in
                              {p.yes.length > 0 && ` · ${p.yes.map((id) => memberName(id).split(" ")[0]).join(", ")}`}
                            </p>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default function GroupsPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <GroupsContent />
      </Suspense>
    </AppShell>
  );
}
