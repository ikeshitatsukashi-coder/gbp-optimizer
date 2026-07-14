"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { Loader2, Star, MessageSquare, TrendingUp, ClipboardCheck } from "lucide-react"

/* -------------------------------------------------------------------------- */
/*  お客様向け閲覧専用レポートページ（認証なし・読み取りのみ）                   */
/* -------------------------------------------------------------------------- */

interface DiagnosisStore {
  locationName: string
  storeName: string
  score: number
  reviewCount: number
  replyRate: number | null
  avgRating: number
  issues: string[]
}
interface ShareData {
  name: string
  scopeType: string
  sections: string[]
  stores: { locationName: string; title: string }[]
  generatedAt: string
  diagnosis?: { stores: DiagnosisStore[]; avgScore: number }
  reviews?: {
    total: number
    avgRating: string
    replied: number
    distribution: Record<string, number>
    recent: {
      reviewer: string | null
      starRating: number | null
      comment: string | null
      createTime: string | null
      replied: boolean
      storeTitle: string
    }[]
  }
  insights?: {
    capturedAt: string
    months: string[]
    stores: {
      locationName: string
      title: string
      monthly: Record<
        string,
        { impressions: number; calls: number; directions: number; websiteClicks: number }
      >
    }[]
  } | null
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600"
  if (score >= 60) return "text-amber-500"
  return "text-red-500"
}

