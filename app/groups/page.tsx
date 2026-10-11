"use client";

import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, CalendarPlus, Check, Clock, Copy, Crown, FlaskConical, LoaderCircle, LogOut, Sparkles, Ticket, PartyPopper, Plus, Send, Square, ThumbsDown, ThumbsUp, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/frontend/components/app-shell";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Avatar, EventCard, Notice, type EventItem } from "@/frontend/components/music-bits";
import { cn } from "@/frontend/lib/utils";
import { googleCalendarUrl, priceLine, timeLine, type PlanDetails } from "@/frontend/lib/calendar";
import { uniqueTags } from "@/frontend/lib/tags";

type GroupSummary = { id: number; name: string; members: { id: number; name: string }[]; has_open_session: boolean };
type Member = { id: number; name: string; email: string | null; has_profile: boolean; top_tags: { name: string }[] };
type Pick = { event_id: string; rank: number; event: EventItem; yes: number[]; no: number[] };
type Session = {
  id: number; status: "open" | "picked" | "expired" | "ended"; prompt: string | null; reply: string | null;
  expires_at: string; picked_event_id: string | null; picks: Pick[];
};
type GroupDetail = {
  group: { id: number; name: string; invite_code: string };
  members: Member[]; me: number; host: number | null; session: Session | null; plan: PlanDetails | null;
};

const GREETING = "What we feeling today? 🎶 Tell me the vibe, the night, or the budget, and I'll find shows the whole crew will be into.";
// test tools show up while running `npm run dev` (hidden in production builds)
const SHOW_DEMO_TOOLS = process.env.NODE_ENV !== "production";

const SUGGESTIONS = ["Something chill this weekend", "Hype rap show, under $60", "Latin night out next Friday", "Surprise us"];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: { detail?: string } | null = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON, e.g. a server crash page */ }
  if (!res.ok || data === null) {
    throw new Error(data?.detail ?? `Server error ${res.status} on ${url}. Check the npm run dev terminal.`);
  }
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

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-end gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#c9f36b] text-[#17211c]"><Bot size={17} /></span>
      <div className="max-w-[min(42rem,85%)] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm leading-6 shadow-sm">{children}</div>
    </div>
  );
}

function UserBubble({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex items-end justify-end gap-2.5">
      <div className="max-w-[min(42rem,85%)] rounded-2xl rounded-br-md bg-[#17211c] px-4 py-3 text-sm leading-6 text-white shadow-sm">{children}</div>
      <Avatar name={name} className="size-9" />
    </div>
  );
}

