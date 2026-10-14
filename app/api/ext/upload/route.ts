import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { verifyApiKey } from "@/lib/services/api-key-auth"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { resolveStoreScope } from "@/lib/services/image-scope"

/**
 * POST /api/ext/upload  (APIキー認証・multipart/form-data: file, locationId)
 *
 * 外部ツール（SNS運用ツール等）から投稿用画像を Vercel Blob に置き、公開URLを返す。
 * Google の投稿 API は公開URLからしか画像を取得できないため、予約投稿の前段で使う。
 * 保存先は画面からのアップロードと同じ会社ごとのフォルダ（post-images/<会社コード or 店舗ID>/）。
 * 店舗を指定しないアップロードは受け付けない（他社の画像と混ざらないように）。
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`ext-upload:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 30,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const auth = await verifyApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN 未設定（Vercel Blob が未接続）" },
      { status: 500 }
    )
  }

  let file: File | null = null
  let loc: string | null = null
  try {
    const formData = await request.formData()
    const f = formData.get("file")
    if (f instanceof File) file = f
    const l = formData.get("locationId")
    loc = typeof l === "string" ? l.replace(/^locations\//, "") : null
  } catch {
    return NextResponse.json(
      { error: "multipart/form-data with 'file' and 'locationId' is required" },
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

  const scope = await resolveStoreScope(loc)
  if (!scope.folder) {
    return NextResponse.json({ error: "locationId（店舗）を指定してください" }, { status: 400 })
  }

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)
    const blob = await put(`post-images/${scope.folder}/${Date.now()}-${safeName}`, file, {
      access: "public",
      contentType: file.type,
    })
    return NextResponse.json({ url: blob.url, folder: scope.folder })
  } catch (e) {
    return errorResponse("Upload failed", e)
  }
}
