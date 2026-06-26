"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Star,
  AlertTriangle,
  Flag,
  Loader2,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  XCircle,
  Ban,
} from "lucide-react"

interface Candidate {
  reviewName: string
  locationName: string
  storeName: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
  createTime: string | null
  lastFlaggedAt: string | null
}

interface SyncResult {
  stores: number
  reviewsFetched: number
  markedDeleted: number
  errors: { locationName: string; error: string }[]
  durationMs: number
}

interface FlagResult {
  reviewName: string
  status: "submitted" | "already_reported" | "failed"
  errorMessage?: string
}

interface BatchResponse {
  results: FlagResult[]
  submitted: number
  failed: number
  alreadyReported: number
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ja-JP")
}

export default function ReviewFlagBatchPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<SyncResult | null>(null)
  const [lastBatch, setLastBatch] = useState<BatchResponse | null>(null)
  const [enabled, setEnabled] = useState(false) // ON/OFF トグル（オン=候補表示）

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("storeFilter", search.trim())
      const res = await fetch(`/api/reviews/candidates?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setCandidates(j.candidates)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    if (enabled) fetchCandidates()
  }, [enabled, fetchCandidates])

  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    setLastSync(null)
    try {
      const res = await fetch("/api/reviews/sync", { method: "POST" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setLastSync(j.result)
      if (enabled) await fetchCandidates()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  const toggleOne = (reviewName: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(reviewName)) next.delete(reviewName)
      else next.add(reviewName)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.reviewName))
    )
  }

  const handleExclude = async (reviewName: string) => {
    const reason = prompt(
      "除外理由（任意）:\n例: クレーマー、過去対応済み 等",
      ""
    )
    if (reason === null) return
    try {
      const res = await fetch("/api/reviews/exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewName,
          excludeAutoReply: false,
          excludeAutoFlag: true,
          reason: reason.trim() || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setCandidates((prev) => prev.filter((c) => c.reviewName !== reviewName))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(reviewName)
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleBatchFlag = async () => {
    if (selected.size === 0) return
    if (
      !confirm(
        `${selected.size} 件のクチコミに削除申請を送信します。\n\n` +
          `この操作は Google に正式な報告として送信されます。本当に実行しますか？`
      )
    )
      return

    setFlagging(true)
    setError(null)
    setLastBatch(null)
    try {
      const reviewNames = Array.from(selected)
      const res = await fetch("/api/reviews/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNames, concurrency: 3, delayMs: 500 }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setLastBatch(j)
      setSelected(new Set())
      await fetchCandidates()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setFlagging(false)
    }
  }

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="h-6 w-6" />
            低評価クチコミ削除申請（バッチ）
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            運用中の全店舗から「星 2 以下 ＋ コメント付き」のクチコミを抽出し、選択して一括で削除申請を送信します。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSync}
            disabled={syncing}
            variant="outline"
            size="lg"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "全店舗クチコミ取得中…" : "全店舗クチコミ取得"}
          </Button>
        </div>
      </div>

      {/* ON/OFF master toggle */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">削除申請バッチ機能</span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}
              >
                {enabled ? "ON" : "OFF"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ON にすると候補リストを表示し、選択して削除申請を実行できます。OFF の状態では候補取得を行いません。
            </p>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? "bg-green-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </Card>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {lastSync && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-900">
            <strong>クチコミ同期完了</strong>（{(lastSync.durationMs / 1000).toFixed(1)}
            秒）: 店舗 {lastSync.stores} 件 / クチコミ取得 {lastSync.reviewsFetched} 件 / 削除検知{" "}
            {lastSync.markedDeleted} 件
            {lastSync.errors.length > 0 && (
              <span className="text-red-700"> / エラー {lastSync.errors.length} 件</span>
            )}
          </p>
        </Card>
      )}

      {lastBatch && (
        <Card className="p-4 bg-green-50 border-green-200">
          <p className="text-sm text-green-900">
            <strong>申請完了</strong>: 送信成功 {lastBatch.submitted} 件 / 既報告{" "}
            {lastBatch.alreadyReported} 件 / 失敗 {lastBatch.failed} 件
          </p>
          {lastBatch.failed > 0 && (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer text-green-800">失敗詳細を表示</summary>
              <ul className="mt-2 space-y-1 text-xs text-red-700">
                {lastBatch.results
                  .filter((r) => r.status === "failed")
                  .slice(0, 20)
                  .map((r) => (
                    <li key={r.reviewName} className="font-mono">
                      {r.reviewName.slice(-20)}: {r.errorMessage}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      {enabled && (
        <>
          {/* Summary + Search + Actions */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <div className="text-xs text-muted-foreground">候補件数</div>
                <div className="text-2xl font-bold mt-1">{candidates.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">対象店舗数</div>
                <div className="text-2xl font-bold mt-1">{byStore.size}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">選択中</div>
                <div className="text-2xl font-bold mt-1 text-blue-700">{selected.size}</div>
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
            <div className="flex items-center gap-2 mt-4">
              <Button
                onClick={toggleAll}
                variant="outline"
                size="sm"
                disabled={candidates.length === 0}
              >
                {selected.size === candidates.length && candidates.length > 0 ? (
                  <>
                    <CheckSquare className="h-3.5 w-3.5" />
                    全解除
                  </>
                ) : (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    全選択
                  </>
                )}
              </Button>
              <Button
                onClick={handleBatchFlag}
                disabled={selected.size === 0 || flagging}
                variant="destructive"
                size="sm"
              >
                {flagging ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    送信中…
                  </>
                ) : (
                  <>
                    <Flag className="h-3.5 w-3.5" />
                    選択した {selected.size} 件に削除申請
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Candidates list */}
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                候補を読み込み中…
              </div>
            ) : candidates.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">該当するクチコミがありません</p>
                <p className="text-xs mt-1">
                  まずは右上の「全店舗クチコミ取得」を実行してから再確認してください。
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {Array.from(byStore.entries()).map(([storeName, items]) => (
                  <div key={storeName}>
                    <div className="bg-muted/50 px-4 py-2 text-xs font-medium flex items-center justify-between">
                      <span>{storeName}</span>
                      <span className="text-muted-foreground">{items.length} 件</span>
                    </div>
                    {items.map((c) => (
                      <div
                        key={c.reviewName}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 border-t"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(c.reviewName)}
                          onChange={() => toggleOne(c.reviewName)}
                          className="mt-1 h-4 w-4 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
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
                            <span className="text-xs font-medium">{c.reviewer ?? "匿名"}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(c.createTime)}
                            </span>
                            {c.lastFlaggedAt && (
                              <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
                                前回申請: {formatDate(c.lastFlaggedAt)}
                              </span>
                            )}
                            <button
                              onClick={() => handleExclude(c.reviewName)}
                              className="ml-auto text-xs text-gray-500 hover:text-red-600 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-gray-100"
                              title="このレビューを削除申請から除外"
                            >
                              <Ban className="h-3 w-3" />
                              除外
                            </button>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{c.comment}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <p className="text-xs text-muted-foreground">
            ※ 申請は Google に正式な「ポリシー違反の報告」として送られます。送信履歴は flag_history テーブルに記録され、14日間は同じレビューを再申請しません（クールダウン）。
          </p>
        </>
      )}
    </div>
  )
}
