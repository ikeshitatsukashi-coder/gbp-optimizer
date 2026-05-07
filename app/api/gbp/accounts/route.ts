import { getAccessToken } from "@/lib/get-session"
import { createGbpClient } from "@/lib/gbp-client"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  // Rate limit
  const rl = checkRateLimit(`accounts:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 30,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    )
  }

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const client = createGbpClient(accessToken)
    const accounts = await client.listAccounts()
    return NextResponse.json({ accounts })
  } catch (error) {
    return errorResponse("Failed to fetch accounts", error)
  }
}
