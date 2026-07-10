import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAccessToken } from "@/lib/get-session"
import { sql } from "drizzle-orm"
import { createGbpClient, createGmbClient } from "@/lib/gbp-client"
import { getAccountNameForLocation } from "@/lib/services/get-store-account"
import { errorResponse } from "@/lib/api-helpers"
import { computeQuickDiagnosis } from "@/lib/services/quick-diagnosis"

/**
 * GET /api/meo/diagnosis
 *   （パラメータなし）… 全 active 店舗の簡易スコア（DB のみ・高速）
 *   ?locationName=...  … 1店舗の詳細診断（v1/v4 API を実際に呼ぶ・低速）
 *
 * 読み取り専用の分析機能。GBP への書き込みは一切行わない。
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const locationName = url.searchParams.get("locationName")

  try {
    if (locationName) {
      return await deepDiagnosis(accessToken, locationName)
    }
    return await quickDiagnosisAll()
  } catch (e) {
    return errorResponse("Failed to run diagnosis", e)
  }
}

/* -------------------------------------------------------------------------- */
/*             全店舗クイック診断（共通サービスに委譲）                         */
/* -------------------------------------------------------------------------- */

async function quickDiagnosisAll() {
  const result = await computeQuickDiagnosis()
  return NextResponse.json({ mode: "quick", ...result })
}

/* -------------------------------------------------------------------------- */
/*            1店舗ディープ診断（v1 location + v4 media/posts を実取得）        */
/* -------------------------------------------------------------------------- */

interface Check {
  id: string
  label: string
  ok: boolean
  points: number
  maxPoints: number
  advice: string
}

