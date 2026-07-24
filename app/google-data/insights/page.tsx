"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { Loader2, Info } from "lucide-react"
import { useGbp } from "@/lib/store"
import { transformInsightsToActionChart } from "@/lib/insights-transform"

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#a855f7"]

interface TimeSeriesPoint {
  date: { year: number; month: number; day: number }
  value: string | number
}

interface MetricSeries {
  dailyMetric: string
  timeSeries: { datedValues?: TimeSeriesPoint[] }
}

interface InsightsResponse {
  multiDailyMetricTimeSeries?: Array<{
    dailyMetricTimeSeries?: MetricSeries[]
  }>
}

function getMetricSeries(data: InsightsResponse | null, metricName: string): TimeSeriesPoint[] {
  if (!data?.multiDailyMetricTimeSeries) return []
  for (const group of data.multiDailyMetricTimeSeries) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      if (series.dailyMetric === metricName) {
        return series.timeSeries?.datedValues ?? []
      }
    }
  }
  return []
}

function formatDate(d: { year: number; month: number; day: number }): string {
  return `${d.month}/${d.day}`
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function sumValues(points: TimeSeriesPoint[]): number {
  return points.reduce((s, p) => s + Number(p.value || 0), 0)
}

export default function InsightsPage() {
  const { locationName } = useGbp()
  // Google Business Profile Performance API は最大18ヶ月まで遡れる
  const [days, setDays] = useState<7 | 30 | 90 | 180 | 365 | 540>(30)
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dateRange = useMemo(() => {
    const end = new Date()
    end.setDate(end.getDate() - 1) // 昨日まで（当日データは欠落しやすい）
    const start = new Date(end)
    start.setDate(start.getDate() - days + 1)
    return { startDate: ymd(start), endDate: ymd(end) }
  }, [days])

  const fetchData = useCallback(async () => {
    if (!locationName) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        locationName,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      })
      const res = await fetch(`/api/gbp/insights?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setData(j as InsightsResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [locationName, dateRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const desktopMaps = getMetricSeries(data, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS")
  const desktopSearch = getMetricSeries(data, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH")
  const mobileMaps = getMetricSeries(data, "BUSINESS_IMPRESSIONS_MOBILE_MAPS")
  const mobileSearch = getMetricSeries(data, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH")
  const directions = getMetricSeries(data, "BUSINESS_DIRECTION_REQUESTS")
  const calls = getMetricSeries(data, "CALL_CLICKS")
  const website = getMetricSeries(data, "WEBSITE_CLICKS")

  const totalDesktop = sumValues(desktopMaps) + sumValues(desktopSearch)
  const totalMobile = sumValues(mobileMaps) + sumValues(mobileSearch)
  const totalSearchImpressions = sumValues(desktopSearch) + sumValues(mobileSearch)
  const totalMapImpressions = sumValues(desktopMaps) + sumValues(mobileMaps)

  // 表示回数の推移（検索経由 / マップ経由 / 合計）
  const combinedViews = useMemo(() => {
    const len = Math.max(
      desktopMaps.length,
      desktopSearch.length,
      mobileMaps.length,
      mobileSearch.length
    )
    const arr: { date: string; search: number; map: number; total: number }[] = []
    for (let i = 0; i < len; i++) {
      const ref = desktopMaps[i] || desktopSearch[i] || mobileMaps[i] || mobileSearch[i]
      if (!ref) continue
      const search =
        Number(desktopSearch[i]?.value || 0) + Number(mobileSearch[i]?.value || 0)
      const map = Number(desktopMaps[i]?.value || 0) + Number(mobileMaps[i]?.value || 0)
      arr.push({ date: formatDate(ref.date), search, map, total: search + map })
    }
    return arr
  }, [desktopMaps, desktopSearch, mobileMaps, mobileSearch])

  const searchTypeData = [
    { name: "検索経由", value: totalSearchImpressions },
    { name: "マップ経由", value: totalMapImpressions },
  ]
  const deviceData = [
    { name: "デスクトップ", value: totalDesktop },
    { name: "モバイル", value: totalMobile },
  ]

  // アクション内訳（日次）
  const actionChart = transformInsightsToActionChart(data) ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">インサイト情報</h1>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { n: 7, label: "直近7日" },
              { n: 30, label: "直近30日" },
              { n: 90, label: "直近90日" },
              { n: 180, label: "6ヶ月" },
              { n: 365, label: "1年" },
              { n: 540, label: "18ヶ月（最大）" },
            ] as const
          ).map(({ n, label }) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`px-3 py-1.5 text-xs rounded border ${
                days === n
                  ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                  : "bg-white border-gray-300 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <Info className="h-4 w-4" /> 画面上部の店舗セレクタで店舗を選択してください。
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> インサイトを取得中…
        </div>
      )}

      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      {locationName && data && !loading && (
        <>
          {/* KPI Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">合計表示回数</div>
              <div className="text-2xl font-bold mt-1">
                {(totalSearchImpressions + totalMapImpressions).toLocaleString()}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">ウェブサイト クリック</div>
              <div className="text-2xl font-bold mt-1 text-blue-700">
                {sumValues(website).toLocaleString()}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">電話タップ</div>
              <div className="text-2xl font-bold mt-1 text-green-700">
                {sumValues(calls).toLocaleString()}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">ルート検索</div>
              <div className="text-2xl font-bold mt-1 text-amber-700">
                {sumValues(directions).toLocaleString()}
              </div>
            </Card>
          </div>

          {/* Views Chart */}
          <Card className="mb-6">
            <CardContent className="p-5">
              <h3 className="font-bold text-base mb-4">表示回数の推移</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={combinedViews}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(combinedViews.length / 12))} />
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

          {/* Actions Chart */}
          <Card className="mb-6">
            <CardContent className="p-5">
              <h3 className="font-bold text-base mb-4">アクション内訳の推移</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={actionChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(actionChart.length / 12))} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="website" stackId="a" name="ウェブサイト" fill="#3b82f6" />
                    <Bar dataKey="phone" stackId="a" name="電話" fill="#10b981" />
                    <Bar dataKey="route" stackId="a" name="ルート検索" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-bold text-base mb-4">流入タイプ別</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={searchTypeData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={({ name, percent }: { name?: string; percent?: number }) =>
                          `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {searchTypeData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="font-bold text-base mb-4">デバイス別</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deviceData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={({ name, percent }: { name?: string; percent?: number }) =>
                          `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {deviceData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i + 2]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            期間: {dateRange.startDate} 〜 {dateRange.endDate}（Google Business Profile Performance API v1）
          </p>
        </>
      )}
    </div>
  )
}
