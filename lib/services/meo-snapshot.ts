import { db } from "@/lib/db"
import { meoSnapshots, searchKeywordMonths, storeFeatures } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { withGoogleRead, isGoogleAuthError } from "@/lib/services/google-read"
import { brandCores, splitKeywords, type KeywordCount } from "@/lib/meo-keywords"
import type { MeoSnapshot } from "@/lib/meo-types"

/**
 * MEO「やることリスト」のための、プロフィールの状態の読み取り。
 *
 * - Google から読むだけ。プロフィールは書き換えない。
 * - 対象は、投稿を登録している運用中の店舗（進捗確認の画面と同じ範囲）。
 * - 1店舗につき5つ（基本情報・写真・投稿・クチコミ・検索キーワード）を読むので、
 *   全店舗は1回では終わらない。時間を区切って少しずつ進め、画面側が続きを呼ぶ。
 */

const JST = 9 * 3600e3

function rowsOf(r: unknown): Record<string, unknown>[] {
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[]
}

export interface MeoTarget {
  locationName: string
  accountName: string
  title: string
}

export async function meoTargets(): Promise<MeoTarget[]> {
  return rowsOf(
    await db.execute(sql`
      select s.location_name, s.account_name, s.title
      from stores s
      where s.status = 'active'
        and (s.has_voice_of_merchant is null or s.has_voice_of_merchant = true)
        and s.duplicate_of is null
        and exists (select 1 from scheduled_posts p where p.location_name = s.location_name)
      order by s.title
    `)
  ).map((r) => ({
    locationName: String(r.location_name),
    accountName: String(r.account_name),
    title: String(r.title),
  }))
}

/** 日本時間の「先月」（検索キーワードが確定している、いちばん新しい月） */
export function lastCompleteMonth(now = new Date()): string {
  const d = new Date(now.getTime() + JST)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
}

async function getJson(url: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`GMB API error: ${res.status} ${(await res.text()).slice(0, 300)}`)
  return (await res.json()) as Record<string, unknown>
}

/**
 * 1店舗・1か月ぶんの検索キーワードを Google から読む。
 * 「どんな言葉で検索されて、このプロフィールが表示されたか」と、その回数。
 */
export async function fetchKeywordMonth(
  token: string,
  locationName: string,
  month: string
): Promise<KeywordCount[]> {
  const [y, m] = month.split("-").map(Number)
  const out: KeywordCount[] = []
  let pageToken: string | undefined
  let pages = 0
  do {
    const q = new URLSearchParams({
      "monthlyRange.startMonth.year": String(y),
      "monthlyRange.startMonth.month": String(m),
      "monthlyRange.endMonth.year": String(y),
      "monthlyRange.endMonth.month": String(m),
      pageSize: "100",
    })
    if (pageToken) q.set("pageToken", pageToken)
    const j = (await getJson(
      `https://businessprofileperformance.googleapis.com/v1/${locationName}/searchkeywords/impressions/monthly?${q}`,
      token
    )) as {
      searchKeywordsCounts?: {
        searchKeyword?: string
        insightsValue?: { value?: string; threshold?: string }
      }[]
      nextPageToken?: string
    }
    for (const k of j.searchKeywordsCounts ?? []) {
      if (!k.searchKeyword) continue
      const v = k.insightsValue?.value
      out.push(
        v != null
          ? { word: k.searchKeyword, count: Number(v) || 0 }
          : { word: k.searchKeyword, count: null, under: Number(k.insightsValue?.threshold) || 15 }
      )
    }
    pageToken = j.nextPageToken
    pages++
  } while (pageToken && pages < 5)
  return out
}

/** 過ぎた月のキーワードは変わらないので、読んだら控えておく */
export async function saveKeywordMonth(
  locationName: string,
  month: string,
  keywords: KeywordCount[]
): Promise<void> {
  await db
    .insert(searchKeywordMonths)
    .values({ locationName, month, keywords })
    .onConflictDoUpdate({
      target: [searchKeywordMonths.locationName, searchKeywordMonths.month],
      set: { keywords, fetchedAt: new Date() },
    })
}