async function deepDiagnosis(accessToken: string, locationNameRaw: string) {
  const locationName = locationNameRaw.startsWith("locations/")
    ? locationNameRaw
    : `locations/${locationNameRaw}`

  const accountName = await getAccountNameForLocation(locationName)
  if (!accountName) {
    return NextResponse.json(
      { error: "Store not found in DB. Sync stores first." },
      { status: 404 }
    )
  }

  const gbp = createGbpClient(accessToken)
  const gmb = createGmbClient(accessToken)

  // 並列取得（失敗しても他は継続）
  const [locationRes, mediaRes, postsRes, reviewStatsRes] = await Promise.allSettled([
    gbp.getLocation(locationName),
    gmb.listMedia(accountName, locationName),
    gmb.listPosts(accountName, locationName),
    db.execute(sql`
      SELECT
        count(*)::int AS review_count,
        count(*) FILTER (
          WHERE reply_comment IS NOT NULL AND length(trim(reply_comment)) > 0
        )::int AS replied,
        count(*) FILTER (
          WHERE star_rating <= 2
            AND (reply_comment IS NULL OR length(trim(reply_comment)) = 0)
        )::int AS unanswered_low,
        coalesce(avg(star_rating), 0)::text AS avg_rating
      FROM reviews_archive
      WHERE location_name = ${locationName} AND archive_reason = 'current'
    `),
  ])

  interface LocationData {
    title?: string
    profile?: { description?: string }
    websiteUri?: string
    phoneNumbers?: { primaryPhone?: string }
    storefrontAddress?: { addressLines?: string[]; postalCode?: string }
    regularHours?: { periods?: unknown[] }
    categories?: {
      primaryCategory?: { displayName?: string }
      additionalCategories?: unknown[]
    }
  }

  const location: LocationData =
    locationRes.status === "fulfilled" ? (locationRes.value as LocationData) : {}
  const mediaItems =
    mediaRes.status === "fulfilled"
      ? ((mediaRes.value as { mediaItems?: unknown[] }).mediaItems ?? [])
      : []
  const posts =
    postsRes.status === "fulfilled"
      ? ((postsRes.value as { localPosts?: Array<{ createTime?: string }> }).localPosts ?? [])
      : []

  let reviewStats = { review_count: 0, replied: 0, unanswered_low: 0, avg_rating: "0" }
  if (reviewStatsRes.status === "fulfilled") {
    const rs = reviewStatsRes.value
    const list = Array.isArray(rs) ? rs : ((rs as { rows?: unknown[] }).rows ?? [])
    if (list[0]) reviewStats = list[0] as typeof reviewStats
  }

  // 最新投稿からの経過日数
  const lastPostTime = posts
    .map((p) => (p.createTime ? new Date(p.createTime).getTime() : 0))
    .reduce((max, t) => Math.max(max, t), 0)
  const daysSinceLastPost = lastPostTime
    ? Math.floor((Date.now() - lastPostTime) / 86400000)
    : null

  const description = location.profile?.description ?? ""
  const reviewCount = Number(reviewStats.review_count) || 0
  const replied = Number(reviewStats.replied) || 0
  const unansweredLow = Number(reviewStats.unanswered_low) || 0
  const replyRate = reviewCount > 0 ? replied / reviewCount : null
  const photoCount = mediaItems.length

  const checks: Check[] = [
    {
      id: "phone",
      label: "電話番号",
      ok: !!location.phoneNumbers?.primaryPhone,
      points: location.phoneNumbers?.primaryPhone ? 5 : 0,
      maxPoints: 5,
      advice: "電話番号を設定すると「電話」ボタンが表示され、問い合わせ導線が増えます。",
    },
    {
      id: "address",
      label: "住所",
      ok: !!location.storefrontAddress?.addressLines?.length,
      points: location.storefrontAddress?.addressLines?.length ? 5 : 0,
      maxPoints: 5,
      advice: "住所が正確だとローカル検索・経路検索での露出が向上します。",
    },
    {
      id: "website",
      label: "ウェブサイト URL",
      ok: !!location.websiteUri,
      points: location.websiteUri ? 5 : 0,
      maxPoints: 5,
      advice: "ウェブサイトを設定するとプロフィールから公式サイトへ誘導できます。",
    },
    {
      id: "hours",
      label: "営業時間",
      ok: !!location.regularHours?.periods?.length,
      points: location.regularHours?.periods?.length ? 10 : 0,
      maxPoints: 10,
      advice: "営業時間は検索結果の「営業中/営業時間外」表示に直結します。必ず設定してください。",
    },
    {
      id: "description",
      label: "ビジネス説明文（100文字以上）",
      ok: description.length >= 100,
      points: description.length >= 100 ? 10 : description.length > 0 ? 5 : 0,
      maxPoints: 10,
      advice: "説明文はキーワードを含めて 100〜750 文字で書くと検索一致率が上がります。",
    },
    {
      id: "category",
      label: "メインカテゴリ",
      ok: !!location.categories?.primaryCategory?.displayName,
      points: location.categories?.primaryCategory?.displayName ? 5 : 0,
      maxPoints: 5,
      advice: "メインカテゴリは検索クエリとのマッチングの最重要要素です。",
    },
    {
      id: "additional_categories",
      label: "追加カテゴリ（1件以上）",
      ok: (location.categories?.additionalCategories?.length ?? 0) >= 1,
      points: (location.categories?.additionalCategories?.length ?? 0) >= 1 ? 5 : 0,
      maxPoints: 5,
      advice: "追加カテゴリを設定すると関連検索での表示機会が増えます。",
    },
    {
      id: "photos",
      label: `写真（現在 ${photoCount} 枚）`,
      ok: photoCount >= 10,
      points: photoCount >= 20 ? 15 : photoCount >= 10 ? 10 : photoCount >= 3 ? 5 : 0,
      maxPoints: 15,
      advice: "写真20枚以上が目安。外観・内観・商品・スタッフをバランスよく掲載しましょう。",
    },
    {
      id: "post_recency",
      label:
        daysSinceLastPost === null
          ? "投稿（投稿履歴なし）"
          : `投稿（最終投稿から ${daysSinceLastPost} 日）`,
      ok: daysSinceLastPost !== null && daysSinceLastPost <= 30,
      points:
        daysSinceLastPost === null
          ? 0
          : daysSinceLastPost <= 30
            ? 15
            : daysSinceLastPost <= 90
              ? 8
              : 0,
      maxPoints: 15,
      advice: "月1回以上の投稿があるプロフィールは活性度が高いと評価されます。",
    },
    {
      id: "reply_rate",
      label:
        replyRate === null
          ? "クチコミ返信率（クチコミなし）"
          : `クチコミ返信率 ${Math.round(replyRate * 100)}%`,
      ok: replyRate !== null && replyRate >= 0.8,
      points:
        replyRate === null ? 5 : replyRate >= 0.8 ? 10 : Math.round(replyRate * 10),
      maxPoints: 10,
      advice: "返信率 80% 以上を目標に。自動返信バッチの活用で効率化できます。",
    },
    {
      id: "low_reviews",
      label:
        unansweredLow === 0
          ? "未対応の低評価クチコミなし"
          : `未対応の低評価クチコミ ${unansweredLow} 件`,
      ok: unansweredLow === 0,
      points: unansweredLow === 0 ? 10 : unansweredLow <= 2 ? 5 : 0,
      maxPoints: 10,
      advice: "低評価には誠実な返信を。ポリシー違反が疑われる場合は削除申請バッチを利用。",
    },
    {
      id: "rating",
      label: `平均評価 ${parseFloat(reviewStats.avg_rating).toFixed(1)}`,
      ok: parseFloat(reviewStats.avg_rating) >= 4.0,
      points: parseFloat(reviewStats.avg_rating) >= 4.0 ? 5 : 0,
      maxPoints: 5,
      advice: "平均 4.0 以上が信頼の目安。好意的なクチコミの獲得施策も検討しましょう。",
    },
  ]

  const score = checks.reduce((s, c) => s + c.points, 0)
  const maxScore = checks.reduce((s, c) => s + c.maxPoints, 0)

  return NextResponse.json({
    mode: "deep",
    locationName,
    storeName: location.title ?? "",
    score: Math.round((score / maxScore) * 100),
    rawScore: score,
    maxScore,
    checks,
    apiErrors: {
      location: locationRes.status === "rejected" ? String(locationRes.reason).slice(0, 200) : null,
      media: mediaRes.status === "rejected" ? String(mediaRes.reason).slice(0, 200) : null,
      posts: postsRes.status === "rejected" ? String(postsRes.reason).slice(0, 200) : null,
    },
  })
}
