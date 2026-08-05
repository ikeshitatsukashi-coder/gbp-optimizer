import { NextResponse } from "next/server"
import { put, list, del, type ListBlobResult } from "@vercel/blob"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { requireRole } from "@/lib/services/authz"
import { db } from "@/lib/db"
import { companies, stores } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/** パスに使える値だけを許可する（想定外の値でパスを掘られないようにする） */
function safeSegment(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim().replace(/^locations\//, "")
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null
}

/**
 * 画像を入れるフォルダ名を決める。
 *
 * 会社が紐づいている店舗 → 会社コード（例: C001）
 *   同じ会社の営業所どうしでは画像を共有できるようにする。
 * 会社が未設定の店舗     → 店舗ID
 *   会社マスタの紐づけが済むまでの暫定。少なくとも別会社とは混ざらない。
 */
async function folderFor(locationIdRaw: string | null): Promise<string | null> {
  const bare = safeSegment(locationIdRaw)
  if (!bare) return null
  try {
    const [row] = await db
      .select({ code: companies.code })
      .from(stores)
      .leftJoin(companies, eq(stores.companyId, companies.id))
      .where(eq(stores.locationName, `locations/${bare}`))
    const code = safeSegment(row?.code ?? null)
    if (code) return code
  } catch {
    /* 会社が引けない場合は店舗IDで分ける */
  }
  return bare
}

/**
 * blob のパスからフォルダ名を取り出す。
 * post-images/<会社コード or 店舗ID>/<ファイル名> → そのフォルダ名
 * post-images/<ファイル名>                       → null（フォルダ導入前の画像 = 共通）
 */
function folderOfPath(pathname: string): string | null {
  const rest = pathname.replace(/^post-images\//, "")
  const i = rest.indexOf("/")
  return i > 0 ? rest.slice(0, i) : null
}

/**
 * POST /api/upload  (multipart/form-data: file, locationId)
 *
 * 投稿用画像を Vercel Blob にアップロードして公開 URL を返す。
 * リサイズはクライアント側（lib/image-resize.ts）で実施済みの前提。
 * Google の投稿 API は公開 URL からしか画像を取得できないため、この保管層が必要。
 *
 * 画像は会社ごとのフォルダ（post-images/<会社コード>/）に保存する。
 * 全店舗で1つのフォルダを共有していると、別の会社の画像を取り違える恐れがあるため。
 * 会社が未設定の店舗は暫定で店舗IDのフォルダに入れる。
 */
export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

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
  let folder: string | null = null
  try {
    const formData = await request.formData()
    const f = formData.get("file")
    if (f instanceof File) file = f
    const loc = formData.get("locationId")
    folder = await folderFor(typeof loc === "string" ? loc : null)
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
    // 店舗が特定できない場合のみ従来どおり共通フォルダへ置く
    const key = folder
      ? `post-images/${folder}/${Date.now()}-${safeName}`
      : `post-images/${Date.now()}-${safeName}`
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
    })
    return NextResponse.json({ url: blob.url, folder })
  } catch (e) {
    return errorResponse("Upload failed", e)
  }
}

/**
 * GET /api/upload?locationId=... — アップロード済み画像の一覧（画像アーカイブ）
 *
 * locationId を指定すると、その店舗が属する会社のフォルダ（会社未設定なら店舗の
 * フォルダ）の画像＋フォルダ導入前の共通画像だけを返す。他社の画像は返さない。
 */
export async function GET(request: Request) {
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
  const wanted = await folderFor(new URL(request.url).searchParams.get("locationId"))

  try {
    const blobs: {
      url: string
      pathname: string
      size: number
      uploadedAt: string
      /** null = 店舗フォルダ導入前の共通画像 */
      folder: string | null
    }[] = []
    let cursor: string | undefined
    // 絞り込む場合は該当フォルダだけを取りに行く（他社のフォルダを読まない）
    const prefixes = wanted ? [`post-images/${wanted}/`, "post-images/"] : ["post-images/"]

    for (const prefix of prefixes) {
      cursor = undefined
      do {
        // 明示的に型を付けて cursor と page の循環推論を避ける
        const from: string | undefined = cursor
        const page: ListBlobResult = await list({ prefix, limit: 500, cursor: from })
        for (const b of page.blobs) {
          const folder = folderOfPath(b.pathname)
          // 指定時は「該当フォルダ」と「共通（フォルダなし）」のみ
          if (wanted && folder !== wanted && folder !== null) continue
          if (blobs.some((x) => x.url === b.url)) continue
          blobs.push({
            url: b.url,
            pathname: b.pathname,
            size: b.size,
            uploadedAt:
              b.uploadedAt instanceof Date ? b.uploadedAt.toISOString() : String(b.uploadedAt),
            folder,
          })
        }
        cursor = page.cursor ?? undefined
      } while (cursor && blobs.length < 1000)
    }

    blobs.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
    return NextResponse.json({ images: blobs, locationId: wanted })
  } catch (e) {
    return errorResponse("Failed to list images", e)
  }
}

/**
 * DELETE /api/upload?url=... — アーカイブから画像を削除
 * ※予約中・投稿済みの投稿が参照している画像を消すと表示できなくなるため、UI側で注意喚起
 */
export async function DELETE(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const url = new URL(request.url).searchParams.get("url")
  if (!url || !url.includes("blob.vercel-storage.com")) {
    return NextResponse.json({ error: "url が不正です" }, { status: 400 })
  }
  try {
    await del(url)
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to delete image", e)
  }
}