export async function brandWordsOf(locationName: string): Promise<string[]> {
  const [row] = await db
    .select({ words: storeFeatures.brandWords })
    .from(storeFeatures)
    .where(eq(storeFeatures.locationName, locationName))
  return row?.words ?? []
}

async function readStore(token: string, t: MeoTarget, month: string): Promise<MeoSnapshot> {
  const snap: MeoSnapshot = {
    version: 1,
    mapsUri: null,
    hours: 0,
    hasWebsite: false,
    primaryCategory: null,
    additionalCategories: [],
    services: 0,
    descriptionLength: 0,
    futureSpecialHours: 0,
    photos: null,
    lastPhotoAt: null,
    lastPostAt: null,
    reviews: null,
    keywords: null,
    errors: [],
  }
  const v4 = `https://mybusiness.googleapis.com/v4/${t.accountName}/${t.locationName}`
  const todayJst = new Date(Date.now() + JST).toISOString().slice(0, 10)

  const location = getJson(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${t.locationName}?readMask=${[
      "name",
      "websiteUri",
      "regularHours",
      "specialHours",
      "categories",
      "profile",
      "serviceItems",
      "metadata",
    ].join(",")}`,
    token
  ).then((raw) => {
    const l = raw as {
      websiteUri?: string
      regularHours?: { periods?: unknown[] }
      specialHours?: {
        specialHourPeriods?: { startDate?: { year?: number; month?: number; day?: number } }[]
      }
      categories?: {
        primaryCategory?: { displayName?: string }
        additionalCategories?: { displayName?: string }[]
      }
      profile?: { description?: string }
      serviceItems?: unknown[]
      metadata?: { mapsUri?: string }
    }
    snap.mapsUri = l.metadata?.mapsUri ?? null
    snap.hours = l.regularHours?.periods?.length ?? 0
    snap.hasWebsite = !!l.websiteUri
    snap.primaryCategory = l.categories?.primaryCategory?.displayName ?? null
    snap.additionalCategories = (l.categories?.additionalCategories ?? [])
      .map((c) => c.displayName ?? "")
      .filter(Boolean)
    snap.services = l.serviceItems?.length ?? 0
    snap.descriptionLength = (l.profile?.description ?? "").length
    snap.futureSpecialHours = (l.specialHours?.specialHourPeriods ?? []).filter((p) => {
      const d = p.startDate
      if (!d?.year || !d.month || !d.day) return false
      const day = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
      return day >= todayJst
    }).length
  })

  const media = getJson(`${v4}/media?pageSize=2500`, token).then((raw) => {
    const m = raw as { mediaItems?: { createTime?: string }[]; totalMediaItemCount?: number }
    const items = m.mediaItems ?? []
    snap.photos = m.totalMediaItemCount ?? items.length
    snap.lastPhotoAt =
      items
        .map((i) => i.createTime ?? "")
        .filter(Boolean)
        .sort()
        .pop() ?? null
  })

  const posts = getJson(`${v4}/localPosts?pageSize=10`, token).then((raw) => {
    const p = raw as { localPosts?: { createTime?: string; state?: string }[] }
    snap.lastPostAt =
      (p.localPosts ?? [])
        .filter((x) => x.state !== "REJECTED")
        .map((x) => x.createTime ?? "")
        .filter(Boolean)
        .sort()
        .pop() ?? null
  })

  const reviews = getJson(`${v4}/reviews?pageSize=50`, token).then((raw) => {
    const r = raw as {
      reviews?: { starRating?: string; reviewReply?: { comment?: string } }[]
      totalReviewCount?: number
      averageRating?: number
    }
    const list = r.reviews ?? []
    const unreplied = list.filter((x) => !x.reviewReply?.comment?.trim())
    snap.reviews = {
      total: r.totalReviewCount ?? list.length,
      average: r.averageRating ?? null,
      checked: list.length,
      unreplied: unreplied.length,
      lowUnreplied: unreplied.filter((x) => x.starRating === "ONE" || x.starRating === "TWO").length,
    }
  })

  const keywords = fetchKeywordMonth(token, t.locationName, month).then(async (list) => {
    await saveKeywordMonth(t.locationName, month, list)
    const split = splitKeywords(list, brandCores(t.title, await brandWordsOf(t.locationName)))
    snap.keywords = {
      month,
      knownTotal: split.knownTotal,
      seekingTotal: split.seekingTotal,
      seekingTop: split.seeking.slice(0, 5),
    }
  })

  const tasks: [string, Promise<void>][] = [
    ["location", location],
    ["media", media],
    ["posts", posts],
    ["reviews", reviews],
    ["keywords", keywords],
  ]
  const results = await Promise.allSettled(tasks.map(([, p]) => p))
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      // 認証の問題は店舗のせいではないので、上に伝えて全体を止める
      if (tasks[i][0] === "location" && isGoogleAuthError(r.reason)) throw r.reason
      snap.errors.push(tasks[i][0])
    }
  })
  return snap
}

export interface RefreshResult {
  processed: number
  remaining: number
  total: number
  authFailed?: boolean
}

/**
 * 控えが古い店舗から順に読み直す。時間（budgetMs）を使い切ったら途中で止め、残りの数を返す。
 * force=true は、startedAt より前に読んだ店舗をすべて読み直す（画面の「いま調べる」）。
 */
export async function refreshMeoSnapshots(opts: {
  budgetMs: number
  /** これより前に読んだ控えを読み直す */
  olderThan: Date
}): Promise<RefreshResult> {
  const started = Date.now()
  const targets = await meoTargets()
  const existing = await db
    .select({ locationName: meoSnapshots.locationName, checkedAt: meoSnapshots.checkedAt })
    .from(meoSnapshots)
  const checkedAt = new Map(existing.map((e) => [e.locationName, e.checkedAt.getTime()]))
  const queue = targets
    .filter((t) => (checkedAt.get(t.locationName) ?? 0) < opts.olderThan.getTime())
    .sort((a, b) => (checkedAt.get(a.locationName) ?? 0) - (checkedAt.get(b.locationName) ?? 0))

  if (queue.length === 0) return { processed: 0, remaining: 0, total: targets.length }

  const month = lastCompleteMonth()
  let processed = 0
  let authFailed = false

  const save = async (t: MeoTarget, snap: MeoSnapshot) => {
    await db
      .insert(meoSnapshots)
      .values({ locationName: t.locationName, data: snap })
      .onConflictDoUpdate({
        target: meoSnapshots.locationName,
        set: { data: snap, checkedAt: new Date() },
      })
    processed++
  }

  try {
    await withGoogleRead(async (token) => {
      // 1店舗目で認証を確かめる（切れていれば、ここで次の認証に切り替わる）
      if (processed === 0) await save(queue[0], await readStore(token, queue[0], month))
      let index = 1
      const worker = async () => {
        while (Date.now() - started < opts.budgetMs) {
          const i = index++
          if (i >= queue.length) break
          try {
            await save(queue[i], await readStore(token, queue[i], month))
          } catch {
            // この店舗は次の回に回す
          }
        }
      }
      await Promise.all(Array.from({ length: 4 }, worker))
    })
  } catch (e) {
    if (isGoogleAuthError(e)) authFailed = true
    else throw e
  }

  return {
    processed,
    remaining: Math.max(0, queue.length - processed),
    total: targets.length,
    ...(authFailed ? { authFailed: true } : {}),
  }
}

export async function setDismissed(
  locationName: string,
  checkId: string,
  dismissed: boolean
): Promise<void> {
  const [row] = await db
    .select({ dismissed: meoSnapshots.dismissed })
    .from(meoSnapshots)
    .where(eq(meoSnapshots.locationName, locationName))
  if (!row) return
  const set = new Set(row.dismissed ?? [])
  if (dismissed) set.add(checkId)
  else set.delete(checkId)
  await db
    .update(meoSnapshots)
    .set({ dismissed: [...set] })
    .where(and(eq(meoSnapshots.locationName, locationName)))
}
