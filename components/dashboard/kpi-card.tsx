"use client"

import { Card, CardContent } from "@/components/ui/card"
import { LineChart, Line, ResponsiveContainer } from "recharts"
import { ArrowUp, ArrowDown, HelpCircle } from "lucide-react"
import type { KpiData } from "@/types"

export function KpiCard({ kpi }: { kpi: KpiData }) {
  const isPositive = kpi.change > 0
  const isNegative = kpi.change < 0

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{kpi.label}</span>
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-3xl font-bold">{kpi.value}</span>
          <span className="text-sm text-muted-foreground">{kpi.unit}</span>
          {kpi.changeLabel && (
            <span
              className={`text-xs ml-2 flex items-center gap-0.5 ${
                isPositive
                  ? "text-red-500"
                  : isNegative
                    ? "text-blue-500"
                    : "text-muted-foreground"
              }`}
            >
              {isPositive ? (
                <ArrowUp className="h-3 w-3" />
              ) : isNegative ? (
                <ArrowDown className="h-3 w-3" />
              ) : (
                <span className="text-muted-foreground">→</span>
              )}
              {kpi.changeLabel}
            </span>
          )}
        </div>
        <div className="h-12 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={kpi.data}>
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
