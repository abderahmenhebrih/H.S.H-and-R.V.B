import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// FRONTEND_MODE=full  -> normal H.S.H + R.V.B
// FRONTEND_MODE=rvb-public -> only /rvb allowed
export default function proxy(request: NextRequest) {
  const rawMode = process.env.FRONTEND_MODE || process.env.NEXT_PUBLIC_FRONTEND_MODE || "full";
  const mode = String(rawMode).toLowerCase();
  if (mode !== "rvb-public") {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  // Allow Next internals and static assets
  if (pathname.startsWith("/_next")) return NextResponse.next();
  // Allow API routes if any (frontend api)
  if (pathname.startsWith("/api")) return NextResponse.next();
  // Allow files with extension (public assets like /chicken.jpg, /favicon.ico, .png etc.)
  if (pathname.includes(".") && pathname.lastIndexOf(".") > pathname.lastIndexOf("/")) {
    return NextResponse.next();
  }

  // Root -> redirect to /rvb
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/rvb";
    return NextResponse.redirect(url);
  }

  // Allow R.V.B routes
  if (pathname === "/rvb" || pathname.startsWith("/rvb/")) {
    return NextResponse.next();
  }

  // All other routes are H.S.H surface -> redirect to /rvb (safe not-found behavior)
  const url = request.nextUrl.clone();
  url.pathname = "/rvb";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
