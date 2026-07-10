import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * POST /api/upload  (multipart/form-data: file)
 *
 * 投稿用画像を Vercel Blob にアップロードして公開 URL を返す。
 * リサイズはクライアント側（lib/image-resize.ts）で実施済みの前提。
 * Google の投稿 API は公開 URL からしか画像を取得できないため、この保管層が必要。
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`upload:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 60,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    )
  }

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN 未設定（Vercel Blob が未接続）" },
      { status: 500 }
    )
  }

  let file: File | null = null
  try {
    const formData = await request.formData()
    const f = formData.get("file")
    if (f instanceof File) file = f
  } catch {
    return NextResponse.json(
      { error: "multipart/form-data with 'file' is required" },
      { status: 400 }
    )
  }

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 })
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "画像ファイルのみアップロード可能です" }, { status: 400 })
  }
  // Vercel Function のリクエスト上限 4.5MB を考慮
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json(
      { error: "ファイルが大きすぎます（4MB以下）。リサイズ後に再試行してください。" },
      { status: 413 }
    )
  }

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)
    const blob = await put(`post-images/${Date.now()}-${safeName}`, file, {
      access: "public",
      contentType: file.type,
    })
    return NextResponse.json({ url: blob.url })
  } catch (e) {
    return errorResponse("Upload failed", e)
  }
}
