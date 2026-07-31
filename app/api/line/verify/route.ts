import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { socialConnections } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { decryptToken } from "@/lib/crypto"
import {
  getBotInfo,
  getQuota,
  getQuotaConsumption,
  getFollowerInsight,
  LineApiError,
} from "@/lib/line-client"

/**
 * POST /api/line/verify
 *
 * 保存済みのチャネルアクセストークンでLINEに接続できるか確認し、
 * 公式アカウント名・友だち数・当月の送信状況を取得して連携の状態を更新する。
 *
 * body: { connectionId: number }
 */
export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  let body: { connectionId?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!body.connectionId) {
    return NextResponse.json({ error: "connectionId が必要です" }, { status: 400 })
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

    const info = await getBotInfo(channelToken)

    // 送信上限・送信済み件数は取得できなくても致命的ではないので個別に握る
    const [quota, consumption] = await Promise.all([
      getQuota(channelToken).catch(() => null),
      getQuotaConsumption(channelToken).catch(() => null),
    ])

    // 友だち数は前日分を参照する（当日分はまだ集計されていない）
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
      d.getDate()
    ).padStart(2, "0")}`
    const insight = await getFollowerInsight(channelToken, yyyymmdd).catch(() => null)

    await db
      .update(socialConnections)
      .set({
        status: "connected",
        accountName: info.displayName,
        externalId: conn.externalId ?? info.basicId,
        errorMessage: null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(socialConnections.id, conn.id))

    return NextResponse.json({
      success: true,
      bot: {
        displayName: info.displayName,
        basicId: info.basicId,
        pictureUrl: info.pictureUrl ?? null,
        chatMode: info.chatMode ?? null,
      },
      quota: quota
        ? {
            type: quota.type,
            limit: quota.value ?? null,
            used: consumption?.totalUsage ?? null,
          }
        : null,
      followers:
        insight && insight.status === "ready" ? (insight.followers ?? null) : null,
      /** 友だちが20人未満だと LINE 側が集計を返さないため、その旨を伝える */
      followersNote:
        insight && insight.status !== "ready"
          ? "友だち数はLINE側の集計待ちです（友だち20人未満の期間は取得できません）"
          : null,
    })
  } catch (e) {
    if (e instanceof LineApiError) {
      // 失敗の理由を連携レコードにも残す
      await db
        .update(socialConnections)
        .set({ status: "error", errorMessage: e.message, updatedAt: new Date() })
        .where(eq(socialConnections.id, body.connectionId))
        .catch(() => {})
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    return errorResponse("Failed to verify LINE connection", e)
  }
}
