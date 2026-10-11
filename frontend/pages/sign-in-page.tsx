"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Check, Headphones, LoaderCircle, Sparkles } from "lucide-react";
import { LogoMark } from "@/frontend/components/logo-mark";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";

type AuthTab = "signup" | "login";

export default function SignInPage() {
  const [tab, setTab] = useState<AuthTab>("signup");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  // already signed in? skip the form and go straight to the app
  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) window.location.replace("/");
    }).catch(() => {});
  }, []);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      if (tab === "signup") {
        const name = String(form.get("name") ?? "").trim();
        const { error } = await authClient.signUp.email({ name, email, password, callbackURL: "/" });
        if (error) throw new Error(error.message || "We couldn't create your account.");
        setNotice({ kind: "success", text: "Your account is ready. Taking you in…" });
        window.location.assign("/");
      } else {
        const { error } = await authClient.signIn.email({ email, password, callbackURL: "/" });
        if (error) throw new Error(error.message || "We couldn't sign you in.");
        window.location.assign("/");
      }
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function signInSocial(provider: "google" | "github") {
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await authClient.signIn.social({ provider, callbackURL: "/" });
      if (error) throw new Error(error.message || `We couldn't continue with ${provider}.`);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Something went wrong. Please try again." });
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-6 sm:px-8 sm:py-8">

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <a href="/" aria-label="Certifi home" className="flex items-center gap-2.5">
            <LogoMark className="size-9 text-[#7c5cdb]" />
            <span className="font-[family-name:var(--font-brand)] text-[28px] leading-none tracking-[-0.02em] text-[#17141f]">Certifi</span>
          </a>
          
        </header>

        <section className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1fr_420px] lg:gap-14 lg:py-16">
          <div className="mx-auto w-full max-w-2xl lg:mx-0">
            <h1 className="max-w-lg text-5xl font-bold leading-[1.04] tracking-[-0.065em] sm:text-6xl">Find your people.<br /><span className="relative inline-block">Find your show.<span aria-hidden="true" className="absolute -bottom-1 left-0 -z-10 h-3 w-full -rotate-1 rounded-full bg-[#a98bff]/75" /></span></h1>
            <p className="mt-6 max-w-md text-base leading-7 text-[#6b6676] sm:text-lg">The easiest way to turn “we should go to a concert” into the best night of your week.</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF, no optimization needed */}
            <img src="/concert.gif" alt="Crowd with hands up under purple stage lights" className="mt-8 aspect-[480/268] w-full rounded-lg object-cover shadow-[0_18px_50px_rgba(45,35,75,.18)]" />

            
          </div>

          <div className="mx-auto w-full max-w-[440px]">
            <div className="rounded-lg border border-white bg-white/90 p-6 shadow-[0_24px_80px_rgba(45,35,75,.10)] backdrop-blur sm:p-9">
              <div className="mb-7">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#7c5cdb]">Welcome to Certifi</p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-.04em]">Your next show is out there.</h2>
                <p className="mt-2 text-sm text-[#6b6676]">Sign in or create an account to find your crowd.</p>
              </div>

              <Tabs value={tab} onValueChange={(value) => { setTab(value as AuthTab); setNotice(null); }}>
                <TabsList aria-label="Choose sign-in or sign-up">
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                  <TabsTrigger value="login">Log in</TabsTrigger>
                </TabsList>

                <TabsContent value="signup">
                  <form className="space-y-4" onSubmit={submitEmail}>
                    <label className="block space-y-2 text-sm font-semibold" htmlFor="signup-name">Your name
                      <Input id="signup-name" name="name" autoComplete="name" placeholder="What should we call you?" required />
                    </label>
                    <label className="block space-y-2 text-sm font-semibold" htmlFor="signup-email">Email address
                      <Input id="signup-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
                    </label>
                    <label className="block space-y-2 text-sm font-semibold" htmlFor="signup-password">Password
                      <Input id="signup-password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required />
                    </label>
                    <Button type="submit" className="mt-1 w-full" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <>Create your account <ArrowRight size={17} /></>}</Button>
                  </form>
                </TabsContent>

                <TabsContent value="login">
                  <form className="space-y-4" onSubmit={submitEmail}>
                    <label className="block space-y-2 text-sm font-semibold" htmlFor="login-email">Email address
                      <Input id="login-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
                    </label>
                    <label className="block space-y-2 text-sm font-semibold" htmlFor="login-password">Password
                      <Input id="login-password" name="password" type="password" autoComplete="current-password" placeholder="Your password" required />
                    </label>
                    <Button type="submit" className="mt-1 w-full" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <>Welcome back <ArrowRight size={17} /></>}</Button>
                  </form>
                </TabsContent>
              </Tabs>

              {notice && <p role="status" className={`mt-4 rounded-md px-3.5 py-3 text-sm ${notice.kind === "error" ? "bg-red-50 text-red-700" : "bg-[#f1ecff] text-[#4b2fa8]"}`}>{notice.text}</p>}

              <div className="my-6 flex items-center gap-3 text-xs font-medium text-[#8d8898]"><span className="h-px flex-1 bg-[#eae7ef]" /> or continue with <span className="h-px flex-1 bg-[#eae7ef]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => signInSocial("google")}><GoogleMark /> Google</Button>
                <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => signInSocial("github")}><GitHubMark /> GitHub</Button>
              </div>

            </div>
            
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-[#e9e6ee] py-4 text-[11px] text-[#8d8898]"><span>© 2026 Certifi</span><span>Good music. Good people. Great nights.</span></footer>
      </div>
    </main>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="size-[17px]"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 5) scale(.9)"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.91c-.58 2.96-2.26 5.47-4.76 7.16l7.73 6C44.39 38.01 47 31.93 47 24.55h-.02Z" transform="translate(0 2) scale(.94)"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" transform="translate(0 5) scale(.9)"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.82l-7.74-6c-2.15 1.45-4.9 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(0 2) scale(.94)"/></svg>;
}

function GitHubMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[17px] fill-current"><path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.1c-3.1.68-3.75-1.32-3.75-1.32-.5-1.29-1.24-1.63-1.24-1.63-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.71-1.49-2.47-.28-5.07-1.24-5.07-5.51 0-1.22.44-2.21 1.15-2.99-.12-.28-.5-1.42.11-2.95 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.12-1.44 3.05-1.14 3.05-1.14.61 1.53.23 2.67.12 2.95.71.78 1.14 1.77 1.14 2.99 0 4.28-2.61 5.23-5.09 5.5.4.35.76 1.03.76 2.08v3.07c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" /></svg>;
}
