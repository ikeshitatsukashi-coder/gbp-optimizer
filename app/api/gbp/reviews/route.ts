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
    const data = await client.listReviews(locationName)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch reviews:", error)
    return NextResponse.json(
      { error: "Failed to fetch reviews" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  
  
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const { reviewName, comment } = await request.json()

    if (!reviewName || !comment) {
      return NextResponse.json(
        { error: "reviewName and comment are required" },
        { status: 400 }
      )
    }

    const client = createGmbClient(accessToken)
    const result = await client.replyToReview(reviewName, comment)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to reply to review:", error)
    return NextResponse.json(
      { error: "Failed to reply to review" },
      { status: 500 }
    )
  }
}
