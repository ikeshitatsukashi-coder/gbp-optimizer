"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle, Printer, Star } from "lucide-react"

const COLORS = ["#8b7ce8", "#4a90e2", "#41c9b4", "#f5a623", "#e35d6a", "#94a3b8", "#6366f1"]

/**
 * 印刷（PDF出力）でも確実に描画される純SVGドーナツグラフ。
 * recharts はプリント時のコンテナ幅計算で消えることがあるため使わない。
 */
function DonutChart({ counts }: { counts: { label: string; count: number }[] }) {
  const total = counts.reduce((a, c) => a + c.count, 0)
  const R = 78
  const C = 2 * Math.PI * R
  // 円グラフの各扇形は「手前までの合計」を開始位置にする。
  // 描画中に外側の変数を書き換えないよう、累計は reduce の中だけで持つ
  const segments = counts
    .map((c, i) => ({ ...c, color: COLORS[i % COLORS.length] }))
    .filter((c) => c.count > 0)
    .reduce<{ segs: { color: string; dash: number; offset: number }[]; acc: number }>(
      (state, c) => {
        const frac = c.count / total
        state.segs.push({ color: c.color, dash: frac * C, offset: state.acc * C })
        return { segs: state.segs, acc: state.acc + frac }
      },
      { segs: [], acc: 0 }
    ).segs
  return (
    <svg viewBox="0 0 208 208" className="w-full h-full">
      <circle cx="104" cy="104" r={R} fill="none" stroke="#f1f5f9" strokeWidth="40" />
      {segments.map((s, i) => (
        <circle
          key={i}
          cx="104"
          cy="104"
          r={R}
          fill="none"
          stroke={s.color}
          strokeWidth="40"
          strokeDasharray={`${s.dash} ${C - s.dash}`}
          strokeDashoffset={-s.offset}
          transform="rotate(-90 104 104)"
        />
      ))}
    </svg>
  )
}

interface SurveyOption {
  id: number
  name: string
}
interface QuestionStat {
  title: string
  type: string
  counts: { label: string; count: number }[]
}
interface UserReview {
  id: number
  rating: number | null
  comment: string | null
  createdAt: string
  storeTitle: string
}
interface ResultData {
  survey: { id: number; name: string }
  responseCount: number
  questionStats: QuestionStat[]
  userReviews: UserReview[]
  respondents: { name: string | null; contact: string | null; createdAt: string }[]
  periodDays: number
}
interface StoreOption {
  locationName: string
  title: string
}

