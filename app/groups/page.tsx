"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { LoaderCircle, Plus, Search, Sparkles, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/frontend/components/app-shell";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Avatar, EventCard, Notice, type EventItem } from "@/frontend/components/music-bits";
import { cn } from "@/frontend/lib/utils";

type GroupSummary = { id: number; name: string; members: { id: number; name: string }[] };
type Member = { id: number; name: string; email: string | null; has_profile: boolean; top_tags: { name: string }[] };

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

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState("");
  const [loadingShows, setLoadingShows] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const loadGroups = useCallback(async () => {
    const { groups } = await api<{ groups: GroupSummary[] }>("/api/groups");
    setGroups(groups);
    setSelected((s) => s ?? groups[0]?.id ?? null);
  }, []);

  const loadMembers = useCallback(async (id: number) => {
    const { members } = await api<{ members: Member[] }>(`/api/groups/${id}`);
    setMembers(members);
  }, []);

  useEffect(() => { loadGroups().catch((e) => setNotice({ kind: "error", text: e.message })); }, [loadGroups]);
  useEffect(() => {
    if (selected === null) return;
    setEvents(null);
    setMissing([]);
    setNotice(null);
    loadMembers(selected).catch((e) => setNotice({ kind: "error", text: e.message }));
  }, [selected, loadMembers]);

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const { group } = await api<{ group: { id: number } }>("/api/groups", postJson({ name: newName }));
      setNewName("");
      await loadGroups();
      setSelected(group.id);
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
  }

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (selected === null || !email.trim()) return;
    try {
      const { added } = await api<{ added: { name: string } }>(`/api/groups/${selected}/members`, postJson({ email }));
      setEmail("");
      setNotice({ kind: "success", text: `${added.name} joined the group.` });
      await Promise.all([loadMembers(selected), loadGroups()]);
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
  }

  async function findShows() {
    if (selected === null) return;
    setLoadingShows(true);
    setNotice(null);
    try {
      const data = await api<{ events: EventItem[]; missing: string[] }>(`/api/groups/${selected}/recommend`);
      setEvents(data.events);
      setMissing(data.missing);
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setLoadingShows(false);
    }
  }

  const group = groups.find((g) => g.id === selected);
  const best = Math.max(...(events ?? []).map((e) => e.group_score), 0.0001);

  return (
    <AppShell>
      <div className="grid max-w-6xl gap-6 lg:grid-cols-[280px_1fr]">
        {/* group list, like the chat list in the mockup */}
        <aside className="rounded-[24px] border border-white bg-white/90 p-4 shadow-[0_12px_40px_rgba(48,63,48,.06)] lg:self-start">
          <h1 className="px-1 text-lg font-bold">Groups</h1>
          <form onSubmit={createGroup} className="mt-3 flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group name" className="h-10" />
            <Button type="submit" size="sm" className="h-10 px-3" aria-label="Create group"><Plus size={16} /></Button>
          </form>
          <ul className="mt-4 space-y-1">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  onClick={() => setSelected(g.id)}
                  className={cn("flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition", g.id === selected ? "bg-[#f0f3ee]" : "hover:bg-[#f7f8f5]")}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#17211c] text-[#c9f36b]"><Users size={17} /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{g.name}</span>
                    <span className="block truncate text-xs text-[#66716b]">{g.members.map((m) => m.name.split(" ")[0]).join(", ")}</span>
                  </span>
                </button>
              </li>
            ))}
            {groups.length === 0 && <li className="px-1 py-6 text-center text-sm text-[#8a938d]">No groups yet. Create one above.</li>}
          </ul>
        </aside>

        <section className="min-w-0">
          {!group ? (
            <div className="grid min-h-80 place-items-center rounded-[24px] border border-dashed border-[#dfe7d8] text-center text-[#66716b]">
              <div><Users className="mx-auto mb-3 text-[#819a56]" /> Create a group to find a show everyone will enjoy.</div>
            </div>
          ) : (
            <>
              <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-[#819a56]">Group</p>
                  <h2 className="mt-1 text-3xl font-bold tracking-[-0.05em]">{group.name}</h2>
                </div>
                <Button onClick={findShows} disabled={loadingShows}>
                  {loadingShows ? <LoaderCircle className="animate-spin" size={17} /> : <Search size={17} />} Find shows for everyone
                </Button>
              </header>

              <div className="mt-6 rounded-[24px] border border-white bg-white/90 p-5 shadow-[0_12px_40px_rgba(48,63,48,.06)]">
                <h3 className="text-sm font-bold">Members</h3>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3">
                      <Avatar name={m.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{m.name}</p>
                        <p className="truncate text-xs capitalize text-[#66716b]">
                          {m.has_profile ? m.top_tags.slice(0, 3).map((t) => t.name).join(" · ") : "No taste profile yet"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <form onSubmit={addMember} className="mt-5 flex gap-2">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Add a friend by email" className="h-10" />
                  <Button type="submit" variant="outline" size="sm" className="h-10 px-3"><UserPlus size={16} /> Add</Button>
                </form>
              </div>

              <div className="mt-4 space-y-3">
                {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
                {missing.length > 0 && <Notice>Not counted yet (no taste profile): {missing.join(", ")}.</Notice>}
              </div>

              {events && (
                <div className="mt-6">
                  <h3 className="flex items-center gap-2 text-xl font-bold tracking-[-0.03em]"><Sparkles size={18} className="text-[#7d9f35]" /> Picks for the group</h3>
                  <p className="text-sm text-[#66716b]">Ranked so nobody gets stuck at a show they'd hate. The bars show how much each person should like it.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {events.map((e, i) => <EventCard key={e.id} event={e} best={best} rank={i + 1} showMembers />)}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
