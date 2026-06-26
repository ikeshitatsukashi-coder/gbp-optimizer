"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Bot,
  Star,
  Sparkles,
  Send,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  AlertCircle,
} from "lucide-react"

interface Candidate {
  reviewName: string
  locationName: string
  storeName: string
  industry: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
  createTime: string | null
}

interface ReplyResult {
  reviewName: string
  status: "posted" | "failed"
  errorMessage?: string
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

function formatDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function AutoReplyPage() {
  const [days, setDays] = useState<8 | 14 | 30>(8)
  const [search, setSearch] = useState("")
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** reviewName -> draft text */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  /** reviewName -> generating spinner */
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  /** reviewName -> selected for batch post */
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [posting, setPosting] = useState(false)
  const [lastResult, setLastResult] = useState<{
    posted: number
    failed: number
    results: ReplyResult[]
  } | null>(null)

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ days: String(days) })
      if (search.trim()) params.set("storeFilter", search.trim())
      const res = await fetch(`/api/reviews/unreplied?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setCandidates(j.candidates)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [days, search])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  const generateOne = async (reviewName: string) => {
    setGenerating((prev) => new Set(prev).add(reviewName))
    try {
      const res = await fetch("/api/reviews/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewName }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setDrafts((prev) => ({ ...prev, [reviewName]: j.reply }))
      setSelected((prev) => new Set(prev).add(reviewName))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev)
        next.delete(reviewName)
        return next
      })
    }
  }

  const generateAll = async () => {
    const targets = candidates.filter((c) => !drafts[c.reviewName])
    if (targets.length === 0) return
    if (
      !confirm(
        `${targets.length} 件の返信文を Claude API で生成します。\n（生成のみ、まだ投稿はしません）`
      )
    )
      return

    // 並列度 3 で順次生成
    let idx = 0
    const concurrency = 3
    setError(null)

    async function worker() {
      while (true) {
        const i = idx++
        if (i >= targets.length) break
        await generateOne(targets[i].reviewName)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker))
  }

  const toggleSelected = (reviewName: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(reviewName)) next.delete(reviewName)
      else next.add(reviewName)
      return next
    })
  }

  const toggleAll = () => {
    const eligible = candidates.filter((c) => drafts[c.reviewName]?.trim()).map((c) => c.reviewName)
    setSelected((prev) =>
      prev.size === eligible.length && eligible.every((n) => prev.has(n))
        ? new Set()
        : new Set(eligible)
    )
  }

  const handlePostBatch = async () => {
    const items = Array.from(selected)
      .map((reviewName) => ({ reviewName, comment: drafts[reviewName]?.trim() ?? "" }))
      .filter((i) => i.comment)

    if (items.length === 0) {
      setError("投稿対象が選択されていません（返信案が空のものは除外）")
      return
    }
    if (
      !confirm(
        `${items.length} 件の返信を Google に投稿します。\n投稿後の取り消しは GBP 管理画面から行う必要があります。続行しますか？`
      )
    )
      return

    setPosting(true)
    setLastResult(null)
    setError(null)
    try {
      const res = await fetch("/api/reviews/reply-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, concurrency: 3, delayMs: 500 }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setLastResult(j)
      // 成功分の draft / selected を片付け
      const posted = new Set<string>(
        j.results.filter((r: ReplyResult) => r.status === "posted").map((r: ReplyResult) => r.reviewName)
      )
      setDrafts((prev) => {
        const next = { ...prev }
        for (const r of posted) delete next[r]
        return next
      })
      setSelected((prev) => {
        const next = new Set(prev)
        for (const r of posted) next.delete(r)
        return next
      })
      await fetchCandidates()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  const eligibleCount = useMemo(
    () => candidates.filter((c) => drafts[c.reviewName]?.trim()).length,
    [candidates, drafts]
  )

  const byStore = useMemo(() => {
    const m = new Map<string, Candidate[]>()
    for (const c of candidates) {
      if (!m.has(c.storeName)) m.set(c.storeName, [])
      m.get(c.storeName)!.push(c)
    }
    return m
  }, [candidates])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            自動返信バッチ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            「自動返信ON」の運用中店舗から、直近の未返信クチコミを抽出し、業種別トーンで返信案を生成・一括投稿します。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {([8, 14, 30] as const).map((n) => (
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
          <Button onClick={fetchCandidates} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            再取得
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 break-all">{error}</p>
        </Card>
      )}

      {lastResult && (
        <Card className="p-4 bg-green-50 border-green-200">
          <p className="text-sm text-green-900">
            <strong>投稿完了</strong>: 成功 {lastResult.posted} 件 / 失敗 {lastResult.failed} 件
          </p>
          {lastResult.failed > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-green-800">失敗詳細</summary>
              <ul className="mt-2 space-y-1 text-red-700 font-mono">
                {lastResult.results
                  .filter((r) => r.status === "failed")
                  .slice(0, 20)
                  .map((r) => (
                    <li key={r.reviewName}>
                      {r.reviewName.slice(-30)}: {r.errorMessage}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      {/* Summary + Search + Actions */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-3">
          <div>
            <div className="text-xs text-muted-foreground">対象件数</div>
            <div className="text-2xl font-bold mt-1">{candidates.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">対象店舗</div>
            <div className="text-2xl font-bold mt-1">{byStore.size}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">返信案あり</div>
            <div className="text-2xl font-bold mt-1 text-blue-700">{eligibleCount}</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              店舗名で絞り込み
            </label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="例: 株式会社LIGO"
                className="w-full h-8 pl-7 pr-2 text-sm border rounded bg-background"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-3 border-t">
          <Button
            onClick={generateAll}
            disabled={loading || candidates.every((c) => !!drafts[c.reviewName])}
            variant="outline"
            size="sm"
          >
            <Sparkles className="h-3.5 w-3.5" />
            未生成分を一括生成 ({candidates.filter((c) => !drafts[c.reviewName]).length})
          </Button>
          <Button onClick={toggleAll} variant="outline" size="sm" disabled={eligibleCount === 0}>
            {selected.size === eligibleCount && eligibleCount > 0 ? (
              <>
                <CheckSquare className="h-3.5 w-3.5" />
                返信案あり 全解除
              </>
            ) : (
              <>
                <Square className="h-3.5 w-3.5" />
                返信案あり 全選択
              </>
            )}
          </Button>
          <Button
            onClick={handlePostBatch}
            disabled={selected.size === 0 || posting}
            variant="destructive"
            size="sm"
          >
            {posting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                投稿中…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                選択した {selected.size} 件を Google に投稿
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          ※ 対象は「店舗マスタで自動返信ONに設定された運用中店舗」のクチコミのみ。OFFの店舗を対象にしたい場合は店舗マスタでトグルを切替えてください。
        </p>
      </Card>

      {/* Candidates */}
      {loading && (
        <Card className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          候補を取得中…
        </Card>
      )}

      {!loading && candidates.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">対象クチコミがありません</p>
          <p className="text-xs mt-1">
            「店舗マスタ」で自動返信を ON にした店舗のうち、直近{days}日に未返信クチコミがある場合に表示されます。
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {candidates.map((c) => {
          const isGen = generating.has(c.reviewName)
          const draft = drafts[c.reviewName] ?? ""
          const isSelected = selected.has(c.reviewName)

          return (
            <Card key={c.reviewName} className="overflow-hidden">
              <div className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start gap-3 flex-wrap">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(c.reviewName)}
                    disabled={!draft.trim()}
                    className="mt-1 h-4 w-4 cursor-pointer disabled:opacity-30"
                    title={!draft.trim() ? "返信案を生成してから選択できます" : ""}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{c.storeName}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                        {INDUSTRY_LABELS[c.industry] ?? c.industry}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${
                              i < (c.starRating ?? 0)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {c.reviewer ?? "匿名"} ・ {formatDate(c.createTime)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Original comment */}
                <div className="ml-7 bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap">
                  {c.comment}
                </div>

                {/* Reply draft */}
                <div className="ml-7 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">返信案</span>
                    <Button
                      onClick={() => generateOne(c.reviewName)}
                      disabled={isGen}
                      variant={draft ? "outline" : "default"}
                      size="xs"
                    >
                      {isGen ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          生成中…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" />
                          {draft ? "再生成" : "返信案を生成"}
                        </>
                      )}
                    </Button>
                  </div>
                  <textarea
                    value={draft}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [c.reviewName]: e.target.value }))
                    }
                    placeholder="まだ返信案がありません。「返信案を生成」をクリックしてください。"
                    rows={4}
                    className="w-full border rounded px-3 py-2 text-sm bg-white"
                  />
                  {draft.trim() && (
                    <div className="text-xs text-muted-foreground">
                      {draft.length} 文字
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
