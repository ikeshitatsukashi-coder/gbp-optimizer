"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import {
  Loader2,
  Search,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Copy,
} from "lucide-react"
import { useGbp } from "@/lib/store"

interface QuickStore {
  locationName: string
  storeName: string
  industry: string
  score: number
  hasPhone: boolean
  hasAddress: boolean
  hasCategory: boolean
  reviewCount: number
  replyRate: number | null
  unansweredLow: number
  avgRating: number
  issues: string[]
}

interface Check {
  id: string
  label: string
  ok: boolean
  points: number
  maxPoints: number
  advice: string
}

interface DeepResult {
  locationName: string
  storeName: string
  score: number
  rawScore: number
  maxScore: number
  checks: Check[]
  apiErrors: { location: string | null; media: string | null; posts: string | null }
}

const INDUSTRY_LABELS: Record<string, string> = {
  btob_logistics: "BtoB物流",
  bakery: "ベーカリー",
  funeral: "葬祭",
  restaurant: "飲食",
  construction: "建設・不動産",
  staffing: "人材派遣",
  buyback: "買取",
  general_btoc: "BtoC一般",
  general_btob: "BtoB一般",
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-700"
  if (score >= 50) return "bg-yellow-100 text-yellow-800"
  return "bg-red-100 text-red-700"
}

/**
 * 診断項目 → このツール内の修正ページへのマッピング。
 * 「診断して終わり」にしない: 各未達成項目からワンクリックで修正画面に飛ぶ。
 */
const FIX_ACTIONS: Record<string, { href: string; label: string }> = {
  phone: { href: "/google-data/gbp/basic-info", label: "基本情報で電話番号を設定" },
  address: { href: "/google-data/gbp/basic-info", label: "基本情報で住所を設定" },
  website: { href: "/google-data/gbp/basic-info", label: "基本情報でサイトURLを設定" },
  hours: { href: "/google-data/gbp/basic-info", label: "基本情報で営業時間を設定" },
  description: { href: "/google-data/gbp/basic-info", label: "基本情報で説明文を編集" },
  category: { href: "/google-data/gbp/basic-info", label: "基本情報でカテゴリを確認" },
  additional_categories: {
    href: "/google-data/gbp/basic-info",
    label: "基本情報でカテゴリを確認",
  },
  photos: { href: "/google-data/gbp/photos", label: "写真管理で写真を追加" },
  post_recency: { href: "/google-data/gbp/posts", label: "投稿を作成する" },
  reply_rate: { href: "/auto-reply", label: "自動返信バッチで返信する" },
  low_reviews: { href: "/google-data/gbp/reviews", label: "クチコミ管理で返信する" },
}

