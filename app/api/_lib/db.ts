import { neon } from "@neondatabase/serverless";

/** Tagged-template SQL client for Neon: await sql`SELECT ... WHERE id = ${id}` */
export const sql = neon(process.env.DATABASE_URL!);

/** pgvector accepts vectors written as "[0.1,0.2,...]" text, cast with ::vector */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
