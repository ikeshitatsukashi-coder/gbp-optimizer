import { getAccessToken } from "@/lib/get-session"
import { createGbpClient } from "@/lib/gbp-client"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  
  
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const accountId = request.nextUrl.searchParams.get("accountId")
  const locationName = request.nextUrl.searchParams.get("locationName")

  try {
    const client = createGbpClient(accessToken)

    if (locationName) {
      const location = await client.getLocation(locationName)
      return NextResponse.json({ location })
    }

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      )
    }

    const locations = await client.listLocations(accountId)
    return NextResponse.json({ locations })
  } catch (error) {
    console.error("Failed to fetch locations:", error)
    return NextResponse.json(
      { error: "Failed to fetch locations" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  
  
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { locationName, updateMask, data } = body

    if (!locationName || !updateMask) {
      return NextResponse.json(
        { error: "locationName and updateMask are required" },
        { status: 400 }
      )
    }

    const client = createGbpClient(accessToken)
    const result = await client.updateLocation(locationName, updateMask, data)
    return NextResponse.json({ location: result })
  } catch (error) {
    console.error("Failed to update location:", error)
    return NextResponse.json(
      { error: "Failed to update location" },
      { status: 500 }
    )
  }
}
