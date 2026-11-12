import { db } from "@/lib/db"
import { stores } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createGmbClient } from "@/lib/gbp-client"
import { withGoogleRead } from "@/lib/services/google-read"
import {
  JST_MS,
  jstMonthKey,
  lastSixMonths,
  monthBounds,
  shiftMonth,
  type MonthlyReportData,
  type ReviewMonth,
} from "@/lib/monthly-report-types"

/**
 * 月次レポート（1店舗・1か月分）を Google から読み取って組み立てる。
 *
 * - 読み取りだけ。Google にも、このツールのデータベースにも何も書き込まない。
 * - クチコミは取り込み済みのデータ（reviews_archive）ではなく、その場で Google から読む。
 *   取り込みが止まっていても、レポートの数字は今の状態になる。
 * - 4つの取得（投稿・写真・表示回数・クチコミ）は別々に行い、
 *   どれかが失敗しても残りは出す（失敗した項目は errors に入る）。
 */

interface GPost {
  name?: string
  summary?: string
  state?: string
  createTime?: string
  searchUrl?: string
  topicType?: string
  callToAction?: { actionType?: string; url?: string }
  media?: { googleUrl?: string; mediaFormat?: string }[]
}
interface GMedia {
  name?: string
  mediaFormat?: string
  googleUrl?: string
  thumbnailUrl?: string
  createTime?: string
}
interface GReview {
  name?: string
  reviewer?: { displayName?: string }
  starRating?: string
  comment?: string
  createTime?: string
  updateTime?: string
  reviewReply?: { comment?: string }
}

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Googleが自動で付ける翻訳文（(Translated by Google) …）を落として原文だけにする */
function originalComment(c: string | undefined): string {
  if (!c) return ""
  const i = c.indexOf("(Translated by Google)")
  const j = c.indexOf("(Original)")
  if (j >= 0) return c.slice(j + "(Original)".length).trim()
  if (i >= 0) return c.slice(0, i).trim()
  return c.trim()
}

/** 住所から「都道府県＋市区町村」を取り出す（Googleの住所は市区町村が1行目に入っている） */
function areaOf(address: unknown): string {
  const a = (address ?? null) as {
    administrativeArea?: string
    locality?: string
    addressLines?: string[]
  } | null
  if (!a) return ""
  let city = a.locality ?? ""
  if (!city) {
    const line = a.addressLines?.[0] ?? ""
    const m = line.match(/^(.+?[市区町村郡])(市)?/)
    if (m) city = m[1] + (m[2] ?? "")
  }
  return `${a.administrativeArea ?? ""}${city}`
}

