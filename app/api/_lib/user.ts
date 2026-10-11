import "server-only";
import { getAuth } from "@/lib/auth/server";
import { sql } from "./db";

export type AppUser = { id: number; name: string; email: string | null; avatar_data: string | null };

/**
 * The signed-in user as a row in our `users` table.
 * Neon Auth owns login; the first time someone signs in we create their row,
 * linked by users.auth_id = Neon Auth user id.
 */
export async function currentUser(): Promise<AppUser | null> {
  const { data } = await getAuth().getSession();
  const authUser = data?.user;
  if (!authUser) return null;

  const rows = await sql`
    INSERT INTO users (auth_id, name, email)
    VALUES (${authUser.id}, ${authUser.name || authUser.email}, ${authUser.email})
    ON CONFLICT (auth_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
    RETURNING id, name, email, avatar_data`;
  return rows[0] as AppUser;
}

export const unauthorized = () =>
  Response.json({ detail: "Sign in first." }, { status: 401 });