export default function SurveyResultsPage() {
  const [surveyList, setSurveyList] = useState<SurveyOption[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [surveyId, setSurveyId] = useState<number | null>(null)
  const [days, setDays] = useState(30)
  const [locationName, setLocationName] = useState<string>("")
  const [data, setData] = useState<ResultData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/surveys")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.surveys ?? []).map((s: { id: number; name: string }) => ({
          id: s.id,
          name: s.name,
        }))
        setSurveyList(list)
        if (list.length > 0) setSurveyId(list[0].id)
      })
      .catch(() => {})
    fetch("/api/stores?status=active&limit=2000")
      .then((r) => r.json())
      .then((j) =>
        setStores(
          (j.stores ?? []).map((s: { locationName: string; title: string }) => ({
            locationName: s.locationName,
            title: s.title,
          }))
        )
      )
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!surveyId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ surveyId: String(surveyId), days: String(days) })
      if (locationName) params.set("locationName", locationName)
      const res = await fetch(`/api/surveys/results?${params}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [surveyId, days, locationName])

  useEffect(() => {
    load()
  }, [load])

  const periodLabel = (() => {
    const to = new Date()
    const from = new Date(Date.now() - days * 86400000)
    const f = (d: Date) =>
      `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
    return `${f(from)} - ${f(to)}`
  })()

  return (
    <div className="space-y-4">
      <style>{`@media print {
        aside, header, .no-print { display: none !important; }
        html, body { height: auto !important; overflow: visible !important; display: block !important; background: white !important; }
        body > div, main { overflow: visible !important; height: auto !important; display: block !important; }
        main { padding: 0 !important; }
      }`}</style>

      <div className="flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <h1 className="text-2xl font-bold">アンケート結果</h1>
          <p className="text-sm text-muted-foreground mt-1">
            配布したアンケートの集計結果を確認できます。「印刷 / PDF保存」でお客様向けレポートを出力できます。
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} disabled={!data}>
          <Printer className="h-4 w-4" /> 印刷 / PDF保存
        </Button>
      </div>

      {/* フィルタ */}
      <Card className="p-4 no-print">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">対象アンケート名</label>
            <select
              value={surveyId ?? ""}
              onChange={(e) => setSurveyId(Number(e.target.value))}
              className="h-9 px-2 text-sm border rounded min-w-56"
            >
              {surveyList.length === 0 && <option value="">アンケートがありません</option>}
              {surveyList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">対象期間</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-9 px-2 text-sm border rounded"
            >
              <option value={30}>1ヶ月</option>
              <option value={90}>3ヶ月</option>
              <option value={180}>6ヶ月</option>
              <option value={365}>1年</option>
              <option value={1095}>3年</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">店舗選択</label>
            <select
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="h-9 px-2 text-sm border rounded min-w-56"
            >
              <option value="">全店舗</option>
              {stores.map((s) => (
                <option key={s.locationName} value={s.locationName}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2 no-print">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground no-print">
          <Loader2 className="h-4 w-4 animate-spin" /> 集計中…
        </div>
      )}

      {data && (
        <div className="bg-white border rounded-lg overflow-hidden print:border-0">
          {/* レポートヘッダー（GMOレポート風） */}
          <div className="bg-[#1a6db5] text-white px-5 py-3 font-bold">
            {locationName
              ? stores.find((s) => s.locationName === locationName)?.title
              : "全店舗"}
          </div>
          <div className="px-5 py-3 text-sm border-b">
            アンケート名： {data.survey.name}　{periodLabel}　（回答 {data.responseCount} 件）
          </div>

          {/* 質問ごとの集計 */}
          {data.questionStats.map((q, qi) => {
            const total = q.counts.reduce((a, c) => a + c.count, 0)
            return (
              <div key={qi} className="px-5 py-6 border-b" style={{ breakInside: "avoid" }}>
                <p className="text-sm font-bold mb-4">質問：{q.title}</p>
                <div className="flex flex-wrap gap-6 items-center">
                  <div className="relative w-52 h-52 shrink-0">
                    <DonutChart counts={q.counts} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xs text-gray-500">すべての回答</span>
                      <span className="text-xl font-bold">{total}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 min-w-44">
                    {q.counts.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span>{c.label}</span>
                        <span className="font-bold ml-1">{c.count}</span>
                        <span className="text-xs text-gray-500">
                          ({total > 0 ? ((c.count / total) * 100).toFixed(1) : "0.0"}%)
                        </span>
                      </div>
                    ))}
                  </div>
                  <table className="text-sm border flex-1 min-w-64">
                    <thead>
                      <tr className="bg-gray-100 text-xs">
                        <th className="text-left px-3 py-1.5 font-medium border-b">回答</th>
                        <th className="text-right px-3 py-1.5 font-medium border-b w-24">
                          回答件数
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.counts.map((c, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="px-3 py-1.5">{c.label}</td>
                          <td className="px-3 py-1.5 text-right">{c.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* ツール内ユーザーレビュー */}
          <div className="px-5 py-6">
            <p className="text-sm font-bold mb-3">
              ユーザーレビュー（Googleレビュー以外の評価が対象）
            </p>
            {data.userReviews.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">
                まだアンケートに回答がありません
              </p>
            ) : (
              <div className="space-y-3">
                {data.userReviews.map((r) => (
                  <div key={r.id} className="border rounded p-3" style={{ breakInside: "avoid" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`h-3.5 w-3.5 ${
                              r.rating && n <= r.rating
                                ? "text-amber-400 fill-amber-400"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </span>
                      <span className="text-xs text-gray-500">
                        {r.storeTitle} ・ {new Date(r.createdAt).toLocaleDateString("ja-JP")}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.comment ?? "（コメントなし）"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 回答者情報 */}
          {data.respondents.length > 0 && (
            <div className="px-5 py-6 border-t no-print">
              <p className="text-sm font-bold mb-3">回答者情報（社内のみ・印刷されません）</p>
              <table className="text-sm border w-full max-w-xl">
                <thead>
                  <tr className="bg-gray-100 text-xs">
                    <th className="text-left px-3 py-1.5 border-b">氏名</th>
                    <th className="text-left px-3 py-1.5 border-b">連絡先</th>
                    <th className="text-left px-3 py-1.5 border-b">回答日</th>
                  </tr>
                </thead>
                <tbody>
                  {data.respondents.map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-3 py-1.5">{r.name ?? "—"}</td>
                      <td className="px-3 py-1.5">{r.contact ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        {new Date(r.createdAt).toLocaleDateString("ja-JP")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
