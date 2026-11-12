import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { put } from "@vercel/blob"
import { db } from "@/lib/db"
import { photoIntakeLinks, photoIntakeUploads, stores } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { resolveStoreScope } from "@/lib/services/image-scope"

/**
 * お客様用の写真受付（ログイン不要・URLが鍵）
 *
 *   GET  /api/public/photo-intake/{token}   店舗名を返す（受付中かどうかの確認）
 *   POST /api/public/photo-intake/{token}   写真を1枚受け取る（multipart: file, senderName, note）
 *
 * 受け取った写真は、画像アーカイブと同じ保管場所の、その店舗（会社）のフォルダに入れる。
 * Google には何も送らない。投稿に使うかどうかは担当が決める。
 *
 * だれでも開けるURLなので、送れる量に上限を設けている。
 */

/** 1店舗が24時間に受け取る上限（通常の利用では届かない量。いたずら・誤操作の歯止め） */
const DAILY_LIMIT_PER_STORE = 300
const MAX_BYTES = 4 * 1024 * 1024

function rowsOf(r: unknown): Record<string, unknown>[] {
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[]
}

async function findLink(token: string) {
  if (!token || !/^[a-f0-9]{40}$/.test(token)) return null
  const [row] = await db
    .select({
      locationName: photoIntakeLinks.locationName,
      enabled: photoIntakeLinks.enabled,
      title: stores.title,
      status: stores.status,
    })
    .from(photoIntakeLinks)
    .innerJoin(stores, eq(stores.locationName, photoIntakeLinks.locationName))
    .where(eq(photoIntakeLinks.token, token))
  if (!row || !row.enabled || row.status !== "active") return null
  return row
}

/** 中身が本当に画像かを先頭の数バイトで確かめる（拡張子や申告された種類は信用しない） */
function sniffImage(buf: Uint8Array): { ext: string; type: string } | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", type: "image/jpeg" }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: "png", type: "image/png" }
  }
  const ascii = (a: number, b: number) => String.fromCharCode(...buf.slice(a, b))
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", type: "image/webp" }
  return null
}

const clean = (v: FormDataEntryValue | null, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) || null : null

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = checkRateLimit(`pub-photo-get:${getClientId(request)}`, { windowMs: 60_000, max: 30 })
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  const { token } = await params
  const link = await findLink(token)
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ storeTitle: link.title })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = checkRateLimit(`pub-photo-post:${getClientId(request)}`, {
    windowMs: 10 * 60_000,
    max: 120,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "たくさんの写真をありがとうございます。少し時間をおいてから続きをお送りください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    )
  }
  const { token } = await params
  const link = await findLink(token)
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "ただいま写真を受け取れません" }, { status: 503 })
  }

  let file: File | null = null
  let senderName: string | null = null
  let note: string | null = null
  try {
    const form = await request.formData()
    const f = form.get("file")
    if (f instanceof File) file = f
    senderName = clean(form.get("senderName"), 60)
    note = clean(form.get("note"), 300)
  } catch {
    return NextResponse.json({ error: "写真を受け取れませんでした" }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: "写真が選ばれていません" }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "写真のサイズが大きすぎます" }, { status: 413 })
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImage(bytes)
  if (!kind) {
    return NextResponse.json({ error: "写真（画像ファイル）だけお送りいただけます" }, { status: 400 })
  }

  try {
    const recent = rowsOf(
      await db.execute(sql`
        select count(*)::int as n from photo_intake_uploads
        where location_name = ${link.locationName} and created_at > now() - interval '24 hours'
      `)
    )
    if (Number(recent[0]?.n ?? 0) >= DAILY_LIMIT_PER_STORE) {
      return NextResponse.json(
        { error: "本日はたくさんの写真をいただきました。続きは明日以降にお送りください。" },
        { status: 429 }
      )
    }

    const scope = await resolveStoreScope(link.locationName)
    if (!scope.folder) {
      return NextResponse.json({ error: "写真を受け取れませんでした" }, { status: 500 })
    }
    // ファイル名の先頭に okyakusama を付け、画像アーカイブでお客様から届いた写真だと分かるようにする
    const key = `post-images/${scope.folder}/okyakusama-${Date.now()}-${randomBytes(4).toString("hex")}.${kind.ext}`
    const blob = await put(key, Buffer.from(bytes), { access: "public", contentType: kind.type })
    await db.insert(photoIntakeUploads).values({
      locationName: link.locationName,
      url: blob.url,
      fileName: file.name.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120) || null,
      senderName,
      note,
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[photo-intake] upload failed:", e instanceof Error ? e.message : e)
    return NextResponse.json(
      { error: "写真を受け取れませんでした。もう一度お試しください。" },
      { status: 500 }
    )
  }
}
