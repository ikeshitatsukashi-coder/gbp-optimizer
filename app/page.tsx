"use client"

import { useSession } from "next-auth/react"
import { useGbp } from "@/lib/store"
import { useGbpData } from "@/lib/use-gbp-data"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ActionChart } from "@/components/dashboard/action-chart"
import { RankChart } from "@/components/dashboard/rank-chart"
import { ReviewSummaryCard } from "@/components/dashboard/review-summary"
import {
  kpiData as mockKpi,
  actionData as mockAction,
  rankData as mockRank,
  reviewSummary as mockReviewSummary,
} from "@/lib/mock-data"
import {
  transformInsightsToKpi,
  transformInsightsToActionChart,
} from "@/lib/insights-transform"

// Generate dynamic 30-day date range
function getDateRange() {
  const end = new Date()
  end.setDate(end.getDate() - 1) // Yesterday (data lag)
  const start = new Date(end)
  start.setDate(start.getDate() - 29)

  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return { iso: `${y}-${m}-${day}`, display: `${y}/${m}/${day}` }
  }

  return { start: fmt(start), end: fmt(end) }
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const { locationName } = useGbp()

  const dateRange = getDateRange()

  // Fetch insights data from API
  const { data: insightsData, loading: insightsLoading, error: insightsError } = useGbpData<
    Record<string, unknown> | null
  >("insights", null, {
    startDate: dateRange.start.iso,
    endDate: dateRange.end.iso,
  })

  // Fetch reviews from API
  const { data: reviewsData, loading: reviewsLoading } = useGbpData<
    Record<string, unknown> | null
  >("reviews", null)

  // Transform API data or fall back to mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realKpi = transformInsightsToKpi(insightsData as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realAction = transformInsightsToActionChart(insightsData as any)

  const usingRealData = !!session && !!locationName && !!realKpi

  const kpiData = realKpi || mockKpi
  const actionData = realAction || mockAction
  const rankData = mockRank // Ranking API is separate

  // Reviews summary
  let totalReviewCount = mockReviewSummary.totalCount
  let avgRatingFromReviews = 0
  if (reviewsData && Array.isArray((reviewsData as { reviews?: unknown[] }).reviews)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviews = (reviewsData as any).reviews
    totalReviewCount =
      (reviewsData as { totalReviewCount?: number }).totalReviewCount ?? reviews.length
    if (reviews.length > 0) {
      const ratings = reviews
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => {
          const s = r.starRating
          if (!s) return 0
          return ["ONE", "TWO", "THREE", "FOUR", "FIVE"].indexOf(
            s.replace("STAR_RATING_", "")
          ) + 1
        })
        .filter((n: number) => n > 0)
      if (ratings.length > 0) {
        avgRatingFromReviews =
          ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
      }
    }
  }

  const reviewSummary = usingRealData
    ? {
        totalCount: totalReviewCount,
        monthlyCount: 0,
        latestDate: dateRange.end.display.replace(/-/g, "/"),
      }
    : mockReviewSummary

  const isConnected = usingRealData

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              API接続中
            </span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">
              モックデータ
            </span>
          )}
          <select className="border rounded px-3 py-1.5 text-sm">
            <option>Google</option>
          </select>
        </div>
      </div>

      {!session && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 mb-6">
          右上の「Googleでログイン」からログインすると、GBPのリアルデータが表示されます。
        </div>
      )}

      {session && !locationName && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800 mb-6">
          GBPアカウント・ロケーション情報を取得中です...
        </div>
      )}

      {(insightsLoading || reviewsLoading) && (
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-600 mb-6">
          データを取得中...
        </div>
      )}

      {insightsError && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800 mb-6">
          インサイトデータの取得に失敗しました: {insightsError}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {kpiData.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-6">
        集計期間：{dateRange.start.display} — {dateRange.end.display}
        {avgRatingFromReviews > 0 && ` | 平均評価: ${avgRatingFromReviews.toFixed(1)}★`}
      </p>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ActionChart data={actionData} />
        <RankChart data={rankData} />
      </div>

      {/* Review Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReviewSummaryCard data={reviewSummary} />
      </div>
    </div>
  )
}
