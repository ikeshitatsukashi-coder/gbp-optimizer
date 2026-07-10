import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

/**
 * Authentication wall: redirect unauthenticated users to login.
 * Public paths: auth pages, API auth routes, static assets.
 */
const PUBLIC_PATHS = [
  "/auth/error",
  "/auth/signin",
  "/api/auth",
  // 外部連携 API は APIキー認証（Bearer gbp_live_...）を各ルート内で行う
  "/api/ext",
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip auth check for public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Skip for static files (handled by matcher, but extra safety)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // API routes: return 401 JSON
  if (pathname.startsWith("/api/")) {
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Page routes: redirect to login if not authenticated
  if (!token) {
    const loginUrl = new URL("/api/auth/signin", request.url)
    loginUrl.searchParams.set("callbackUrl", request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt
     * - file extensions (svg, png, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\..*).*)",
  ],
}
