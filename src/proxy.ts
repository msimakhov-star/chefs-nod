import { NextResponse, type NextRequest } from "next/server";
import { isStaff, staffMisconfigured } from "@/lib/staff";

// Staff screens and every route that moves money or changes the menu sit behind one key.
const STAFF = [/^\/kitchen/, /^\/owner/, /^\/api\/owner/, /^\/api\/kitchen/, /^\/api\/demo/, /^\/api\/studio-ai/, /^\/api\/menu\/(dish|import|publish)/, /^\/api\/orders\/[^/]+\/(decision|refund)/];

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const staffOnly = STAFF.some((r) => r.test(pathname)) || (pathname === "/api/stream" && searchParams.has("restaurant"));
  if (!staffOnly) return NextResponse.next();
  if (isStaff(req.headers.get("x-staff-key"), req.cookies.get("staff")?.value)) return NextResponse.next(); // no key set: open, for a laptop or a judge running it locally
  if (staffMisconfigured()) return NextResponse.json({ error: "Set STAFF_KEY on this server." }, { status: 503 });
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Staff only" }, { status: 401 });
  return NextResponse.redirect(new URL(`/staff?next=${encodeURIComponent(pathname)}`, req.url));
}

export const config = { matcher: ["/kitchen/:path*", "/owner/:path*", "/api/:path*"] };
