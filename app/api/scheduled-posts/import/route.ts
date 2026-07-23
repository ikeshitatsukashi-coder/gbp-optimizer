import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scheduledPosts, stores } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { inArray } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"
import { normalizeSearchText } from "@/lib/search-normalize"
import * as XLSX from "xlsx"

/**
 * POST /api/scheduled-posts/import
 * multipart/form-data: file=<xlsx|csv>
 *
 * 期待するカラム（1 行 = 1 予約投稿）:
 *   locationName / 店舗ID  (必須): "locations/12345" or "12345"
 *   scheduledFor / 予約日時 (必須): "2026-07-15 10:00" or ISO
 *   summary / 本文        (必須)
 *   postType / 投稿タイプ  (省略時 STANDARD)
 *   mediaUrl / 画像URL    (任意)
 *   ctaType / CTA種別    (任意: BOOK/ORDER/SHOP/LEARN_MORE/SIGN_UP/CALL)
 *   ctaUrl / CTAリンク   (任意)
 *
 * 実行はしない — 全て status='pending' の予約として登録する。
 * 実行は既存の /scheduled-posts 画面から手動で承認・トリガーする。
 */
const HEADER_ALIASES: Record<string, string> = {
  locationname: "locationName",
  location_name: "locationName",
  店舗id: "locationName",
  ロケーションid: "locationName",
  locationid: "locationName",
  店舗名: "storeName",
  店舗: "storeName",
  店名: "storeName",
  会社名: "storeName",
  ビジネス名: "storeName",
  事業所名: "storeName",
  storename: "storeName",
  store_name: "storeName",
  scheduledfor: "scheduledFor",
  scheduled_for: "scheduledFor",
  予約日時: "scheduledFor",
  投稿日時: "scheduledFor",
  summary: "summary",
  本文: "summary",
  投稿内容: "summary",
  posttype: "postType",
  post_type: "postType",
  投稿タイプ: "postType",
  種別: "postType",
  mediaurl: "mediaUrl",
  media_url: "mediaUrl",
  画像url: "mediaUrl",
  画像: "mediaUrl",
  ctatype: "ctaType",
  cta_type: "ctaType",
  cta種別: "ctaType",
  ctaurl: "ctaUrl",
  cta_url: "ctaUrl",
  ctaリンク: "ctaUrl",
}

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[\s_-]/g, "").replace(/[()（）\[\]]/g, "")
}

function pickField(row: Record<string, unknown>, canonical: string): unknown {
  const target = canonical.toLowerCase()
  for (const [rawKey, val] of Object.entries(row)) {
    const norm = normalizeKey(rawKey)
    if (HEADER_ALIASES[norm] === canonical) return val
    if (norm === target) return val
  }
  return undefined
}

const VALID_POST_TYPES = ["STANDARD", "EVENT", "OFFER", "ALERT"]
const VALID_CTA = ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"]

