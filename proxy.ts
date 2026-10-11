import { getAuth } from "@/lib/auth/server";

// Neon Auth uses the return request to exchange its OAuth verifier for the
// local session cookie. Keep the sign-in page in the matcher so this runs
// after Google/GitHub redirects back to "/".
export function proxy(request: import("next/server").NextRequest) {
  return getAuth().middleware({ loginUrl: "/" })(request);
}

export const config = {
  matcher: ["/"],
};
