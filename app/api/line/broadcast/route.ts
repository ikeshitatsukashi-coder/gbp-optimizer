import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { lineBroadcasts, socialConnections } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { decryptToken } from "@/lib/crypto"
import { broadcast, getFollowerInsight, LineApiError, type LineMessage } from "@/lib/line-client"

/**
 * LINE公式アカウントの友だち全員への配信。
 *
 * GET  ?locationId=  配信履歴
 * POST 配信実行
 *
 * ※実際に相手のLINEへ届くため、画面側で必ず確認ダイアログを出してから呼ぶこと。
 *   誰がいつ何を送ったかは line_broadcasts に必ず記録する。
 */

function buildLocationName(locationId: string): string {
  return locationId.startsWith("locations/") ? locationId : `locations/${locationId}`
}

export async function GET(request: Request) {
  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const locationId = new URL(request.url).searchParams.get("locationId")
  if (!locationId) {
    return NextResponse.json({ error: "locationId が必要です" }, { status: 400 })
  }

  try {
    const rows = await db
      .select()
      .from(lineBroadcasts)
      .where(eq(lineBroadcasts.locationName, buildLocationName(locationId)))
      .orderBy(desc(lineBroadcasts.sentAt))
      .limit(50)
    return NextResponse.json({ broadcasts: rows })
  } catch (e) {
    return errorResponse("Failed to list broadcasts", e)
  }
}

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  let body: {
    connectionId?: number
    message?: string
    imageUrl?: string
    /** 二重送信防止用（画面側で配信ごとに1つ生成する） */
    retryKey?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const message = body.message?.trim()
  if (!body.connectionId) {
    return NextResponse.json({ error: "connectionId が必要です" }, { status: 400 })
  }
  if (!message) {
    return NextResponse.json({ error: "配信する本文を入力してください" }, { status: 400 })
  }
  // LINEのテキストメッセージは5000文字まで
  if (message.length > 5000) {
    return NextResponse.json(
      { error: `本文が長すぎます（${message.length}文字 / 上限5000文字）` },
      { status: 400 }
    )
  }
  // 画像は https のみ（LINEの仕様）
  if (body.imageUrl && !body.imageUrl.startsWith("https://")) {
    return NextResponse.json(
      { error: "画像URLは https:// で始まる必要があります" },
      { status: 400 }
    )
  }

  try {
    const [conn] = await db
      .select()
      .from(socialConnections)
      .where(
        and(
          eq(socialConnections.id, body.connectionId),
          eq(socialConnections.provider, "line")
        )
      )
    if (!conn) {
      return NextResponse.json({ error: "LINE連携が見つかりません" }, { status: 404 })
    }

    const channelToken = decryptToken(conn.accessToken)
    if (!channelToken) {
      return NextResponse.json(
        { error: "チャネルアクセストークンが登録されていません" },
        { status: 400 }
      )
    }

    const messages: LineMessage[] = [{ type: "text", text: message }]
    if (body.imageUrl) {
      messages.push({
        type: "image",
        originalContentUrl: body.imageUrl,
        previewImageUrl: body.imageUrl,
      })
    }

    const email = await getSessionEmail()

    // 送信時点の友だち数を控えておく（あとで到達数の目安にする）
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
      d.getDate()
    ).padStart(2, "0")}`
    const insight = await getFollowerInsight(channelToken, yyyymmdd).catch(() => null)
    const followers =
      insight && insight.status === "ready" ? (insight.followers ?? null) : null

    try {
      await broadcast(channelToken, messages, { retryKey: body.retryKey })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await db.insert(lineBroadcasts).values({
        locationName: conn.locationName,
        connectionId: conn.id,
        message,
        imageUrl: body.imageUrl ?? null,
        status: "failed",
        errorMessage: msg,
        followers,
        sentBy: email,
      })
      if (e instanceof LineApiError) {
        return NextResponse.json({ error: msg }, { status: 400 })
      }
      throw e
    }

    const [saved] = await db
      .insert(lineBroadcasts)
      .values({
        locationName: conn.locationName,
        connectionId: conn.id,
        message,
        imageUrl: body.imageUrl ?? null,
        status: "sent",
        followers,
        sentBy: email,
      })
      .returning({ id: lineBroadcasts.id })

    await db
      .update(socialConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(socialConnections.id, conn.id))

    return NextResponse.json({ success: true, id: saved.id, followers })
  } catch (e) {
    return errorResponse("Failed to send LINE broadcast", e)
  }
}
