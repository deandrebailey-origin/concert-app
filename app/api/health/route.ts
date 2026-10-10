import { NextRequest } from "next/server";
import { proxyToEmbedService } from "../_lib/proxy";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return proxyToEmbedService(request, "/health");
}
