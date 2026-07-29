import { getAccessToken } from "@/lib/get-session"
import { createGmbClient } from "@/lib/gbp-client"
import { getAccountNameForLocation } from "@/lib/services/get-store-account"
import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/services/authz"

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
    const data = await client.listPosts(accountName, locationName)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch posts:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch posts",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireRole("editor")
  if (denied) return denied

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

    const accountName = await getAccountNameForLocation(locationName)
    if (!accountName) {
      return NextResponse.json(
        { error: "Store not found in local DB. Sync stores first." },
        { status: 404 }
      )
    }

    // Google の仕様上、1投稿に添付できる写真は1枚まで（複数送ると INVALID_ARGUMENT）
    if (Array.isArray(post.media) && post.media.length > 1) {
      post.media = [post.media[0]]
    }

    const client = createGmbClient(accessToken)
    const result = await client.createPost(accountName, locationName, post)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to create post:", error)
    return NextResponse.json(
      {
        error: "Failed to create post",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
