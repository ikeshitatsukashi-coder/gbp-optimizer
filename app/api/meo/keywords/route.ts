import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { searchKeywordMonths, storeFeatures, stores } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { withGoogleRead } from "@/lib/services/google-read"
import { brandCores, splitKeywords, type KeywordCount } from "@/lib/meo-keywords"
import {
  brandWordsOf,
  fetchKeywordMonth,
  lastCompleteMonth,
  saveKeywordMonth,
} from "@/lib/services/meo-snapshot"

export const maxDuration = 60

/**
 * 検索キーワード（社内・ログイン必須）
 *
 *   GET ?locationName=...   直近6か月の「どんな言葉で検索されて表示されたか」を、
 *                           知っている人の検索／探している人の検索に分けて返す
 *   PATCH { locationName, brandWords }  社名として扱う言葉を登録する（分け方の調整）
 *
 * Google から読むだけ。過ぎた月は一度読んだら控えから出す。
 */

const MONTHS = 6

function normalizeLocation(raw: string | null | undefined): string | null {
  const id = (raw ?? "").replace(/^locations\//, "")
  return /^\d{1,30}$/.test(id) ? `locations/${id}` : null
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const locationName = normalizeLocation(new URL(request.url).searchParams.get("locationName"))
  if (!locationName) {
    return NextResponse.json({ error: "店舗を指定してください" }, { status: 400 })
  }
  try {
    const [store] = await db
      .select({ title: stores.title })
      .from(stores)
      .where(eq(stores.locationName, locationName))
    if (!store) return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })

    const latest = lastCompleteMonth()
    const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(latest, i - (MONTHS - 1)))
    const cached = await db
      .select()
      .from(searchKeywordMonths)
      .where(
        and(
          eq(searchKeywordMonths.locationName, locationName),
          inArray(searchKeywordMonths.month, months)
        )
      )
    const byMonth = new Map<string, KeywordCount[]>()
    for (const c of cached) {
      // いちばん新しい月は、月初のうちは数字が動くことがあるので、1週間たった控えは読み直す
      const stale =
        c.month === latest && Date.now() - c.fetchedAt.getTime() > 7 * 86400e3
      if (!stale) byMonth.set(c.month, c.keywords)
    }
    const missing = months.filter((m) => !byMonth.has(m))
    const failed: string[] = []
    if (missing.length > 0) {
      await withGoogleRead(async (token) => {
        for (const m of missing) {
          try {
            const list = await fetchKeywordMonth(token, locationName, m)
            await saveKeywordMonth(locationName, m, list)
            byMonth.set(m, list)
          } catch (e) {
            // 1か月目の失敗は認証の問題かもしれないので上に伝える（次の認証でやり直す）
            if (m === missing[0] && byMonth.size === cached.length) throw e
            failed.push(m)
          }
        }
      })
    }

    const brandWords = await brandWordsOf(locationName)
    const cores = brandCores(store.title, brandWords)
    return NextResponse.json({
      storeTitle: store.title,
      brandWords,
      cores,
      failed,
      months: months.map((m) => {
        const list = byMonth.get(m) ?? []
        const s = splitKeywords(list, cores)
        return {
          month: m,
          knownTotal: s.knownTotal,
          seekingTotal: s.seekingTotal,
          known: s.known.slice(0, 40),
          seeking: s.seeking.slice(0, 60),
          words: list.length,
        }
      }),
    })
  } catch (e) {
    return errorResponse("検索キーワードを読み込めませんでした", e)
  }
}

export async function PATCH(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: { locationName?: string; brandWords?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const locationName = normalizeLocation(body.locationName)
  if (!locationName || !Array.isArray(body.brandWords)) {
    return NextResponse.json({ error: "店舗と言葉を指定してください" }, { status: 400 })
  }
  const words = [
    ...new Set(
      body.brandWords
        .filter((w): w is string => typeof w === "string")
        .map((w) => w.trim().slice(0, 40))
        .filter((w) => w.length >= 2)
    ),
  ].slice(0, 30)
  try {
    const email = await getSessionEmail()
    await db
      .insert(storeFeatures)
      .values({ locationName, brandWords: words, updatedBy: email })
      .onConflictDoUpdate({
        target: storeFeatures.locationName,
        set: { brandWords: words, updatedBy: email, updatedAt: new Date() },
      })
    return NextResponse.json({ success: true, brandWords: words })
  } catch (e) {
    return errorResponse("保存できませんでした", e)
  }
}
