import { getAccessToken } from "@/lib/get-session"
import { createGmbClient } from "@/lib/gbp-client"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  
  
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const locationName = request.nextUrl.searchParams.get("locationName")
  if (!locationName) {
    return NextResponse.json(
      { error: "locationName is required" },
      { status: 400 }
    )
  }

  try {
    const client = createGmbClient(accessToken)
    const data = await client.listMedia(locationName)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch media:", error)
    return NextResponse.json(
      { error: "Failed to fetch media" },
      { status: 500 }
    )
  }
}
