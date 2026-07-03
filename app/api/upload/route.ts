import { NextRequest, NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import {
  isBlobConfigured,
  uploadImage,
  listImages,
  deleteImage,
} from "@/lib/blob"

/**
 * 画像アップロード / ライブラリ API（Vercel Blob）
 *
 * POST   multipart/form-data (field: "file")  → 画像をアップロードして公開 URL を返す
 * GET    ?configured=1 でも呼べる             → 画像ライブラリ一覧
 * DELETE ?url=...                             → ライブラリから削除
 *
 * すべて既存のログイン（getAccessToken）でガードするだけで、
 * Google API 連携の設定（OAuth スコープ等）には一切触れない。
 */

export async function POST(request: NextRequest) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  if (!isBlobConfigured()) {
    return NextResponse.json(
      {
        error:
          "画像ストレージ（Vercel Blob）が未設定です。Vercel の Storage で Blob を作成し、BLOB_READ_WRITE_TOKEN を設定してください。",
      },
      { status: 503 }
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "multipart/form-data で file を送信してください。" },
      { status: 400 }
    )
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file がありません。" }, { status: 400 })
  }

  try {
    const result = await uploadImage(file)
    return NextResponse.json({
      url: result.url,
      pathname: result.pathname,
      contentType: result.contentType,
    })
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : "画像のアップロードに失敗しました",
      e,
      400
    )
  }
}

export async function GET() {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const images = await listImages()
    return NextResponse.json({ configured: isBlobConfigured(), images })
  } catch (e) {
    return errorResponse("画像ライブラリの取得に失敗しました", e)
  }
}

export async function DELETE(request: NextRequest) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = request.nextUrl.searchParams.get("url")
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 })
  }

  try {
    await deleteImage(url)
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : "画像の削除に失敗しました",
      e,
      400
    )
  }
}
