import { cookies } from "next/headers";

export const runtime = "nodejs";

/**
 * Belt-and-braces sign-out: expire every Neon Auth cookie on this domain,
 * including the cached session_data cookie that can keep a user "signed in"
 * after the auth server's own sign-out.
 */
export async function POST() {
  const jar = await cookies();
  for (const c of jar.getAll()) {
    if (c.name.startsWith("__Secure-neon-auth") || c.name.startsWith("neon-auth") || c.name.startsWith("neon_auth")) {
      jar.set(c.name, "", { path: "/", maxAge: 0, secure: true, httpOnly: true, sameSite: "lax" });
    }
  }
  return Response.json({ ok: true });
}
