"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
  LineChart, Line,
} from "recharts"
import { Star } from "lucide-react"
import { reviewAnalysis } from "@/lib/mock-data"

export default function ReviewAnalysisPage() {
  const data = reviewAnalysis

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">クチコミ分析</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground mb-2">平均評価</p>
            <div className="flex items-center justify-center gap-1 mb-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-5 w-5 ${
                    i < Math.round(data.averageRating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                  }`}
                />
              ))}
            </div>
            <span className="text-3xl font-bold">{data.averageRating}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground mb-2">総クチコミ数</p>
            <span className="text-3xl font-bold">
              {data.ratingDistribution.reduce((s, r) => s + r.count, 0)}件
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground mb-2">返信率</p>
            <span className="text-3xl font-bold">{data.replyRate}%</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Rating Distribution */}
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
                    <span className="text-sm w-8">{r.count}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold text-base mb-4">月別クチコミ推移</h3>
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
        {/* Average Rating Trend */}
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
                  <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Keywords */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold text-base mb-4">よく使われるキーワード</h3>
            <div className="flex flex-wrap gap-2">
              {data.keywords.map((kw) => (
                <span
                  key={kw.word}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm"
                  style={{ fontSize: `${Math.max(12, Math.min(20, kw.count * 4 + 10))}px` }}
                >
                  {kw.word} ({kw.count})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