export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // 入力は 2 通り:
  //  (A) application/json  { rows: [...] }  … クライアントで xlsx を解析済み（推奨・軽量）
  //  (B) multipart/form-data file=<xlsx>   … 後方互換（ファイルが4.5MB超だと失敗する）
  let rows: Record<string, unknown>[] = []
  const contentType = request.headers.get("content-type") ?? ""

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { rows?: Record<string, unknown>[] }
      if (!Array.isArray(body.rows)) {
        return NextResponse.json({ error: "rows 配列が必要です" }, { status: 400 })
      }
      rows = body.rows
    } else {
      const formData = await request.formData()
      const f = formData.get("file")
      if (!(f instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 })
      }
      const arrayBuf = await f.arrayBuffer()
      const workbook = XLSX.read(arrayBuf, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        return NextResponse.json({ error: "No sheet found" }, { status: 400 })
      }
      const sheet = workbook.Sheets[sheetName]
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: false,
        defval: null,
      })
    }
  } catch {
    return NextResponse.json({ error: "ファイルの読み取りに失敗しました" }, { status: 400 })
  }

  try {
    // 店舗名→locationName の逆引きも許容
    const allStores = await db
      .select({ locationName: stores.locationName, title: stores.title })
      .from(stores)
    const byTitle = new Map(allStores.map((s) => [s.title, s.locationName]))
    const validLocationNames = new Set(allStores.map((s) => s.locationName))
    // locations/ を除いた純粋なID → locationName（ID列に数字だけが入っていても照合可能に）
    const byBareId = new Map(
      allStores.map((s) => [s.locationName.replace(/^locations\//, ""), s.locationName])
    )
    // あいまい店舗名照合（中黒・スペース・全角半角の違いを吸収）
    const byNormTitle = new Map<string, string[]>()
    for (const s of allStores) {
      const key = normalizeSearchText(s.title)
      const arr = byNormTitle.get(key)
      if (arr) arr.push(s.locationName)
      else byNormTitle.set(key, [s.locationName])
    }

    /** 店舗名 or ID から locationName を解決 */
    const resolveLocation = (
      locRaw: unknown,
      storeNameRaw: unknown
    ): string | null => {
      // 1) locationName / 店舗ID 列
      if (typeof locRaw === "string" && locRaw.trim()) {
        const cleaned = locRaw.trim()
        const withPrefix = cleaned.startsWith("locations/")
          ? cleaned
          : `locations/${cleaned}`
        if (validLocationNames.has(withPrefix)) return withPrefix
        const bare = cleaned.replace(/^locations\//, "")
        if (byBareId.has(bare)) return byBareId.get(bare)!
      }
      // 2) 店舗名 列（完全一致 → あいまい一致）
      if (typeof storeNameRaw === "string" && storeNameRaw.trim()) {
        const name = storeNameRaw.trim()
        if (byTitle.has(name)) return byTitle.get(name)!
        const norm = normalizeSearchText(name)
        const hit = byNormTitle.get(norm)
        if (hit && hit.length === 1) return hit[0]
      }
      return null
    }

    const errors: Array<{ rowIndex: number; error: string; rowData: unknown }> = []
    const toInsert: Array<{
      locationName: string
      scheduledFor: Date
      postType: string
      summary: string
      mediaUrls: string[] | null
      callToAction: { actionType?: string; url?: string } | null
    }> = []

    rows.forEach((row, idx) => {
      const rowIndex = idx + 2 // sheet row (1 = header)
      const locRaw = pickField(row, "locationName")
      const storeNameRaw = pickField(row, "storeName")
      const dateRaw = pickField(row, "scheduledFor")
      const summaryRaw = pickField(row, "summary")

      // location 特定: locationName 直接 or storeName から（あいまい照合あり）
      const locationName = resolveLocation(locRaw, storeNameRaw)
      if (!locationName) {
        const shown =
          (typeof storeNameRaw === "string" && storeNameRaw.trim()) ||
          (typeof locRaw === "string" && locRaw.trim()) ||
          "（店舗名・店舗ID列が空）"
        errors.push({
          rowIndex,
          error: `店舗が特定できません: 「${shown}」`,
          rowData: row,
        })
        return
      }

      // 日時パース
      let scheduledFor: Date | null = null
      if (typeof dateRaw === "string") {
        // Excel の "2026/07/15 10:00" や "2026-07-15T10:00" などを許容
        const s = dateRaw.trim().replace(/\//g, "-")
        const d = new Date(s)
        if (!isNaN(d.getTime())) scheduledFor = d
      } else if (dateRaw instanceof Date) {
        scheduledFor = dateRaw
      }
      if (!scheduledFor || isNaN(scheduledFor.getTime())) {
        errors.push({
          rowIndex,
          error: `予約日時のパース失敗 (${JSON.stringify(dateRaw)})`,
          rowData: row,
        })
        return
      }

      // 本文
      const summary = typeof summaryRaw === "string" ? summaryRaw.trim() : ""
      if (!summary) {
        errors.push({ rowIndex, error: "本文が空です", rowData: row })
        return
      }

      // 投稿タイプ
      let postType = "STANDARD"
      const pt = pickField(row, "postType")
      if (typeof pt === "string" && pt.trim()) {
        const upper = pt.trim().toUpperCase()
        if (VALID_POST_TYPES.includes(upper)) {
          postType = upper
        }
      }

      // メディア
      const mediaUrl = pickField(row, "mediaUrl")
      const mediaUrls =
        typeof mediaUrl === "string" && mediaUrl.trim()
          ? [mediaUrl.trim()]
          : null

      // CTA
      let callToAction: { actionType: string; url?: string } | null = null
      const ctaTypeRaw = pickField(row, "ctaType")
      const ctaUrlRaw = pickField(row, "ctaUrl")
      if (typeof ctaTypeRaw === "string" && ctaTypeRaw.trim()) {
        const upper = ctaTypeRaw.trim().toUpperCase()
        if (VALID_CTA.includes(upper)) {
          callToAction = {
            actionType: upper,
            ...(typeof ctaUrlRaw === "string" && ctaUrlRaw.trim()
              ? { url: ctaUrlRaw.trim() }
              : {}),
          }
        }
      }

      toInsert.push({
        locationName,
        scheduledFor,
        postType,
        summary,
        mediaUrls,
        callToAction,
      })
    })

    let insertedCount = 0
    if (toInsert.length > 0) {
      const result = await db
        .insert(scheduledPosts)
        .values(
          toInsert.map((row) => ({
            locationName: row.locationName,
            scheduledFor: row.scheduledFor,
            postType: row.postType,
            summary: row.summary,
            mediaUrls: row.mediaUrls,
            callToAction: row.callToAction,
            status: "pending",
          }))
        )
        .returning({ id: scheduledPosts.id })
      insertedCount = result.length
    }

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      inserted: insertedCount,
      errors,
    })
  } catch (e) {
    return errorResponse("Failed to import", e)
  }
}

/**
 * GET /api/scheduled-posts/import?template=1
 * 空のテンプレート EXCEL をダウンロード
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  if (url.searchParams.get("template") === "1") {
    return exportTemplate()
  }

  // 現状の予約一覧を EXCEL でエクスポート
  const rows = await db
    .select({
      locationName: scheduledPosts.locationName,
      scheduledFor: scheduledPosts.scheduledFor,
      postType: scheduledPosts.postType,
      summary: scheduledPosts.summary,
      mediaUrls: scheduledPosts.mediaUrls,
      callToAction: scheduledPosts.callToAction,
      status: scheduledPosts.status,
    })
    .from(scheduledPosts)
    .orderBy(scheduledPosts.scheduledFor)

  const storeMap = new Map(
    (await db.select({ locationName: stores.locationName, title: stores.title }).from(stores)).map(
      (s) => [s.locationName, s.title]
    )
  )

  const data = rows.map((r) => ({
    locationName: r.locationName,
    店舗名: storeMap.get(r.locationName) ?? "",
    予約日時: r.scheduledFor?.toISOString().slice(0, 16).replace("T", " "),
    投稿タイプ: r.postType,
    本文: r.summary,
    画像URL: r.mediaUrls?.[0] ?? "",
    CTA種別:
      (r.callToAction as { actionType?: string } | null)?.actionType ?? "",
    CTAリンク: (r.callToAction as { url?: string } | null)?.url ?? "",
    ステータス: r.status,
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "scheduled_posts")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="scheduled-posts-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}

async function exportTemplate() {
  const example = [
    {
      locationName: "locations/12345678901234567",
      店舗名: "（省略可・locationName が正しければ不要）",
      予約日時: "2026-07-15 10:00",
      投稿タイプ: "STANDARD",
      本文: "本文サンプル。1500文字まで。",
      画像URL: "https://example.com/photo.jpg",
      CTA種別: "LEARN_MORE",
      CTAリンク: "https://www.example.com",
    },
  ]
  const ws = XLSX.utils.json_to_sheet(example)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "template")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="scheduled-posts-template.xlsx"`,
    },
  })
}
