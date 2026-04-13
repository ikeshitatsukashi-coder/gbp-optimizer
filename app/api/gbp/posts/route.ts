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
    const data = await client.listPosts(locationName)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch posts:", error)
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  
  
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const { locationName, post } = await request.json()

    if (!locationName || !post) {
      return NextResponse.json(
        { error: "locationName and post are required" },
        { status: 400 }
      )
    }

    const client = createGmbClient(accessToken)
    const result = await client.createPost(locationName, post)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to create post:", error)
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    )
  }
}
