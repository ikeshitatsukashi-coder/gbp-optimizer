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
  aggregationPeriod,
} from "@/lib/mock-data"

export default function DashboardPage() {
  const { data: session } = useSession()
  const { locationName } = useGbp()

  // Fetch insights data from API (falls back to mock)
  const { data: insightsData, loading: insightsLoading } = useGbpData(
    "insights",
    null,
    {
      startDate: "2026-03-14",
      endDate: "2026-04-13",
    }
  )

  // Fetch reviews from API (falls back to mock)
  const { data: reviewsData, loading: reviewsLoading } = useGbpData<Record<string, unknown> | null>(
    "reviews",
    null
  )

  // Transform API data or use mock
  const kpiData = mockKpi // Will be replaced with real insights when available
  const actionData = mockAction
  const rankData = mockRank
  const reviewSummary = reviewsData
    ? {
        totalCount: (reviewsData.totalReviewCount as number) ?? mockReviewSummary.totalCount,
        monthlyCount: mockReviewSummary.monthlyCount,
        latestDate: mockReviewSummary.latestDate,
      }
    : mockReviewSummary

  const isConnected = !!session && !!locationName

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
          右上の「Googleでログイン」からログインすると、GBPのリアルデータが表示されます。現在はモックデータを表示中です。
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

      <p className="text-sm text-orange-500 mb-6">
        本画面では店舗様が利用していない機能が存在していますので、一部のデータが表示されません。ご注意ください。
      </p>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {kpiData.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-6">
        集計期間：{aggregationPeriod.start} — {aggregationPeriod.end}
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
