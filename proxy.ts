import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

export function proxy(request: NextRequest) {
  return getAuth().middleware({ loginUrl: "/sign-in" })(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sign-in|join|.*\\.(?:gif|png|jpg|jpeg|svg|webp)$).*)"],
};