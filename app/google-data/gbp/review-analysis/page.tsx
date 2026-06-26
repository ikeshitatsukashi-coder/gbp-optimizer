"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
} from "recharts"
import { Star, Loader2, Info } from "lucide-react"
import { useGbp } from "@/lib/store"

interface Analytics {
  kpi: {
    total: number
    avgRating: number
    withReply: number
    replyRate: number
  }
  ratingDistribution: { stars: number; count: number }[]
  monthlyTrend: { month: string; count: number; avg: number }[]
  keywords: { word: string; count: number }[]
}

export default function ReviewAnalysisPage() {
  const { locationName } = useGbp()
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<"store" | "all">("store")

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (scope === "store" && locationName) {
        params.set("locationName", locationName)
      }
      const res = await fetch(`/api/reviews/analytics?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [scope, locationName])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">クチコミ分析</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setScope("store")}
            disabled={!locationName}
            className={`px-3 py-1.5 text-xs rounded border ${
              scope === "store"
                ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                : "bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            }`}
          >
            選択店舗のみ
          </button>
          <button
            onClick={() => setScope("all")}
            className={`px-3 py-1.5 text-xs rounded border ${
              scope === "all"
                ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                : "bg-white border-gray-300 hover:bg-gray-50"
            }`}
          >
            全店舗集計
          </button>
        </div>
      </div>

      {scope === "store" && !locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <Info className="h-4 w-4" /> 画面上部の店舗セレクタで店舗を選択してください。または「全店舗集計」を選択。
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> 分析中…
        </div>
      )}

      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-sm text-muted-foreground mb-2">平均評価</p>
                <div className="flex items-center justify-center gap-1 mb-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${
                        i < Math.round(data.kpi.avgRating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-3xl font-bold">{data.kpi.avgRating.toFixed(2)}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-sm text-muted-foreground mb-2">総クチコミ数</p>
                <span className="text-3xl font-bold">{data.kpi.total.toLocaleString()}件</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-sm text-muted-foreground mb-2">返信率</p>
                <span className="text-3xl font-bold">{data.kpi.replyRate}%</span>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.kpi.withReply.toLocaleString()} / {data.kpi.total.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-bold text-base mb-4">評価分布</h3>
                <div className="space-y-2">
                  {data.ratingDistribution.map((r) => {
                    const total = data.ratingDistribution.reduce((s, x) => s + x.count, 0)
                    const pct = total > 0 ? (r.count / total) * 100 : 0
                    return (
                      <div key={r.stars} className="flex items-center gap-2">
                        <span className="text-sm w-8 text-right">{r.stars}★</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-4">
                          <div
                            className="bg-yellow-400 rounded-full h-4"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm w-12 text-right">{r.count.toLocaleString()}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="font-bold text-base mb-4">月別クチコミ件数</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-bold text-base mb-4">月別平均評価推移</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="avg"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="font-bold text-base mb-4">よく使われる単語</h3>
                <div className="flex flex-wrap gap-2">
                  {data.keywords.length === 0 ? (
                    <span className="text-sm text-muted-foreground">単語データなし</span>
                  ) : (
                    data.keywords.map((kw) => {
                      const max = data.keywords[0]?.count ?? 1
                      const size = 12 + Math.round((kw.count / max) * 12)
                      return (
                        <span
                          key={kw.word}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full"
                          style={{ fontSize: `${size}px` }}
                          title={`${kw.count}件`}
                        >
                          {kw.word} ({kw.count})
                        </span>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            分析対象: {scope === "store" ? "選択店舗" : "全店舗"} / クチコミは reviews_archive (現存分のみ) から集計
          </p>
        </>
      )}
    </div>
  )
}
