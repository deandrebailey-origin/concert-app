"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Home, LogOut, User, Users } from "lucide-react";
import { LogoMark } from "@/frontend/components/logo-mark";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/frontend/lib/utils";
import { PENDING_INVITE_KEY } from "@/frontend/lib/invite";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/profile", label: "Profile", icon: User },
];

/** Sidebar layout shared by every signed-in page. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // someone opened an invite link before signing in: finish joining now
  useEffect(() => {
    let code: string | null = null;
    try { code = localStorage.getItem(PENDING_INVITE_KEY); } catch {}
    if (!code) return;
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch {}
    fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((data) => { if (data.group) window.location.assign(`/groups?g=${data.group.id}`); })
      .catch(() => {});
  }, []);

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/sign-in");
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 z-10 flex items-center gap-2 border-b border-[#e0dbe8] bg-[#eeebf3]/95 px-4 py-3 backdrop-blur md:h-screen md:w-60 md:shrink-0 md:flex-col md:items-stretch md:gap-1 md:border-b-0 md:border-r md:px-4 md:py-6">
        <Link href="/" className="mr-auto flex items-center gap-2.5 md:mb-8 md:mr-0 md:px-2">
          <LogoMark className="size-8 text-[#7c5cdb]" />
          <span className="font-[family-name:var(--font-brand)] text-[26px] leading-none tracking-[-0.02em] text-[#17141f]">Certifi</span>
        </Link>
        <p className="hidden px-3 pb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#8d8898] md:block">Discover</p>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition",
                active ? "bg-white text-[#17141f] shadow-sm" : "text-[#6b6676] hover:bg-white/70 hover:text-[#17141f]",
              )}
            >
              <Icon size={17} /> <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold text-[#6b6676] transition hover:bg-white/70 hover:text-[#17141f] md:mt-auto"
        >
          <LogOut size={17} /> <span className="hidden sm:inline">Sign out</span>
        </button>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-10">{children}</main>
    </div>
  );
}
