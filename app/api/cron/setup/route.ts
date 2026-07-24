import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { errorResponse } from "@/lib/api-helpers"
import {
  saveCronRefreshToken,
  getCronAuthStatus,
  deleteCronRefreshToken,
} from "@/lib/services/cron-auth"

/**
 * 予約投稿の自動実行セットアップ。
 * POST: 現在ログイン中ユーザーの Google リフレッシュトークンを保存（有効化）
 * GET:  設定状態
 * DELETE: 解除
 *
 * ※投稿権限を持つアカウント（meo-support@li-go.jp）でログインした状態で有効化すること。
 */

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  try {
    const status = await getCronAuthStatus()
    return NextResponse.json(status)
  } catch (e) {
    return errorResponse("Failed to get status", e)
  }
}

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const refreshToken = (token as { refreshToken?: string }).refreshToken
  if (!refreshToken) {
    return NextResponse.json(
      {
        error:
          "リフレッシュトークンが見つかりません。一度ログアウトして再ログインしてから、もう一度お試しください。",
      },
      { status: 400 }
    )
  }

  try {
    await saveCronRefreshToken(refreshToken, token.email ?? "unknown")
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to save token", e)
  }
}

export async function DELETE(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  try {
    await deleteCronRefreshToken()
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to delete token", e)
  }
}
