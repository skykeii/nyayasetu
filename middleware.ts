import { NextResponse, type NextRequest } from "next/server";
import { ROLES, canCallApi, canOpenPage } from "@/lib/roles";
import { SESSION_COOKIE, VIEWER_HEADER, readSession } from "@/lib/session";

const PUBLIC_PAGES = ["/login", "/security"];
const PUBLIC_API = ["/api/auth/login", "/api/auth/student"];
const hasPrefix = (path: string, p: string) => path === p || path.startsWith(`${p}/`);
// only same-site paths, never "//host" or a full URL
const safeNext = (n: string | null) => (n && /^\/(?![/\\])/.test(n) ? n : null);

/** The server derives identity only from the signed cookie. Any client-sent identity header is dropped here. */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let sameOrigin = true;
    if (origin) {
      try {
        sameOrigin = new URL(origin).host === host;
      } catch {
        sameOrigin = false;
      }
    }
    if (!sameOrigin) return NextResponse.json({ error: "Request refused" }, { status: 403 });
  }

  const headers = new Headers(req.headers);
  headers.delete(VIEWER_HEADER);
  ["x-role", "x-region", "x-officer", "x-institution", "x-student-session"].forEach((h) => headers.delete(h));
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isApi ? PUBLIC_API.some((p) => hasPrefix(pathname, p)) : PUBLIC_PAGES.some((p) => hasPrefix(pathname, p))) return NextResponse.next({ request: { headers } });
    if (isApi) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    const login = new URL("/login", req.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }

  const def = ROLES[session.role];
  if (!def) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (isApi) {
    if (!canCallApi(session.role, pathname)) return NextResponse.json({ error: "Not permitted for your role" }, { status: 403 });
  } else if (pathname === "/login") {
    const next = safeNext(req.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(next && canOpenPage(session.role, next.split("?")[0]) ? next : def.landing, req.url));
  } else if (!PUBLIC_PAGES.some((p) => hasPrefix(pathname, p)) && !canOpenPage(session.role, pathname)) {
    return NextResponse.redirect(new URL(def.landing, req.url));
  }
  headers.set(VIEWER_HEADER, encodeURIComponent(JSON.stringify({ role: session.role, region: session.region, officerId: session.officerId, accountId: session.sub, institutionId: session.institutionId, studentId: session.studentId })));
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
