// Garde optimiste du back-office. La vérification d'autorité reste dans la
// DAL (lib/auth/dal.ts), appelée par chaque page et chaque Server Action.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decryptSession } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await decryptSession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (pathname === "/admin/login") {
    if (session) {
      return NextResponse.redirect(new URL("/admin", request.nextUrl));
    }
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", request.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
