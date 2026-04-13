"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"
import type { RankData } from "@/types"

export function RankChart({ data }: { data: RankData[] }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base">Google順位チャート</h3>
          <button className="text-xs border px-3 py-1 rounded hover:bg-gray-50">
            詳細
          </button>
        </div>
        <div className="flex gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-blue-800 inline-block" />
            青山　MEO
          </span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis
                reversed
                domain={[1, 50]}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}位`}
              />
              <Line
                type="monotone"
                dataKey="rank"
                stroke="#1e3a5f"
                strokeWidth={2}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {data.every((d) => d.rank === null) && (
          <div className="text-center text-xs text-muted-foreground mt-2">
            青山　MEO: 圏外
          </div>
        )}
      </CardContent>
    </Card>
  )
}