export async function buildMonthlyReport(
  locationName: string,
  month: string
): Promise<MonthlyReportData> {
  const [store] = await db
    .select({
      title: stores.title,
      accountName: stores.accountName,
      address: stores.address,
    })
    .from(stores)
    .where(eq(stores.locationName, locationName))
  if (!store) throw new Error("店舗が見つかりません")

  const months = lastSixMonths(month)
  const prev = shiftMonth(month, -1)
  const { start, end } = monthBounds(month)
  const windowStart = monthBounds(months[0]).start
  const now = new Date()
  const nowJst = new Date(now.getTime() + JST_MS)
  const isPartial = jstMonthKey(now) === month
  // 集計の最終日（日本時間）。今月分はきょうまで、過去の月は月末まで
  const lastDay = isPartial
    ? ymd(nowJst)
    : ymd(new Date(end.getTime() + JST_MS - 86400e3))

  const area = areaOf(store.address)

  const report: MonthlyReportData = {
    version: 1,
    locationName,
    storeTitle: store.title,
    area: area || null,
    month,
    months,
    generatedAt: now.toISOString(),
    period: { firstDay: `${month}-01`, lastDay, isPartial },
    posts: null,
    photos: null,
    insights: null,
    reviews: null,
    errors: [],
  }

  const acc = store.accountName

  /* ------------------------------ 投稿 ------------------------------ */
  const postsTask = withGoogleRead(async (token) => {
    const gmb = createGmbClient(token)
    const res = (await gmb.listPosts(acc, locationName)) as { localPosts: GPost[] }
    const live = res.localPosts.filter((p) => p.createTime && p.state !== "REJECTED")
    const byMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]))
    for (const p of live) {
      const k = jstMonthKey(p.createTime!)
      if (k in byMonth) byMonth[k]++
    }
    const inMonth = live
      .filter((p) => jstMonthKey(p.createTime!) === month)
      .sort((a, b) => (a.createTime! < b.createTime! ? -1 : 1))
    report.posts = {
      count: inMonth.length,
      prevCount: byMonth[prev] ?? 0,
      withPhoto: inMonth.filter((p) => p.media?.some((m) => m.googleUrl)).length,
      byMonth,
      items: inMonth.slice(0, 12).map((p) => ({
        createTime: p.createTime!,
        summary: (p.summary ?? "").slice(0, 160),
        photoUrl: p.media?.find((m) => m.googleUrl)?.googleUrl ?? null,
        hasButton: !!p.callToAction?.url,
      })),
    }
  }).catch((e) => {
    report.errors.push({ section: "posts", message: String(e instanceof Error ? e.message : e).slice(0, 200) })
  })

  /* --------------------------- 写真（写真欄） --------------------------- */
  const photosTask = withGoogleRead(async (token) => {
    const gmb = createGmbClient(token)
    const all: GMedia[] = []
    let total: number | null = null
    let pageToken: string | undefined
    let pages = 0
    do {
      const res = (await gmb.listMedia(acc, locationName, pageToken)) as {
        mediaItems?: GMedia[]
        totalMediaItemCount?: number
        nextPageToken?: string
      }
      if (Array.isArray(res.mediaItems)) all.push(...res.mediaItems)
      if (typeof res.totalMediaItemCount === "number") total = res.totalMediaItemCount
      pageToken = res.nextPageToken
      pages++
    } while (pageToken && pages < 30)
    const byMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]))
    for (const m of all) {
      if (!m.createTime) continue
      const k = jstMonthKey(m.createTime)
      if (k in byMonth) byMonth[k]++
    }
    const inMonth = all
      .filter((m) => m.createTime && jstMonthKey(m.createTime) === month)
      .sort((a, b) => (a.createTime! < b.createTime! ? -1 : 1))
    report.photos = {
      added: inMonth.length,
      prevAdded: byMonth[prev] ?? 0,
      total: total ?? all.length,
      byMonth,
      items: inMonth.slice(0, 18).map((m) => ({
        createTime: m.createTime!,
        thumbnailUrl: m.thumbnailUrl ?? m.googleUrl ?? "",
        isVideo: m.mediaFormat === "VIDEO",
      })),
    }
  }).catch((e) => {
    report.errors.push({ section: "photos", message: String(e instanceof Error ? e.message : e).slice(0, 200) })
  })

  /* ----------------------------- 表示回数 ----------------------------- */
  const insightsTask = withGoogleRead(async (token) => {
    const gmb = createGmbClient(token)
    const startDate = `${months[0]}-01`
    // Google の集計は数日遅れるので、今月分は「きのうまで」を頼む
    const endDate = isPartial ? ymd(new Date(nowJst.getTime() - 86400e3)) : lastDay
    if (endDate < startDate) return
    const data = (await gmb.getInsights(locationName, startDate, endDate)) as {
      multiDailyMetricTimeSeries?: {
        dailyMetricTimeSeries?: {
          dailyMetric?: string
          timeSeries?: {
            datedValues?: { date?: { year?: number; month?: number; day?: number }; value?: string }[]
          }
        }[]
      }[]
    }
    const byMonth: Record<
      string,
      { impressions: number; calls: number; directions: number; websiteClicks: number }
    > = Object.fromEntries(
      months.map((m) => [m, { impressions: 0, calls: 0, directions: 0, websiteClicks: 0 }])
    )
    let lastDataDay: string | null = null
    for (const multi of data.multiDailyMetricTimeSeries ?? []) {
      for (const series of multi.dailyMetricTimeSeries ?? []) {
        const metric = series.dailyMetric ?? ""
        for (const dv of series.timeSeries?.datedValues ?? []) {
          if (!dv.date?.year || !dv.date?.month) continue
          const key = `${dv.date.year}-${String(dv.date.month).padStart(2, "0")}`
          const b = byMonth[key]
          if (!b) continue
          const v = Number(dv.value ?? 0) || 0
          if (v > 0 && dv.date.day) {
            const day = `${key}-${String(dv.date.day).padStart(2, "0")}`
            if (!lastDataDay || day > lastDataDay) lastDataDay = day
          }
          if (metric.startsWith("BUSINESS_IMPRESSIONS_")) b.impressions += v
          else if (metric === "CALL_CLICKS") b.calls += v
          else if (metric === "BUSINESS_DIRECTION_REQUESTS") b.directions += v
          else if (metric === "WEBSITE_CLICKS") b.websiteClicks += v
        }
      }
    }
    report.insights = { byMonth, lastDataDay }
  }).catch((e) => {
    report.errors.push({ section: "insights", message: String(e instanceof Error ? e.message : e).slice(0, 200) })
  })

  /* ----------------------------- クチコミ ----------------------------- */
  const reviewsTask = withGoogleRead(async (token) => {
    const gmb = createGmbClient(token)
    const fetched: GReview[] = []
    let total = 0
    let average = 0
    let pageToken: string | undefined
    let pages = 0
    // 新しく更新された順に返ってくる。6か月より前まで読めたら十分
    do {
      const res = (await gmb.listReviews(acc, locationName, 50, pageToken)) as {
        reviews?: GReview[]
        averageRating?: number
        totalReviewCount?: number
        nextPageToken?: string
      }
      if (pages === 0) {
        total = res.totalReviewCount ?? 0
        average = res.averageRating ?? 0
      }
      const list = res.reviews ?? []
      fetched.push(...list)
      pageToken = res.nextPageToken
      pages++
      const oldest = list[list.length - 1]?.updateTime
      if (oldest && new Date(oldest) < windowStart) break
    } while (pageToken && pages < 40)

    const withTime = fetched.filter((r) => r.createTime)
    const sumNow = average * total
    const byMonth: Record<string, ReviewMonth> = {}
    for (const m of months) {
      const b = monthBounds(m)
      // この月の終わりより後に書かれたクチコミを、今の合計から引いて当時の数字に戻す
      const later = withTime.filter((r) => new Date(r.createTime!) >= b.end)
      const totalAt = Math.max(0, total - later.length)
      const sumAt = sumNow - later.reduce((a, r) => a + (STAR[r.starRating ?? ""] ?? 0), 0)
      const avgAt = totalAt > 0 ? Math.min(5, Math.max(1, sumAt / totalAt)) : null
      const added = withTime.filter((r) => {
        const t = new Date(r.createTime!)
        return t >= b.start && t < b.end
      }).length
      byMonth[m] = { total: totalAt, average: avgAt, added }
    }
    const inMonth = withTime.filter((r) => {
      const t = new Date(r.createTime!)
      return t >= start && t < end
    })
    report.reviews = {
      total: byMonth[month].total,
      average: byMonth[month].average,
      added: inMonth.length,
      prevAdded: byMonth[prev]?.added ?? 0,
      repliedInMonth: inMonth.filter((r) => r.reviewReply?.comment?.trim()).length,
      byMonth,
      // お客様に渡す資料なので、載せるのは★4以上でコメントのあるものだけ
      voices: inMonth
        .filter((r) => (STAR[r.starRating ?? ""] ?? 0) >= 4 && originalComment(r.comment).length > 0)
        .sort((a, b) => originalComment(b.comment).length - originalComment(a.comment).length)
        .slice(0, 3)
        .map((r) => ({
          star: STAR[r.starRating ?? ""] ?? 0,
          reviewer: r.reviewer?.displayName ?? null,
          comment: originalComment(r.comment).slice(0, 180),
          createTime: r.createTime!,
        })),
    }
  }).catch((e) => {
    report.errors.push({ section: "reviews", message: String(e instanceof Error ? e.message : e).slice(0, 200) })
  })

  await Promise.all([postsTask, photosTask, insightsTask, reviewsTask])
  return report
}
