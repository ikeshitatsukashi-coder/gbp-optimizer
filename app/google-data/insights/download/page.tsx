"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Download, Info } from "lucide-react"
import { useGbp } from "@/lib/store"

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

const METRIC_LABELS: Record<string, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "デスクトップ・マップ表示",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "デスクトップ・検索表示",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "モバイル・マップ表示",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "モバイル・検索表示",
  BUSINESS_DIRECTION_REQUESTS: "ルート検索回数",
  CALL_CLICKS: "電話タップ回数",
  WEBSITE_CLICKS: "ウェブサイト クリック",
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function dateKey(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
}

function buildCsv(data: InsightsResponse, storeName: string): string {
  const allDates = new Set<string>()
  const metricMap: Map<string, Map<string, number>> = new Map()

  for (const group of data.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      const metric = series.dailyMetric
      const map = new Map<string, number>()
      for (const point of series.timeSeries?.datedValues ?? []) {
        const k = dateKey(point.date)
        allDates.add(k)
        map.set(k, Number(point.value || 0))
      }
      metricMap.set(metric, map)
    }
  }

  const dates = Array.from(allDates).sort()
  const metrics = Array.from(metricMap.keys())
  const header = ["日付", ...metrics.map((m) => METRIC_LABELS[m] ?? m)]
  const lines = [header.join(",")]
  for (const date of dates) {
    const row = [date, ...metrics.map((m) => String(metricMap.get(m)?.get(date) ?? 0))]
    lines.push(row.join(","))
  }
  const meta = `# 店舗: ${storeName}\n# エクスポート: ${new Date().toISOString()}\n`
  return "﻿" + meta + lines.join("\n")
}

export default function InsightsDownloadPage() {
  const { locationName, locations } = useGbp()
  const [days, setDays] = useState<7 | 30 | 90 | 180 | 365 | 520>(30)
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dateRange = useMemo(() => {
    const end = new Date()
    end.setDate(end.getDate() - 1)
    const start = new Date(end)
    start.setDate(start.getDate() - days + 1)
    return { startDate: ymd(start), endDate: ymd(end) }
  }, [days])

  const storeTitle = useMemo(() => {
    if (!locationName) return ""
    return locations.find((l) => l.name === locationName)?.title ?? locationName
  }, [locationName, locations])

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
      setData(j)
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

  const handleDownload = () => {
    if (!data) return
    const csv = buildCsv(data, storeTitle)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const safe = storeTitle.replace(/[\\/:*?"<>|]/g, "_")
    a.download = `insights_${safe}_${dateRange.startDate}_${dateRange.endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">インサイトデータ ダウンロード</h1>

      {!locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <Info className="h-4 w-4" /> 画面上部の店舗セレクタで店舗を選択してください。
          </p>
        </Card>
      )}

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">店舗</label>
            <div className="h-8 px-2 text-sm border rounded bg-gray-50 flex items-center">
              {storeTitle || "未選択"}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">期間</label>
            <div className="flex gap-2">
              {([7, 30, 90, 180, 365, 520] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setDays(n)}
                  className={`px-3 py-1.5 text-xs rounded border ${
                    days === n
                      ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                      : "bg-white border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  直近{n}日
                </button>
              ))}
            </div>
          </div>
          <div>
            <Button onClick={handleDownload} disabled={!data || loading}>
              <Download className="h-4 w-4" /> CSV ダウンロード
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-3">
          期間: {dateRange.startDate} 〜 {dateRange.endDate}
        </div>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> インサイト取得中…
        </div>
      )}

      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      {data && !loading && (
        <Card className="p-4">
          <h2 className="text-sm font-bold mb-2">含まれる指標</h2>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            {Object.entries(METRIC_LABELS).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">{v}</span>{" "}
                <span className="text-xs">({k})</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-3">
            CSV は日付列＋上記7指標の日次データ。Excel/Sheets でそのまま開けます。
          </p>
        </Card>
      )}
    </div>
  )
}
