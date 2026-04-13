import { getAccessToken } from "@/lib/get-session"
import { createGbpClient } from "@/lib/gbp-client"
import { NextResponse } from "next/server"

export async function GET() {
  
  
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const client = createGbpClient(accessToken)
    const accounts = await client.listAccounts()
    return NextResponse.json({ accounts })
  } catch (error) {
    console.error("Failed to list accounts:", error)
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    )
  }
}
