import { NextResponse } from "next/server"
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"
import { verifyApiKey } from "@/lib/services/api-key-auth"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { resolveStoreScope } from "@/lib/services/image-scope"
import { VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/lib/services/video-upload"

/**
 * POST /api/ext/upload-token  (APIキー認証・JSON: { locationId, filename, contentType, size })
 *
 * 外部ツールが動画を Vercel Blob に「直接」置くための、10分だけ有効な書き込み許可を発行する。
 * Vercel Function は 4.5MB までしか受け取れないため、動画は /api/ext/upload を通さず
 * 返した uploadUrl に PUT してもらう（このサーバーは中身を受け取らない）。
 * 保存先は店舗（会社）ごとのフォルダ post-videos/<会社コード or 店舗ID>/ に固定し、
 * 許可はそのパス1つ・動画の種類・サイズ上限に絞る。
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`ext-upload-token:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 20,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const auth = await verifyApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const rw = process.env.BLOB_READ_WRITE_TOKEN
  if (!rw) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN 未設定（Vercel Blob が未接続）" },
      { status: 500 }
    )
  }

  let body: { locationId?: string; filename?: string; contentType?: string; size?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const contentType = body.contentType ?? ""
  if (!VIDEO_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "動画（mp4 / mov）のみ受け付けます" }, { status: 400 })
  }
  const size = Number(body.size)
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "size（バイト数）を指定してください" }, { status: 400 })
  }
  if (size > VIDEO_MAX_BYTES) {
    return NextResponse.json({ error: "動画が大きすぎます（75MB以下）" }, { status: 413 })
  }

  const scope = await resolveStoreScope(body.locationId?.replace(/^locations\//, "") ?? null)
  if (!scope.folder) {
    return NextResponse.json({ error: "locationId（店舗）を指定してください" }, { status: 400 })
  }

  try {
    const safeName = (body.filename ?? "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)
    const pathname = `post-videos/${scope.folder}/${Date.now()}-${safeName}`
    const token = await generateClientTokenFromReadWriteToken({
      token: rw,
      pathname,
      allowedContentTypes: VIDEO_TYPES,
      maximumSizeInBytes: VIDEO_MAX_BYTES,
      validUntil: Date.now() + 10 * 60 * 1000,
      addRandomSuffix: false,
    })
    return NextResponse.json({
      pathname,
      token,
      // 受け取った側はこの URL に PUT する（ヘッダーは headers をそのまま付ける）
      uploadUrl: `https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`,
      headers: {
        authorization: `Bearer ${token}`,
        "x-api-version": "12",
        "x-vercel-blob-access": "public",
        "x-content-type": contentType,
        "x-add-random-suffix": "0",
      },
      folder: scope.folder,
    })
  } catch (e) {
    return errorResponse("Failed to issue upload token", e)
  }
}
