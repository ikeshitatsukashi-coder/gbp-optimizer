"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts"
import { insightData } from "@/lib/mock-data"

const COLORS = ["#3b82f6", "#f59e0b", "#10b981"]

export default function InsightsPage() {
  const data = insightData
  const searchData = [
    { name: "直接検索", value: data.searchDirect },
    { name: "間接検索", value: data.searchDiscovery },
    { name: "ブランド検索", value: data.searchBranded },
  ]
  const deviceData = [
    { name: "デスクトップ", value: data.deviceDesktop },
    { name: "モバイル", value: data.deviceMobile },
    { name: "タブレット", value: data.deviceTablet },
  ]

  const combinedViews = data.totalViews.map((d, i) => ({
    date: d.date,
    search: data.searchViews[i]?.value ?? 0,
    map: data.mapViews[i]?.value ?? 0,
    total: d.value,
  }))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">インサイト情報</h1>

      {/* Views Chart */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4">表示回数の推移</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={combinedViews}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="search" name="検索経由" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="map" name="マップ経由" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total" name="合計" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Search Type */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold text-base mb-4">検索タイプ別</h3>
            <div className="h-48 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={searchData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {searchData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Device Type */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold text-base mb-4">デバイス別</h3>
            <div className="h-48 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {deviceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
