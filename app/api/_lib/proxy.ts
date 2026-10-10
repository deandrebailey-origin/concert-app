import { NextRequest, NextResponse } from "next/server";

const EMBED_SERVICE_URL =
  process.env.EMBED_SERVICE_URL ?? "http://127.0.0.1:8000";

/** Forward a Next.js API request to the private FastAPI embedding service. */
export async function proxyToEmbedService(
  request: NextRequest,
  path: string,
) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  try {
    const response = await fetch(`${EMBED_SERVICE_URL}${path}`, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      cache: "no-store",
    });

    const responseBody = await response.arrayBuffer();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "Embedding service is unavailable" },
      { status: 502 },
    );
  }
}
