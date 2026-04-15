import { getAccessToken } from "@/lib/get-session"
import { NextRequest, NextResponse } from "next/server"

/**
 * Flag a review for removal via Google My Business API
 * This submits a "report" request to Google for policy violation review
 */
export async function POST(request: NextRequest) {
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const { reviewName } = await request.json()

    if (!reviewName) {
      return NextResponse.json(
        { error: "reviewName is required" },
        { status: 400 }
      )
    }

    // Google My Business API v4 - flag review for removal
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${reviewName}:flag`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Flag API error: ${res.status} ${error}`)
    }

    return NextResponse.json({ success: true, message: "削除申請が送信されました" })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Failed to flag review:", msg)
    return NextResponse.json(
      { error: "Failed to flag review", detail: msg },
      { status: 500 }
    )
  }
}
