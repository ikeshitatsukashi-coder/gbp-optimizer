"use client"

import { KpiCard } from "@/components/dashboard/kpi-card"
import { ActionChart } from "@/components/dashboard/action-chart"
import { RankChart } from "@/components/dashboard/rank-chart"
import { ReviewSummaryCard } from "@/components/dashboard/review-summary"
import {
  kpiData,
  actionData,
  rankData,
  reviewSummary,
  aggregationPeriod,
} from "@/lib/mock-data"

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <select className="border rounded px-3 py-1.5 text-sm">
          <option>Google</option>
        </select>
      </div>

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
