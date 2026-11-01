import { NextResponse, type NextRequest } from "next/server";
import { ROLE_KEYS } from "@/lib/roles";
import type { RoleKey } from "@/lib/types";

/** Every officer API needs a valid role; student routes authenticate with their own session. */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith("/api/student/")) return NextResponse.next();
  const role = req.headers.get("x-role") ?? searchParams.get("_role");
  if (!role || !ROLE_KEYS.includes(role as RoleKey)) {
    return NextResponse.json({ error: "Sign-in required: no valid role on this request" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
