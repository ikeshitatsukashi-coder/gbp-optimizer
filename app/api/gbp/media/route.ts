import { getAccessToken } from "@/lib/get-session"
import { createGmbClient } from "@/lib/gbp-client"
import { getAccountNameForLocation } from "@/lib/services/get-store-account"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const locationName = request.nextUrl.searchParams.get("locationName")
  if (!locationName) {
    return NextResponse.json({ error: "locationName is required" }, { status: 400 })
  }

  const accountName = await getAccountNameForLocation(locationName)
  if (!accountName) {
    return NextResponse.json(
      { error: "Store not found in local DB. Sync stores first." },
      { status: 404 }
    )
  }

  try {
    const client = createGmbClient(accessToken)
    const data = await client.listMedia(accountName, locationName)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch media:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch media",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
