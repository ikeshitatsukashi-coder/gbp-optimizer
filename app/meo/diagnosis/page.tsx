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
  Info,
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
  const { locationName, locations, setLocationName } = useGbp()

  // 表示モード: 選択店舗の診断（デフォルト） / 全店舗サマリー
  const [view, setView] = useState<"store" | "all">("store")

  /* ------------------------- 選択店舗の詳細診断 ------------------------- */
  const [deepResult, setDeepResult] = useState<DeepResult | null>(null)
  const [deepLoading, setDeepLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // AI 説明文生成
  const [genLoading, setGenLoading] = useState(false)
  const [genText, setGenText] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const runDeep = useCallback(async (target: string) => {
    setDeepResult(null)
    setGenText(null)
    setGenError(null)
    setDeepLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/meo/diagnosis?locationName=${encodeURIComponent(target)}`
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setDeepResult(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeepLoading(false)
    }
  }, [])

  // 選択店舗が変わったら自動診断（store ビュー時）
  useEffect(() => {
    if (view === "store" && locationName) {
      runDeep(locationName)
    }
  }, [view, locationName, runDeep])

  const goFix = (href: string) => {
    // 診断中の店舗をグローバル選択に反映してから遷移
    if (deepResult?.locationName) setLocationName(deepResult.locationName)
    router.push(href)
  }

  const generateDescription = async () => {
    const target = deepResult?.locationName ?? locationName
    if (!target) return
    setGenLoading(true)
    setGenError(null)
    setGenText(null)
    try {
      const res = await fetch("/api/meo/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName: target }),
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

  /* --------------------------- 全店舗サマリー --------------------------- */
  const [stores, setStores] = useState<QuickStore[]>([])
  const [summary, setSummary] = useState({
    total: 0,
    avgScore: 0,
    critical: 0,
    warning: 0,
    good: 0,
  })
  const [allLoading, setAllLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [sortAsc, setSortAsc] = useState(true)
  const [allLoaded, setAllLoaded] = useState(false)

  const loadAll = useCallback(async () => {
    setAllLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/meo/diagnosis")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setStores(j.stores)
      setSummary(j.summary)
      setAllLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAllLoading(false)
    }
  }, [])

  // 全店舗ビューを最初に開いた時だけロード
  useEffect(() => {
    if (view === "all" && !allLoaded) loadAll()
  }, [view, allLoaded, loadAll])

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

  /** 全店舗一覧から店舗を選ぶ → グローバル選択を切替えて選択店舗ビューへ */
  const inspectStore = (target: string) => {
    setLocationName(target)
    setView("store")
  }

  const selectedStoreTitle =
    locations.find((l) => l.name === locationName)?.title ?? ""

  /* ------------------------------- render ------------------------------- */
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            GBP最適化診断
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            上部セレクタで選択中の店舗を 12 項目で診断し、未達成項目はそのまま修正ページに移動できます（読み取りのみ・GBP への変更は行いません）。
          </p>
        </div>
      </div>

      {/* ビュー切替 */}
      <div className="flex gap-2">
        <button
          onClick={() => setView("store")}
          className={`px-4 py-2 text-sm rounded border ${
            view === "store"
              ? "bg-[#2c3e50] text-white border-[#2c3e50]"
              : "bg-white border-gray-300 hover:bg-gray-50"
          }`}
        >
          選択店舗の診断
        </button>
        <button
          onClick={() => setView("all")}
          className={`px-4 py-2 text-sm rounded border ${
            view === "all"
              ? "bg-[#2c3e50] text-white border-[#2c3e50]"
              : "bg-white border-gray-300 hover:bg-gray-50"
          }`}
        >
          全店舗サマリー
        </button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {/* =============== 選択店舗の診断（メイン） =============== */}
      {view === "store" && (
        <>
          {!locationName && (
            <Card className="p-4 bg-amber-50 border-amber-200">
              <p className="text-sm text-amber-800 flex items-center gap-2">
                <Info className="h-4 w-4" />
                画面上部の店舗セレクタで店舗を選択すると診断が始まります。
              </p>
            </Card>
          )}

          {deepLoading && (
            <Card className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">
                「{selectedStoreTitle}」を Google API から最新情報を取得して診断中…
              </p>
            </Card>
          )}

          {deepResult && !deepLoading && (
            <div className="space-y-4">
              {/* スコアヘッダー */}
              <Card className="p-6">
                <div className="flex items-center gap-6 flex-wrap">
                  <div
                    className={`text-4xl font-bold px-6 py-3 rounded-lg ${scoreBadgeClass(deepResult.score)}`}
                  >
                    {deepResult.score}
                    <span className="text-lg font-normal"> / 100</span>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{deepResult.storeName}</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      未達成 {deepResult.checks.filter((c) => !c.ok).length} 項目 / 全{" "}
                      {deepResult.checks.length} 項目
                    </p>
                  </div>
                  <button
                    onClick={() => locationName && runDeep(locationName)}
                    className="ml-auto h-9 px-4 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    再診断
                  </button>
                </div>
              </Card>

              {/* チェックリスト */}
              <div className="space-y-2">
                {deepResult.checks.map((c) => {
                  const fix = FIX_ACTIONS[c.id]
                  return (
                    <Card
                      key={c.id}
                      className={`p-4 ${c.ok ? "bg-green-50/50 border-green-200" : "bg-red-50/40 border-red-200"}`}
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
                        <div className="ml-6 mt-2 space-y-2">
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
                    </Card>
                  )
                })}
              </div>

              {(deepResult.apiErrors.location ||
                deepResult.apiErrors.media ||
                deepResult.apiErrors.posts) && (
                <Card className="p-3 bg-amber-50 border-amber-200">
                  <p className="text-xs text-amber-800">
                    一部の API 取得に失敗したため、該当項目は 0 点扱いになっています。
                  </p>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* =============== 全店舗サマリー（サブ） =============== */}
      {view === "all" && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              スコアの低い順に全店舗を俯瞰します。「この店舗を診断」で選択店舗を切替えて詳細へ。
            </p>
            <button
              onClick={loadAll}
              disabled={allLoading}
              className="h-9 px-4 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${allLoading ? "animate-spin" : ""}`} />
              再計算
            </button>
          </div>

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
              <div className="text-2xl font-bold mt-1 text-yellow-700">
                {summary.warning}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">危険 (〜49)</div>
              <div className="text-2xl font-bold mt-1 text-red-700">
                {summary.critical}
              </div>
            </Card>
          </div>

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

          {allLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 計算中…
            </div>
          )}

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
                    <th className="text-right px-2 font-normal whitespace-nowrap">
                      クチコミ
                    </th>
                    <th className="text-right px-2 font-normal whitespace-nowrap">
                      返信率
                    </th>
                    <th className="text-right px-2 font-normal whitespace-nowrap">
                      未対応低評価
                    </th>
                    <th className="text-left px-2 font-normal">主な課題</th>
                    <th className="text-left px-2 font-normal w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && !allLoading && (
                    <tr>
                      <td
                        colSpan={11}
                        className="text-center py-10 text-muted-foreground text-sm"
                      >
                        データがありません
                      </td>
                    </tr>
                  )}
                  {filtered.map((s) => (
                    <tr key={s.locationName} className="border-t hover:bg-gray-50 h-9">
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
                        <div
                          className="truncate text-gray-500"
                          title={s.issues.join(" / ")}
                        >
                          {s.issues.length === 0 ? "—" : s.issues.join(" / ")}
                        </div>
                      </td>
                      <td className="px-2">
                        <button
                          onClick={() => inspectStore(s.locationName)}
                          className="text-[11px] text-white bg-[#4a90e2] hover:bg-[#3a7cc8] rounded px-2.5 py-1 whitespace-nowrap"
                        >
                          この店舗を診断 →
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
        </>
      )}
    </div>
  )
}
