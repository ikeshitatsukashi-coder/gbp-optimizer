import { getAccessToken } from "@/lib/get-session"
import { createGmbClient } from "@/lib/gbp-client"
import { getAccountNameForLocation } from "@/lib/services/get-store-account"
import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/services/authz"

/**
 * v4 media create endpoint
 * POST /v4/{accountName}/{locationName}/media
 * Body example: { mediaFormat: "PHOTO", sourceUrl: "...", locationAssociation: { category: "EXTERIOR" } }
 */
async function createMedia(
  accessToken: string,
  accountName: string,
  locationName: string,
  body: Record<string, unknown>
) {
  const account = accountName.startsWith("accounts/") ? accountName : `accounts/${accountName}`
  const location = locationName.startsWith("locations/")
    ? locationName
    : `locations/${locationName}`
  const url = `https://mybusiness.googleapis.com/v4/${account}/${location}/media`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Media API error: ${res.status} ${text}`)
  }
  return res.json()
}

export async function POST(request: NextRequest) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: {
    locationName?: string
    mediaFormat?: string
    sourceUrl?: string
    locationAssociation?: { category?: string }
    description?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { locationName, mediaFormat, sourceUrl, locationAssociation, description } = body
  if (!locationName || !sourceUrl) {
    return NextResponse.json(
      { error: "locationName and sourceUrl are required" },
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

  try {
    const result = await createMedia(accessToken, accountName, locationName, {
      mediaFormat: mediaFormat ?? "PHOTO",
      sourceUrl,
      locationAssociation: locationAssociation ?? { category: "ADDITIONAL" },
      ...(description ? { description } : {}),
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to create media:", error)
    return NextResponse.json(
      {
        error: "Failed to create media",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

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
