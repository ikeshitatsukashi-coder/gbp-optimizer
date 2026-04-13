"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { ReviewSummary as ReviewSummaryType } from "@/types"

export function ReviewSummaryCard({
  data,
}: {
  data: ReviewSummaryType
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base">クチコミ（Google）</h3>
          <button className="text-xs border px-3 py-1 rounded hover:bg-gray-50">
            詳細
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{data.totalCount}件</span>
            <span className="text-sm text-muted-foreground">
              総クチコミ件数
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold">{data.monthlyCount}</span>
            <span className="text-sm text-muted-foreground">
              当月{data.monthlyCount}件のクチコミ
            </span>
          </div>
        </div>
        <hr className="my-4" />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">最新のクチコミ</span>
          <span className="text-blue-500 text-xs">
            新しいクチコミが0件あります。（{data.latestDate}）
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
