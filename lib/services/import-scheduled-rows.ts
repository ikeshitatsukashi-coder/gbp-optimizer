import { db } from "@/lib/db"
import { scheduledPosts, stores } from "@/lib/db/schema"
import { normalizeSearchText } from "@/lib/search-normalize"

/**
 * 予約投稿の一括インポート共通ロジック。
 * xlsx（クライアント解析）と Google Sheets 直接読み取りの両方から利用。
 *
 * 期待するカラム（見出しのゆらぎは HEADER_ALIASES で吸収）:
 *   locationName / 店舗ID  (必須): "locations/12345" or "12345"
 *   店舗名 も可（あいまい照合あり）
 *   scheduledFor / 予約日時 (必須): "2026-07-15 10:00" or ISO
 *   summary / 本文        (必須)
 *   postType / 投稿タイプ  (省略時 STANDARD)
 *   mediaUrl / 画像URL    (任意)
 *   ctaType / CTA種別 / ctaUrl / CTAリンク (任意)
 *
 * 実投稿はせず status='pending' の予約として登録する。
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
  日時: "scheduledFor",
  summary: "summary",
  本文: "summary",
  投稿内容: "summary",
  内容: "summary",
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

export interface ImportResult {
  success: true
  totalRows: number
  inserted: number
  errors: Array<{ rowIndex: number; error: string; rowData: unknown }>
}

export async function importScheduledRows(
  rows: Record<string, unknown>[]
): Promise<ImportResult> {
  const allStores = await db
    .select({ locationName: stores.locationName, title: stores.title })
    .from(stores)
  const byTitle = new Map(allStores.map((s) => [s.title, s.locationName]))
  const validLocationNames = new Set(allStores.map((s) => s.locationName))
  const byBareId = new Map(
    allStores.map((s) => [s.locationName.replace(/^locations\//, ""), s.locationName])
  )
  const byNormTitle = new Map<string, string[]>()
  for (const s of allStores) {
    const key = normalizeSearchText(s.title)
    const arr = byNormTitle.get(key)
    if (arr) arr.push(s.locationName)
    else byNormTitle.set(key, [s.locationName])
  }

  const resolveLocation = (locRaw: unknown, storeNameRaw: unknown): string | null => {
    if (typeof locRaw === "string" && locRaw.trim()) {
      const cleaned = locRaw.trim()
      const withPrefix = cleaned.startsWith("locations/")
        ? cleaned
        : `locations/${cleaned}`
      if (validLocationNames.has(withPrefix)) return withPrefix
      const bare = cleaned.replace(/^locations\//, "")
      if (byBareId.has(bare)) return byBareId.get(bare)!
    }
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
    const rowIndex = idx + 2 // 1 = 見出し
    const locRaw = pickField(row, "locationName")
    const storeNameRaw = pickField(row, "storeName")
    const dateRaw = pickField(row, "scheduledFor")
    const summaryRaw = pickField(row, "summary")

    const locationName = resolveLocation(locRaw, storeNameRaw)
    if (!locationName) {
      const shown =
        (typeof storeNameRaw === "string" && storeNameRaw.trim()) ||
        (typeof locRaw === "string" && locRaw.trim()) ||
        "（店舗名・店舗ID列が空）"
      errors.push({ rowIndex, error: `店舗が特定できません: 「${shown}」`, rowData: row })
      return
    }

    let scheduledFor: Date | null = null
    if (typeof dateRaw === "string") {
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

    const summary = typeof summaryRaw === "string" ? summaryRaw.trim() : ""
    if (!summary) {
      errors.push({ rowIndex, error: "本文が空です", rowData: row })
      return
    }

    let postType = "STANDARD"
    const pt = pickField(row, "postType")
    if (typeof pt === "string" && pt.trim()) {
      const upper = pt.trim().toUpperCase()
      if (VALID_POST_TYPES.includes(upper)) postType = upper
    }

    const mediaUrl = pickField(row, "mediaUrl")
    const mediaUrls =
      typeof mediaUrl === "string" && mediaUrl.trim() ? [mediaUrl.trim()] : null

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

    toInsert.push({ locationName, scheduledFor, postType, summary, mediaUrls, callToAction })
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

  return { success: true, totalRows: rows.length, inserted: insertedCount, errors }
}