function GroupsContent() {
  const params = useSearchParams();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(Number(params.get("g")) || null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [email, setEmail] = useState("");
  const [prompt, setPrompt] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [planningAgain, setPlanningAgain] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

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
    setPlanningAgain(false);
    loadDetail(selected).catch((e) => setNotice({ kind: "error", text: e.message }));
    // refresh every 10s so friends' votes and new sessions show up without reloading
    const timer = setInterval(() => loadDetail(selected).catch(() => {}), 10_000);
    return () => clearInterval(timer);
  }, [selected, loadDetail]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [pendingPrompt, detail?.session?.id]);

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

  const askBot = (text: string, quick = false) => {
    if (selected === null || pendingPrompt) return;
    const message = quick ? "Just find us shows we'd all like" : text.trim() || "Surprise us";
    setPendingPrompt(message);
    setPrompt("");
    run(async () => {
      await api(`/api/groups/${selected}/sessions`, postJson(quick ? { quick: true } : { prompt: message }));
      setPlanningAgain(false);
      await Promise.all([loadDetail(selected), loadGroups()]);
    }).finally(() => setPendingPrompt(null));
  };

  const vote = (sessionId: number, eventId: string, value: boolean) => run(async () => {
    const { session } = await api<{ session: Session }>(`/api/sessions/${sessionId}/vote`, postJson({ event_id: eventId, vote: value }));
    setDetail((d) => (d ? { ...d, session } : d));
    if (session.status === "picked") loadGroups().catch(() => {});
  });

  const endSession = (sessionId: number) => {
    run(async () => {
      const { session } = await api<{ session: Session }>(`/api/sessions/${sessionId}/end`, postJson({}));
      setDetail((d) => (d ? { ...d, session } : d));
      loadGroups().catch(() => {});
    });
  };

  const [demoBusy, setDemoBusy] = useState<string | null>(null);
  const demo = (label: string, url: string, body: unknown, done: (data: Record<string, unknown>) => string) => {
    if (selected === null) return;
    setDemoBusy(label);
    run(async () => {
      const data = await api<Record<string, unknown>>(url, postJson(body));
      await Promise.all([loadDetail(selected), loadGroups()]);
      setNotice({ kind: "success", text: done(data) });
    }).finally(() => setDemoBusy(null));
  };

  const leaveGroup = () => {
    if (selected === null || !detail) return;
    const name = detail.group.name;
    run(async () => {
      await api(`/api/groups/${selected}/leave`, postJson({}));
      setDetail(null);
      setSelected(null);
      await loadGroups();
      setNotice({ kind: "success", text: `You left ${name}.` });
    });
  };

  async function copyInvite() {
    if (!detail) return;
    await navigator.clipboard.writeText(`${window.location.origin}/join/${detail.group.invite_code}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const session = detail?.session ?? null;
  const isHost = detail ? detail.host === null || detail.host === detail.me : false;
  const hostName = detail?.members.find((m) => m.id === detail.host)?.name ?? "The host";
  const memberName = (id: number) => detail?.members.find((m) => m.id === id)?.name ?? "Someone";
  const picked = session?.status === "picked" ? session.picks.find((p) => p.event_id === session.picked_event_id) : undefined;
  // show the old conversation unless the host is starting a new one
  const showSession = session && session.status !== "ended" && !(planningAgain && session.status !== "open");
  const canAsk = isHost && !pendingPrompt &&
    (!session || session.status === "expired" || session.status === "ended" || (session.status === "picked" && planningAgain));

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_300px]">
      {/* ---- group list ---- */}
      <aside className="rounded-[24px] border border-white bg-white/90 p-4 shadow-[0_12px_40px_rgba(48,63,48,.06)] lg:sticky lg:top-8 lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col lg:self-start">
        <h1 className="px-1 text-lg font-bold">Groups</h1>
        <form onSubmit={createGroup} className="mt-3 flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group name" className="h-10" />
          <Button type="submit" size="sm" className="h-10 px-3" aria-label="Create group"><Plus size={16} /></Button>
        </form>
        <form onSubmit={joinGroup} className="mt-2 flex gap-2">
          <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Join with code" maxLength={6} className="h-10 uppercase tracking-[.2em] placeholder:normal-case placeholder:tracking-normal" />
          <Button type="submit" variant="outline" size="sm" className="h-10 px-3">Join</Button>
        </form>
        <ul className="mt-4 space-y-1 lg:-mr-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
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

      {!detail ? (
        <div className="grid min-h-[60vh] place-items-center rounded-[24px] border border-dashed border-[#dfe7d8] text-center text-[#66716b] 2xl:col-span-2">
          <div><Users className="mx-auto mb-3 text-[#819a56]" /> Create or join a group to plan a show together.</div>
        </div>
      ) : (
        <>
          {/* ---- chat + picks ---- */}
          <section className="min-w-0">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#819a56]">Group</p>
                <h2 className="mt-1 text-3xl font-bold tracking-[-0.05em]">{detail.group.name}</h2>
              </div>
              <button onClick={copyInvite} className="inline-flex items-center gap-2 self-start rounded-xl border border-[#e3e8e2] bg-white px-3 py-2 text-sm font-semibold transition hover:border-[#b8c3b9] sm:self-auto 2xl:hidden">
                <span className="font-mono tracking-[.2em]">{detail.group.invite_code}</span>
                {copied ? <><Check size={15} className="text-[#7d9f35]" /> Copied</> : <><Copy size={15} /> Invite</>}
              </button>
            </header>

            {notice && <div className="mt-4"><Notice kind={notice.kind}>{notice.text}</Notice></div>}

            {/* chat */}
            <div className="mt-5 space-y-4 rounded-[24px] bg-[#eef2ea]/70 p-4 sm:p-5">
              <BotBubble>{GREETING}</BotBubble>

              {showSession && session.prompt && <UserBubble name={hostName}>{session.prompt}</UserBubble>}
              {showSession && session.reply && (
                <BotBubble>
                  {session.reply}
                  {session.status === "open" && <span className="mt-1 block text-xs text-[#66716b]">Vote on the picks below. First show everyone&apos;s in on becomes the plan.</span>}
                </BotBubble>
              )}

              {pendingPrompt && (
                <>
                  <UserBubble name={detail.members.find((m) => m.id === detail.me)?.name ?? "You"}>{pendingPrompt}</UserBubble>
                  <BotBubble><span className="flex items-center gap-2 text-[#66716b]"><LoaderCircle className="animate-spin" size={15} /> Reading everyone&apos;s taste and finding shows…</span></BotBubble>
                </>
              )}
              <div ref={chatEnd} />

              {/* composer */}
              {canAsk ? (
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => askBot(s)} className="rounded-full border border-[#dfe7d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#53604e] transition hover:border-[#9bc851]">{s}</button>
                    ))}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); askBot(prompt); }} className="flex gap-2">
                    <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. something chill this weekend, under $50" className="bg-white" />
                    <Button type="submit" aria-label="Send"><Send size={17} /></Button>
                  </form>
                  <div className="flex items-center gap-3 text-xs text-[#8a938d]">
                    <span className="h-px flex-1 bg-[#dfe7d8]" /> or skip the chat <span className="h-px flex-1 bg-[#dfe7d8]" />
                  </div>
                  <Button type="button" variant="outline" className="w-full bg-white" onClick={() => askBot("", true)}>
                    <Sparkles size={16} className="text-[#7d9f35]" /> Just find shows for the group
                  </Button>
                </div>
              ) : !isHost && (!session || session.status !== "open") && session?.status !== "picked" && !pendingPrompt ? (
                <p className="flex items-center gap-2 pl-11 text-xs text-[#66716b]"><Crown size={13} className="text-[#9bc851]" /> Waiting for {hostName.split(" ")[0]} (the host) to tell the bot what the group&apos;s feeling.</p>
              ) : null}
            </div>

            {/* the plan */}
            {picked && showSession && (
              <div className="mt-6 rounded-[24px] bg-[#17211c] p-6 text-white sm:p-7">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#c9f36b]"><PartyPopper size={15} /> It&apos;s a plan</p>
                <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] sm:text-3xl">Everyone&apos;s in for {detail.plan?.performer ?? picked.event.performer}</h3>
                {(() => {
                  const plan = detail.plan;
                  const date = (plan?.date ?? picked.event.date) ? new Date(`${plan?.date ?? picked.event.date}T12:00:00`) : null;
                  return (
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-2xl bg-white/5 px-4 py-3">
                        <dt className="text-xs text-white/50">When</dt>
                        <dd className="mt-0.5 font-semibold">{date ? date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Date TBA"}</dd>
                        <dd className="text-white/70">{timeLine(plan?.time ?? null)}</dd>
                      </div>
                      <div className="rounded-2xl bg-white/5 px-4 py-3">
                        <dt className="text-xs text-white/50">Where</dt>
                        <dd className="mt-0.5 font-semibold">{plan?.venue_name ?? picked.event.venue.name ?? "Venue TBA"}</dd>
                        {plan?.address && <dd className="truncate text-white/70">{plan.address}</dd>}
                      </div>
                      <div className="rounded-2xl bg-white/5 px-4 py-3">
                        <dt className="text-xs text-white/50">Price</dt>
                        <dd className="mt-0.5 font-semibold">{plan ? priceLine(plan) : "Price on Ticketmaster"}</dd>
                        <dd className="text-white/70">{detail.members.length} going</dd>
                      </div>
                    </dl>
                  );
                })()}
                <div className="mt-5 flex flex-wrap gap-3">
                  {session && (
                    <a href={`/api/sessions/${session.id}/calendar.ics`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#c9f36b] px-5 text-sm font-bold text-[#17211c] transition hover:-translate-y-0.5">
                      <CalendarPlus size={16} /> Add to calendar
                    </a>
                  )}
                  {detail.plan && (
                    <a href={googleCalendarUrl(detail.plan)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 px-5 text-sm font-semibold transition hover:bg-white/10">
                      Google Calendar
                    </a>
                  )}
                  {(detail.plan?.url ?? picked.event.url) && (
                    <a href={(detail.plan?.url ?? picked.event.url)!} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 px-5 text-sm font-semibold transition hover:bg-white/10">
                      <Ticket size={16} /> Tickets
                    </a>
                  )}
                  {isHost && <button onClick={() => setPlanningAgain(true)} className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-white/70 hover:text-white">Plan another show</button>}
                </div>
              </div>
            )}

            {session?.status === "expired" && showSession && (
              <div className="mt-4"><Notice>That session expired before everyone agreed. {isHost ? "Ask the bot again above." : "The host can start a new one."}</Notice></div>
            )}

            {/* picks to vote on */}
            {showSession && session.status === "open" && (
              <div className="mt-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h3 className="text-xl font-bold tracking-[-0.03em]">The picks</h3>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#66716b]"><Clock size={13} /> {timeLeft(session.expires_at)}</span>
                    {isHost && (
                      <button onClick={() => endSession(session.id)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e3e8e2] bg-white px-3 py-1.5 text-xs font-semibold text-[#66716b] transition hover:border-red-200 hover:text-red-700">
                        <Square size={11} /> End session
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-5 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr))]">
                  {session.picks.map((p) => {
                    const myVote = p.yes.includes(detail.me) ? true : p.no.includes(detail.me) ? false : null;
                    return (
                      <EventCard
                        key={p.event_id}
                        event={p.event}
                        rank={p.rank}
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
                            <div className="mt-3 flex items-center gap-2">
                              <div className="flex -space-x-2">
                                {p.yes.map((id) => <Avatar key={id} name={memberName(id)} className="size-6 border-2 border-white text-[10px]" />)}
                              </div>
                              <span className="text-xs text-[#66716b]"><span className="font-bold text-[#17211c]">{p.yes.length}/{detail.members.length}</span> in</span>
                            </div>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ---- members + invite (own column on very wide screens) ---- */}
          <aside className="space-y-4 lg:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-8 2xl:self-start">
            <div className="hidden rounded-[24px] border border-white bg-white/90 p-5 shadow-[0_12px_40px_rgba(48,63,48,.06)] 2xl:block">
              <p className="text-sm font-bold">Invite friends</p>
              <p className="mt-1 text-xs text-[#66716b]">Share the link or have them enter the code.</p>
              <button onClick={copyInvite} className="mt-3 flex w-full items-center justify-between rounded-xl border border-[#e3e8e2] px-3 py-2.5 text-sm font-semibold transition hover:border-[#b8c3b9]">
                <span className="font-mono text-base tracking-[.25em]">{detail.group.invite_code}</span>
                {copied ? <span className="flex items-center gap-1 text-[#7d9f35]"><Check size={15} /> Copied</span> : <span className="flex items-center gap-1"><Copy size={15} /> Copy link</span>}
              </button>
            </div>

            {SHOW_DEMO_TOOLS && (
              <div className="rounded-[24px] border border-dashed border-[#cfdcc4] bg-[#f6f9f1] p-5">
                <p className="flex items-center gap-2 text-sm font-bold"><FlaskConical size={15} className="text-[#7d9f35]" /> Test tools</p>
                <p className="mt-1 text-xs text-[#66716b]">Try the group experience solo. Only visible in dev.</p>
                <div className="mt-3 grid gap-2">
                  <Button
                    variant="outline" size="sm" disabled={demoBusy !== null}
                    onClick={() => demo("friends", "/api/dev/demo-group", { group_id: detail.group.id },
                      (d) => `Added ${(d.added as string[]).join(", ")}. First time can take a minute while their artists load.`)}
                  >
                    {demoBusy === "friends" ? <LoaderCircle className="animate-spin" size={14} /> : <UserPlus size={14} />} Add 3 demo friends
                  </Button>
                  <Button
                    variant="outline" size="sm" disabled={demoBusy !== null || session?.status !== "open"}
                    onClick={() => session && demo("votes", "/api/dev/demo-votes", { session_id: session.id },
                      (d) => d.picked ? "Demo friends voted and everyone agreed on a show!" : "Demo friends voted. Say \"I'm in\" on a show they liked to lock it in.")}
                  >
                    {demoBusy === "votes" ? <LoaderCircle className="animate-spin" size={14} /> : <ThumbsUp size={14} />} Demo friends vote
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-[24px] border border-white bg-white/90 p-5 shadow-[0_12px_40px_rgba(48,63,48,.06)]">
              <h3 className="text-sm font-bold">Members · {detail.members.length}</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                {detail.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <Avatar name={m.name} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 truncate text-sm font-bold">
                        {m.name}{m.id === detail.host && <Crown size={13} className="shrink-0 text-[#9bc851]" aria-label="Host" />}
                        {m.id === detail.me && <span className="font-normal text-[#8a938d]">(you)</span>}
                      </p>
                      <p className="truncate text-xs capitalize text-[#66716b]">
                        {m.has_profile ? uniqueTags(m.top_tags).slice(0, 3).map((t) => t.name).join(" · ") : "No taste profile yet"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <form onSubmit={addMember} className="mt-5 flex gap-2">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Add by email" className="h-10" />
                <Button type="submit" variant="outline" size="sm" className="h-10 px-3"><UserPlus size={16} /> Add</Button>
              </form>
              <button onClick={leaveGroup} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8a938d] transition hover:text-red-700">
                <LogOut size={13} /> Leave group
              </button>
            </div>
          </aside>
        </>
      )}
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
