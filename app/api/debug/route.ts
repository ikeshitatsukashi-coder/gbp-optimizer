import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ status: "no_session" })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = session as any
  return NextResponse.json({
    status: "ok",
    user: session.user?.email,
    hasAccessToken: !!s.accessToken,
    tokenPreview: s.accessToken ? s.accessToken.substring(0, 20) + "..." : null,
  })
}
