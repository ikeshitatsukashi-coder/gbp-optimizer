import { getAccessToken } from "@/lib/get-session"
import { createGmbClient } from "@/lib/gbp-client"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  
  
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const locationName = request.nextUrl.searchParams.get("locationName")
  const startDate = request.nextUrl.searchParams.get("startDate")
  const endDate = request.nextUrl.searchParams.get("endDate")

  if (!locationName || !startDate || !endDate) {
    return NextResponse.json(
      { error: "locationName, startDate, and endDate are required" },
      { status: 400 }
    )
  }

  try {
    const client = createGmbClient(accessToken)
    const data = await client.getInsights(locationName, startDate, endDate)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch insights:", error)
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    )
  }
}