export default function MeoDiagnosisPage() {
  const router = useRouter()
  const { setLocationName } = useGbp()
  const [stores, setStores] = useState<QuickStore[]>([])
  const [summary, setSummary] = useState({
    total: 0,
    avgScore: 0,
    critical: 0,
    warning: 0,
    good: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sortAsc, setSortAsc] = useState(true)

  // Deep diagnosis panel
  const [deepTarget, setDeepTarget] = useState<string | null>(null)
  const [deepResult, setDeepResult] = useState<DeepResult | null>(null)
  const [deepLoading, setDeepLoading] = useState(false)

  // AI 説明文生成
  const [genLoading, setGenLoading] = useState(false)
  const [genText, setGenText] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  /** 診断対象の店舗をグローバル店舗セレクタに設定してから修正ページへ遷移 */
  const goFix = (href: string) => {
    if (deepTarget) setLocationName(deepTarget)
    router.push(href)
  }

  const generateDescription = async () => {
    if (!deepTarget) return
    setGenLoading(true)
    setGenError(null)
    setGenText(null)
    try {
      const res = await fetch("/api/meo/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName: deepTarget }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setGenText(j.description)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenLoading(false)
    }
  }

  const copyGenText = async () => {
    if (!genText) return
    await navigator.clipboard.writeText(genText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/meo/diagnosis")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setStores(j.stores)
      setSummary(j.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const runDeep = async (locationName: string) => {
    setDeepTarget(locationName)
    setDeepResult(null)
    setGenText(null)
    setGenError(null)
    setDeepLoading(true)
    try {
      const res = await fetch(
        `/api/meo/diagnosis?locationName=${encodeURIComponent(locationName)}`
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setDeepResult(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDeepTarget(null)
    } finally {
      setDeepLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim()
    const base = q
      ? stores.filter(
          (s) =>
            s.storeName.includes(q) ||
            (INDUSTRY_LABELS[s.industry] ?? s.industry).includes(q)
        )
      : stores
    return [...base].sort((a, b) => (sortAsc ? a.score - b.score : b.score - a.score))
  }, [stores, search, sortAsc])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            GBP最適化診断
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            全店舗のプロフィール充実度をスコア化。行をクリックすると Google API から最新情報を取得して 12 項目の詳細診断を実行します（読み取りのみ・GBP への変更は行いません）。
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="h-9 px-4 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          再計算
        </button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {/* サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">対象店舗</div>
          <div className="text-2xl font-bold mt-1">{summary.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">平均スコア</div>
          <div className="text-2xl font-bold mt-1">{summary.avgScore}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">良好 (80+)</div>
          <div className="text-2xl font-bold mt-1 text-green-700">{summary.good}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">要改善 (50-79)</div>
          <div className="text-2xl font-bold mt-1 text-yellow-700">{summary.warning}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">危険 (〜49)</div>
          <div className="text-2xl font-bold mt-1 text-red-700">{summary.critical}</div>
        </Card>
      </div>

      {/* 検索 + ソート */}
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="店舗名・業種で検索"
              className="w-full h-8 pl-7 pr-2 text-sm border rounded bg-background"
            />
          </div>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="h-8 px-3 text-xs border rounded bg-white hover:bg-gray-50 whitespace-nowrap"
          >
            スコア{sortAsc ? "低い順 ▲" : "高い順 ▼"}
          </button>
        </div>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 計算中…
        </div>
      )}

      {/* 店舗テーブル（高密度） */}
      <div className="border border-gray-200 rounded bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 text-[11px] text-gray-600 border-b">
              <tr className="h-9">
                <th className="text-left px-2 font-normal">店舗名</th>
                <th className="text-left px-2 font-normal">業種</th>
                <th className="text-left px-2 font-normal w-16">スコア</th>
                <th className="text-center px-2 font-normal">電話</th>
                <th className="text-center px-2 font-normal">住所</th>
                <th className="text-center px-2 font-normal">カテゴリ</th>
                <th className="text-right px-2 font-normal whitespace-nowrap">クチコミ</th>
                <th className="text-right px-2 font-normal whitespace-nowrap">返信率</th>
                <th className="text-right px-2 font-normal whitespace-nowrap">未対応低評価</th>
                <th className="text-left px-2 font-normal">主な課題</th>
                <th className="text-left px-2 font-normal w-24">診断・修正</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-muted-foreground text-sm">
                    データがありません
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr
                  key={s.locationName}
                  onClick={() => runDeep(s.locationName)}
                  className="border-t hover:bg-blue-50/50 h-9 cursor-pointer"
                  title="クリックで詳細診断"
                >
                  <td className="px-2 max-w-[200px]">
                    <div className="truncate font-medium" title={s.storeName}>
                      {s.storeName}
                    </div>
                  </td>
                  <td className="px-2 whitespace-nowrap text-gray-600">
                    {INDUSTRY_LABELS[s.industry] ?? s.industry}
                  </td>
                  <td className="px-2">
                    <span
                      className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${scoreBadgeClass(s.score)}`}
                    >
                      {s.score}
                    </span>
                  </td>
                  <td className="px-2 text-center">
                    {s.hasPhone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 inline" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500 inline" />
                    )}
                  </td>
                  <td className="px-2 text-center">
                    {s.hasAddress ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 inline" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500 inline" />
                    )}
                  </td>
                  <td className="px-2 text-center">
                    {s.hasCategory ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 inline" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500 inline" />
                    )}
                  </td>
                  <td className="px-2 text-right">{s.reviewCount}</td>
                  <td className="px-2 text-right">
                    {s.replyRate === null ? "—" : `${s.replyRate}%`}
                  </td>
                  <td
                    className={`px-2 text-right ${s.unansweredLow > 0 ? "text-red-600 font-bold" : ""}`}
                  >
                    {s.unansweredLow}
                  </td>
                  <td className="px-2 max-w-[240px]">
                    <div className="truncate text-gray-500" title={s.issues.join(" / ")}>
                      {s.issues.length === 0 ? "—" : s.issues.join(" / ")}
                    </div>
                  </td>
                  <td className="px-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        runDeep(s.locationName)
                      }}
                      className="text-[11px] text-white bg-[#4a90e2] hover:bg-[#3a7cc8] rounded px-2.5 py-1 whitespace-nowrap"
                    >
                      診断・修正 →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ クイックスコアは DB のデータ（店舗情報・クチコミアーカイブ）から算出。「全店舗クチコミ取得」を実行してから見ると精度が上がります。
      </p>

      {/* 詳細診断パネル */}
      {deepTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold">
                詳細診断{deepResult ? `: ${deepResult.storeName}` : ""}
              </h2>
              <button
                onClick={() => {
                  setDeepTarget(null)
                  setDeepResult(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {deepLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Google API から最新情報を取得して診断中…
                </div>
              )}

              {deepResult && (
                <div className="space-y-4">
                  {/* スコア */}
                  <div className="text-center py-4">
                    <div
                      className={`inline-block text-4xl font-bold px-6 py-3 rounded-lg ${scoreBadgeClass(deepResult.score)}`}
                    >
                      {deepResult.score}
                      <span className="text-lg font-normal"> / 100</span>
                    </div>
                  </div>

                  {/* チェックリスト */}
                  <div className="space-y-2">
                    {deepResult.checks.map((c) => {
                      const fix = FIX_ACTIONS[c.id]
                      return (
                        <div
                          key={c.id}
                          className={`border rounded p-3 ${c.ok ? "bg-green-50/50 border-green-200" : "bg-red-50/40 border-red-200"}`}
                        >
                          <div className="flex items-center gap-2">
                            {c.ok ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                            )}
                            <span className="text-sm font-medium flex-1">{c.label}</span>
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              {c.points} / {c.maxPoints} 点
                            </span>
                          </div>
                          {!c.ok && (
                            <div className="ml-6 mt-1.5 space-y-2">
                              <p className="text-xs text-gray-600">{c.advice}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {fix && (
                                  <button
                                    onClick={() => goFix(fix.href)}
                                    className="text-xs text-white bg-[#4a90e2] hover:bg-[#3a7cc8] rounded px-3 py-1.5 flex items-center gap-1"
                                  >
                                    {fix.label}
                                    <ArrowRight className="h-3 w-3" />
                                  </button>
                                )}
                                {c.id === "description" && (
                                  <button
                                    onClick={generateDescription}
                                    disabled={genLoading}
                                    className="text-xs text-[#4a90e2] border border-[#4a90e2] rounded px-3 py-1.5 flex items-center gap-1 hover:bg-blue-50 disabled:opacity-50"
                                  >
                                    {genLoading ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3 w-3" />
                                    )}
                                    AIで説明文の下書きを生成
                                  </button>
                                )}
                              </div>
                              {c.id === "description" && genError && (
                                <p className="text-xs text-red-700 bg-red-50 rounded p-2">
                                  {genError}
                                </p>
                              )}
                              {c.id === "description" && genText && (
                                <div className="border rounded bg-white p-2 space-y-2">
                                  <textarea
                                    value={genText}
                                    onChange={(e) => setGenText(e.target.value)}
                                    rows={7}
                                    className="w-full text-xs border rounded p-2"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={copyGenText}
                                      className="text-xs border rounded px-3 py-1.5 flex items-center gap-1 hover:bg-gray-50"
                                    >
                                      <Copy className="h-3 w-3" />
                                      {copied ? "コピーしました" : "コピー"}
                                    </button>
                                    <button
                                      onClick={() => goFix("/google-data/gbp/basic-info")}
                                      className="text-xs text-white bg-[#4a90e2] hover:bg-[#3a7cc8] rounded px-3 py-1.5 flex items-center gap-1"
                                    >
                                      基本情報に貼り付けに行く
                                      <ArrowRight className="h-3 w-3" />
                                    </button>
                                  </div>
                                  <p className="text-xs text-gray-500">
                                    ※ 内容を確認・編集してから基本情報ページの「ビジネスの説明」に貼り付けて保存してください。AI が生成しただけでは GBP には反映されません。
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {(deepResult.apiErrors.location ||
                    deepResult.apiErrors.media ||
                    deepResult.apiErrors.posts) && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                      一部の API 取得に失敗したため、該当項目は 0 点扱いになっています。
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
