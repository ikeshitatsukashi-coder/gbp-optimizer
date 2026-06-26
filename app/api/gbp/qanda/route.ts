import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"

/**
 * Google Q&A API
 *  GET    https://mybusinessqanda.googleapis.com/v1/locations/{id}/questions
 *  POST   https://mybusinessqanda.googleapis.com/v1/locations/{id}/questions      (ユーザー側からの質問は不可、店舗用にあれば)
 *  PUT    https://mybusinessqanda.googleapis.com/v1/{questionName}/answers:upsert  (店舗オーナーの回答を更新)
 *  DELETE .../answers:delete
 *
 * 注: 単に v4 ではない別 API。プロジェクトに対し有効化が必要（v4 と同じ allowlist 内で動くケース多し）。
 */
const BASE = "https://mybusinessqanda.googleapis.com/v1"

async function callApi(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
}

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const locationName = url.searchParams.get("locationName")
  if (!locationName) {
    return NextResponse.json({ error: "locationName is required" }, { status: 400 })
  }
  const fullLocation = locationName.startsWith("locations/")
    ? locationName
    : `locations/${locationName}`

  try {
    const res = await callApi(accessToken, `/${fullLocation}/questions?pageSize=50&answersPerQuestion=10`)
    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "Failed to fetch Q&A",
          detail: `HTTP ${res.status}: ${text.slice(0, 400)}`,
        },
        { status: res.status === 403 ? 403 : 500 }
      )
    }
    const data = text ? JSON.parse(text) : {}
    return NextResponse.json(data)
  } catch (e) {
    return errorResponse("Failed to fetch Q&A", e)
  }
}

/**
 * POST: 質問に対するオーナー回答を追加/更新
 * Body: { questionName: "...", text: "..." }
 */
export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: { questionName?: string; text?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!body.questionName || !body.text) {
    return NextResponse.json({ error: "questionName and text are required" }, { status: 400 })
  }

  try {
    const res = await callApi(accessToken, `/${body.questionName}/answers:upsert`, {
      method: "POST",
      body: JSON.stringify({ answer: { text: body.text } }),
    })
    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "Failed to upsert answer",
          detail: `HTTP ${res.status}: ${text.slice(0, 400)}`,
        },
        { status: 500 }
      )
    }
    return NextResponse.json(text ? JSON.parse(text) : {})
  } catch (e) {
    return errorResponse("Failed to upsert answer", e)
  }
}
