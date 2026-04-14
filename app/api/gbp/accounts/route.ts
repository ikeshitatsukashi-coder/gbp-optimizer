import { getAccessToken } from "@/lib/get-session"
import { createGbpClient } from "@/lib/gbp-client"
import { NextResponse } from "next/server"

export async function GET() {
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated", detail: "No access token found in session" }, { status: 401 })
  }

  try {
    const client = createGbpClient(accessToken)
    const accounts = await client.listAccounts()
    return NextResponse.json({ accounts })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Failed to list accounts:", message)
    return NextResponse.json(
      { error: "Failed to fetch accounts", detail: message },
      { status: 500 }
    )
  }
}
