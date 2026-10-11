"use client";

import { use, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { PENDING_INVITE_KEY } from "@/frontend/lib/invite";

/** Invite link: /join/K7P2QX. Joins the group, or remembers the code until after sign-in. */
export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          try { localStorage.setItem(PENDING_INVITE_KEY, code); } catch {}
          window.location.assign("/sign-in");
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        window.location.assign(`/groups?g=${data.group.id}`);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't join."));
  }, [code]);

  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      {error ? (
        <div>
          <p className="text-lg font-bold">Couldn&apos;t join</p>
          <p className="mt-1 text-sm text-[#6b6676]">{error}</p>
          <a href="/groups" className="mt-4 inline-block text-sm font-semibold underline decoration-[#a98bff] decoration-2 underline-offset-4">Go to your groups</a>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[#6b6676]"><LoaderCircle className="animate-spin" size={18} /> Joining group…</p>
      )}
    </main>
  );
}
