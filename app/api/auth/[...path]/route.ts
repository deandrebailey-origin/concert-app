import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ path: string[] }> };
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

async function handle(method: Method, request: Request, context: Context) {
  try {
    return await getAuth().handler()[method](request, context);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Neon Auth is not configured." },
      { status: 503 },
    );
  }
}

export const GET = (request: Request, context: Context) => handle("GET", request, context);
export const POST = (request: Request, context: Context) => handle("POST", request, context);
export const PUT = (request: Request, context: Context) => handle("PUT", request, context);
export const DELETE = (request: Request, context: Context) => handle("DELETE", request, context);
export const PATCH = (request: Request, context: Context) => handle("PATCH", request, context);