export default function SharePage() {
  const params = useParams<{ token: string }>()
  const [data, setData] = useState<ShareData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.token) return
    fetch(`/api/public/share/${params.token}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error === "Not found" ? "ページが見つかりません" : j.error)
        setData(j)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [params.token])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow p-8 text-center text-sm text-gray-600 max-w-sm">
          {error}
          <p className="text-xs text-gray-400 mt-2">
            リンクが無効になっているか、URLが間違っている可能性があります。
          </p>
        </div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // インサイト月次合計
  const insightTotals =
    data.insights?.months.map((m) => {
      let impressions = 0,
        calls = 0,
        directions = 0,
        websiteClicks = 0
      for (const s of data.insights?.stores ?? []) {
        const b = s.monthly[m]
        if (!b) continue
        impressions += b.impressions
        calls += b.calls
        directions += b.directions
        websiteClicks += b.websiteClicks
      }
      return { month: m.replace("-", "/"), impressions, calls, directions, websiteClicks }
    }) ?? []

  const dist = data.reviews?.distribution ?? {}
  const distMax = Math.max(1, ...Object.values(dist).map((v) => Number(v)))

  return (
    <div className="min-h-screen bg-gray-100 pb-12">
      {/* ヘッダー */}
      <div className="bg-[#1d3a5f] text-white">
        <div className="max-w-4xl mx-auto px-5 py-8">
          <p className="text-xs opacity-70 mb-1">Googleビジネスプロフィール レポート</p>
          <h1 className="text-2xl font-bold">{data.name}</h1>
          <p className="text-xs opacity-70 mt-2">
            対象: {data.stores.length}店舗 ／ 表示日時:{" "}
            {new Date(data.generatedAt).toLocaleString("ja-JP")}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 space-y-6 -mt-4">
        {/* 診断スコア */}
        {data.diagnosis && (
          <section className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-[#1d3a5f]" />
              <h2 className="font-bold">プロフィール最適化スコア</h2>
            </div>
            <div className="px-5 py-5">
              <div className="flex items-baseline gap-2 mb-4">
                <span className={`text-5xl font-bold ${scoreColor(data.diagnosis.avgScore)}`}>
                  {data.diagnosis.avgScore}
                </span>
                <span className="text-sm text-gray-500">/ 100点（平均）</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="text-left py-2 font-medium">店舗</th>
                      <th className="text-right py-2 font-medium w-20">スコア</th>
                      <th className="text-right py-2 font-medium w-24">クチコミ数</th>
                      <th className="text-right py-2 font-medium w-20">評価</th>
                      <th className="text-left py-2 pl-4 font-medium">主な改善ポイント</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.diagnosis.stores.map((s) => (
                      <tr key={s.locationName} className="border-b last:border-b-0">
                        <td className="py-2 pr-2">{s.storeName}</td>
                        <td className={`py-2 text-right font-bold ${scoreColor(s.score)}`}>
                          {s.score}
                        </td>
                        <td className="py-2 text-right">{s.reviewCount}</td>
                        <td className="py-2 text-right">
                          {s.avgRating ? Number(s.avgRating).toFixed(1) : "—"}
                        </td>
                        <td className="py-2 pl-4 text-xs text-gray-500">
                          {s.issues.length > 0 ? s.issues.slice(0, 2).join("、") : "良好です"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* クチコミ */}
        {data.reviews && (
          <section className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[#1d3a5f]" />
              <h2 className="font-bold">クチコミ</h2>
            </div>
            <div className="px-5 py-5">
              <div className="flex flex-wrap gap-8 items-center mb-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-amber-500">
                    {Number(data.reviews.avgRating).toFixed(1)}
                  </div>
                  <div className="flex justify-center mt-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-4 w-4 ${
                          n <= Math.round(Number(data.reviews?.avgRating))
                            ? "text-amber-400 fill-amber-400"
                            : "text-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    全{data.reviews.total}件 ／ 返信済み{data.reviews.replied}件
                  </p>
                </div>
                <div className="flex-1 min-w-52 max-w-xs space-y-1">
                  {[5, 4, 3, 2, 1].map((star) => (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-6 text-right">{star}★</span>
                      <div className="flex-1 bg-gray-100 rounded h-2.5 overflow-hidden">
                        <div
                          className="bg-amber-400 h-full"
                          style={{
                            width: `${(Number(dist[star] ?? 0) / distMax) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-10 text-gray-500">{dist[star] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs font-bold text-gray-500 mb-2">最新のクチコミ</p>
              <div className="space-y-3">
                {data.reviews.recent.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">クチコミはまだありません</p>
                )}
                {data.reviews.recent.map((r, i) => (
                  <div key={i} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`h-3.5 w-3.5 ${
                              r.starRating && n <= r.starRating
                                ? "text-amber-400 fill-amber-400"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </span>
                      <span className="text-xs text-gray-500">
                        {r.reviewer ?? "匿名"} ・ {r.storeTitle}
                        {r.createTime &&
                          ` ・ ${new Date(r.createTime).toLocaleDateString("ja-JP")}`}
                      </span>
                      {r.replied && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                          返信済み
                        </span>
                      )}
                    </div>
                    {r.comment && (
                      <p className="text-sm mt-1.5 whitespace-pre-wrap">{r.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* インサイト */}
        {data.sections.includes("insights") && (
          <section className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#1d3a5f]" />
              <h2 className="font-bold">インサイト（表示回数・アクション）</h2>
              {data.insights?.capturedAt && (
                <span className="text-xs text-gray-400 ml-auto">
                  {new Date(data.insights.capturedAt).toLocaleDateString("ja-JP")} 時点
                </span>
              )}
            </div>
            <div className="px-5 py-5">
              {!data.insights || insightTotals.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  インサイトデータはまだ取得されていません
                </p>
              ) : (
                <>
                  <div className="h-56 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={insightTotals}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis fontSize={11} width={48} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="impressions"
                          name="表示回数"
                          stroke="#1d3a5f"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b">
                          <th className="text-left py-2 font-medium">月</th>
                          <th className="text-right py-2 font-medium">表示回数</th>
                          <th className="text-right py-2 font-medium">電話</th>
                          <th className="text-right py-2 font-medium">ルート検索</th>
                          <th className="text-right py-2 font-medium">サイトクリック</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insightTotals.map((t) => (
                          <tr key={t.month} className="border-b last:border-b-0">
                            <td className="py-2">{t.month}</td>
                            <td className="py-2 text-right">{t.impressions.toLocaleString()}</td>
                            <td className="py-2 text-right">{t.calls.toLocaleString()}</td>
                            <td className="py-2 text-right">{t.directions.toLocaleString()}</td>
                            <td className="py-2 text-right">
                              {t.websiteClicks.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        <p className="text-center text-xs text-gray-400 pt-2">
          このページは閲覧専用です。データに関するお問い合わせは担当者までご連絡ください。
        </p>
      </div>
    </div>
  )
}
