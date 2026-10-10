import { NextRequest } from "next/server";
import { proxyToEmbedService } from "../_lib/proxy";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return proxyToEmbedService(request, "/enrich-artist");
}
