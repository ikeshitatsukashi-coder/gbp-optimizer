"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { fetchJsonRetry } from "@/lib/fetch-json"
import { normalizeSearchText } from "@/lib/search-normalize"
import { useGbp } from "@/lib/store"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ArrowRight,
} from "lucide-react"

/**
 * 投稿の進捗確認。
 *
 * 契約中のお客様の投稿が止まったまま気づかない、という事故を防ぐための画面。
 * 「どの店舗の投稿が何日止まっているか」「予約がいつ尽きるか」「自動投稿が動いているか」を
 * 1枚で確認できる。データの変更は一切しない（見るだけ）。
 */

/**
 * 判定の基準。投稿は全店舗とも週1回（7日おき）で組まれているため、
 *   8日以上あいた  ＝ 1回分が飛んでいる   → 注意
 *   15日以上あいた ＝ 2回分が飛んでいる   → 要対応
 * としている。予約の残りは「あと14日分以下」で注意（次の原稿を入れる時期）。
 */
const WARN_STOPPED_DAYS = 8
const DANGER_STOPPED_DAYS = 15
const WARN_RUNOUT_DAYS = 14
/** 失敗がこの日数以内なら要対応として扱う（それより古いものは印だけ付ける） */
const RECENT_FAIL_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

interface StoreProgress {
  locationName: string
  title: string
  lastPostedAt: string | null
  posted30d: number
  nextScheduledFor: string | null
  lastScheduledFor: string | null
  pendingCount: number
  overdueCount: number
  failedCount: number
  lastFailedAt: string | null
  draftCount: number
}

interface ProgressData {
  now: string
  auto: {
    configured: boolean
    savedBy: string | null
    authOk: boolean
    authError: string | null
    lastRun: {
      at?: string
      trigger?: string
      posted?: number
      failed?: number
      authError?: string | null
    } | null
    overdue: number
    failed: number
    pending: number
    lastPostedAt: string | null
  }
  stores: StoreProgress[]
  emptyStoreCount: number
  emptyStores?: { locationName: string; title: string }[]
}

type Level = "danger" | "warn" | "ok"

interface Judged extends StoreProgress {
  level: Level
  reasons: string[]
  /** 最後の投稿から何日たったか（まだ投稿が無ければ null） */
  stoppedDays: number | null
  /** 予約の最終日まであと何日か（予約が無ければ null） */
  runOutDays: number | null
}

const LEVEL_LABEL: Record<Level, string> = {
  danger: "要対応",
  warn: "注意",
  ok: "順調",
}
const LEVEL_STYLE: Record<Level, string> = {
  danger: "bg-red-50 text-red-700 border-red-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  ok: "bg-green-50 text-green-700 border-green-200",
}
const LEVEL_ORDER: Record<Level, number> = { danger: 0, warn: 1, ok: 2 }

const WEEK = ["日", "月", "火", "水", "木", "金", "土"]

function fmtDate(isoStr: string | null): string {
  if (!isoStr) return "—"
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`
}

function fmtDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—"
  const d = new Date(isoStr)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}） ${hh}:${mm}`
}

function judge(s: StoreProgress, nowMs: number): Judged {
  const reasons: string[] = []
  let level: Level = "ok"
  const raise = (l: Level) => {
    if (LEVEL_ORDER[l] < LEVEL_ORDER[level]) level = l
  }

  const stoppedDays = s.lastPostedAt
    ? Math.floor((nowMs - new Date(s.lastPostedAt).getTime()) / DAY_MS)
    : null
  const runOutDays = s.lastScheduledFor
    ? Math.max(0, Math.floor((new Date(s.lastScheduledFor).getTime() - nowMs) / DAY_MS))
    : null

  if (s.overdueCount > 0) {
    raise("danger")
    reasons.push(`予約時刻を過ぎたのに未実行が ${s.overdueCount} 件`)
  }
  if (stoppedDays !== null && stoppedDays >= DANGER_STOPPED_DAYS) {
    raise("danger")
    reasons.push(`投稿が止まって ${stoppedDays} 日`)
  } else if (stoppedDays !== null && stoppedDays >= WARN_STOPPED_DAYS) {
    raise("warn")
    reasons.push(`投稿が止まって ${stoppedDays} 日`)
  }
  if (s.pendingCount === 0) {
    raise("danger")
    reasons.push("予約が1件も残っていません")
  } else if (runOutDays !== null && runOutDays <= WARN_RUNOUT_DAYS) {
    raise("warn")
    reasons.push(`予約の残りはあと ${runOutDays} 日分`)
  }
  if (s.failedCount > 0) {
    const recent =
      !!s.lastFailedAt && nowMs - new Date(s.lastFailedAt).getTime() < RECENT_FAIL_DAYS * DAY_MS
    if (recent) raise("danger")
    reasons.push(`失敗した投稿が ${s.failedCount} 件（${fmtDate(s.lastFailedAt)}）`)
  }

  return { ...s, level, reasons, stoppedDays, runOutDays }
}

type SortKey = "severity" | "stopped" | "runout" | "title"

export default function ProgressPage() {
  const router = useRouter()
  const { setLocationName } = useGbp()

  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Level | "all">("all")
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("severity")
  const [showEmpty, setShowEmpty] = useState(false)

  const load = useCallback(async (withEmpty: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetchJsonRetry<ProgressData>(
        `/api/progress${withEmpty ? "?includeEmpty=1" : ""}`
      )
      if (!r.ok || !r.data) throw new Error(r.error ?? "読み込みに失敗しました")
      setData(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(showEmpty)
  }, [load, showEmpty])

  const judged = useMemo(() => {
    if (!data) return [] as Judged[]
    const nowMs = new Date(data.now).getTime()
    return data.stores.map((s) => judge(s, nowMs))
  }, [data])

  const counts = useMemo(
    () => ({
      all: judged.length,
      danger: judged.filter((s) => s.level === "danger").length,
      warn: judged.filter((s) => s.level === "warn").length,
      ok: judged.filter((s) => s.level === "ok").length,
    }),
    [judged]
  )

  const visible = useMemo(() => {
    const q = normalizeSearchText(query)
    const list = judged.filter(
      (s) =>
        (filter === "all" || s.level === filter) &&
        (!q || normalizeSearchText(s.title).includes(q))
    )
    const big = Number.MAX_SAFE_INTEGER
    return [...list].sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title, "ja")
      if (sortKey === "stopped") return (b.stoppedDays ?? -1) - (a.stoppedDays ?? -1)
      if (sortKey === "runout") return (a.runOutDays ?? big) - (b.runOutDays ?? big)
      // 重要な順: 要対応 → 注意 → 順調。同じ中では止まっている日数が長い順
      return (
        LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
        (b.stoppedDays ?? -1) - (a.stoppedDays ?? -1) ||
        a.title.localeCompare(b.title, "ja")
      )
    })
  }, [judged, filter, query, sortKey])

  const visibleEmpty = useMemo(() => {
    if (!showEmpty || !data?.emptyStores) return []
    const q = normalizeSearchText(query)
    return data.emptyStores.filter((s) => !q || normalizeSearchText(s.title).includes(q))
  }, [showEmpty, data, query])

  /** その店舗を選んだ状態で投稿一覧を開く */
  const openPosts = (locationName: string) => {
    setLocationName(locationName)
    router.push("/google-data/gbp/posts")
  }

  const auto = data?.auto
  const lastRun = auto?.lastRun ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            投稿の進捗確認
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            投稿が止まっている店舗・予約が尽きそうな店舗・自動投稿の状態を確認できます。この画面からデータは変更されません。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(showEmpty)} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          最新の状態に更新
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {/* 自動投稿が動いているか */}
      {auto && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className={`p-4 ${auto.authOk ? "" : "bg-red-50 border-red-300"}`}>
            <p className="text-xs text-muted-foreground">自動投稿の認証</p>
            <p
              className={`text-lg font-bold mt-1 flex items-center gap-1.5 ${
                auto.authOk ? "text-green-700" : "text-red-700"
              }`}
            >
              {auto.authOk ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {auto.authOk ? "正常" : "止まっています"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {auto.authOk
                ? `保存済みの認証で投稿できます${auto.savedBy ? `（${auto.savedBy}）` : ""}`
                : (auto.authError ?? "認証を確認できませんでした")}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-muted-foreground">最後の自動実行</p>
            <p className="text-lg font-bold mt-1">{fmtDateTime(lastRun?.at)}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {lastRun
                ? lastRun.authError
                  ? "認証が通らず、投稿を見送りました"
                  : `${lastRun.trigger ?? "実行"}・投稿 ${lastRun.posted ?? 0} 件` +
                    ((lastRun.failed ?? 0) > 0 ? `・失敗 ${lastRun.failed} 件` : "")
                : `記録はこれから残ります（最後の投稿 ${fmtDateTime(auto.lastPostedAt)}）`}
            </p>
          </Card>

          <Card className={`p-4 ${auto.overdue > 0 ? "bg-red-50 border-red-300" : ""}`}>
            <p className="text-xs text-muted-foreground">予約時刻を過ぎた未実行</p>
            <p
              className={`text-lg font-bold mt-1 ${
                auto.overdue > 0 ? "text-red-700" : "text-green-700"
              }`}
            >
              {auto.overdue} 件
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {auto.overdue > 0
                ? "6時間以上たっても投稿されていません。自動投稿が止まっている可能性があります"
                : "予約どおりに投稿されています"}
            </p>
          </Card>

          <Card className={`p-4 ${auto.failed > 0 ? "bg-amber-50 border-amber-300" : ""}`}>
            <p className="text-xs text-muted-foreground">失敗のまま残っている投稿</p>
            <p
              className={`text-lg font-bold mt-1 ${
                auto.failed > 0 ? "text-amber-800" : "text-green-700"
              }`}
            >
              {auto.failed} 件
            </p>
            <p className="text-xs mt-1">
              <Link href="/scheduled-posts" className="text-[#4a90e2] hover:underline">
                投稿スケジューラで確認する
              </Link>
            </p>
          </Card>
        </div>
      )}

      {/* 絞り込み */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: "all", label: "すべて", n: counts.all, cls: "" },
              { key: "danger", label: "要対応", n: counts.danger, cls: "text-red-700" },
              { key: "warn", label: "注意", n: counts.warn, cls: "text-amber-800" },
              { key: "ok", label: "順調", n: counts.ok, cls: "text-green-700" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`h-9 px-4 text-sm border rounded flex items-center gap-2 ${
                filter === f.key ? "border-[#4a90e2] bg-blue-50" : "bg-white hover:bg-gray-50"
              }`}
            >
              <span className={f.cls}>{f.label}</span>
              <span className="font-bold">{f.n}</span>
            </button>
          ))}

          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="店舗名で絞り込み"
              className="h-9 pl-8 pr-3 text-sm border rounded w-56"
            />
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-9 px-2 text-sm border rounded"
          >
            <option value="severity">重要な順</option>
            <option value="stopped">止まっている日数が長い順</option>
            <option value="runout">予約が早く尽きる順</option>
            <option value="title">店舗名順</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          判定の基準（投稿は週1回で組まれています）：
          <span className="text-red-700">要対応</span>＝最後の投稿から{DANGER_STOPPED_DAYS}
          日以上／予約が残っていない／予約時刻を過ぎても未実行／直近{RECENT_FAIL_DAYS}日以内に失敗。
          <span className="text-amber-800">注意</span>＝最後の投稿から{WARN_STOPPED_DAYS}
          日以上／予約の残りが{WARN_RUNOUT_DAYS}日分以下。
          契約が終わった店舗は、店舗マスタでステータスを休止・解約にすると、この一覧から外れます。
        </p>
      </Card>

      {/* 一覧 */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-normal min-w-64">店舗名</th>
                <th className="text-left px-3 py-2 font-normal w-20 whitespace-nowrap">状態</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">最後の投稿</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">次の予約</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">予約の残り</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">予約の最終日</th>
                <th className="text-right px-3 py-2 font-normal w-28 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    読み込み中…
                  </td>
                </tr>
              )}
              {data && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    該当する店舗はありません
                  </td>
                </tr>
              )}
              {visible.map((s) => (
                <tr key={s.locationName} className="border-t align-top hover:bg-gray-50/60">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{s.title}</div>
                    {s.reasons.length > 0 && (
                      <div
                        className={`text-xs mt-0.5 ${
                          s.level === "danger"
                            ? "text-red-700"
                            : s.level === "warn"
                              ? "text-amber-800"
                              : "text-muted-foreground"
                        }`}
                      >
                        {s.reasons.join(" ／ ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs whitespace-nowrap ${LEVEL_STYLE[s.level]}`}
                    >
                      {LEVEL_LABEL[s.level]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {s.lastPostedAt ? (
                      <>
                        {fmtDate(s.lastPostedAt)}
                        <span
                          className={`ml-2 text-xs ${
                            (s.stoppedDays ?? 0) >= DANGER_STOPPED_DAYS
                              ? "text-red-700 font-bold"
                              : (s.stoppedDays ?? 0) >= WARN_STOPPED_DAYS
                                ? "text-amber-800 font-bold"
                                : "text-muted-foreground"
                          }`}
                        >
                          {s.stoppedDays === 0 ? "今日" : `${s.stoppedDays}日前`}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">まだ投稿なし</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {s.nextScheduledFor ? (
                      fmtDateTime(s.nextScheduledFor)
                    ) : (
                      <span className="text-red-700">予約なし</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {s.pendingCount} 件
                    {s.draftCount > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        （下書き {s.draftCount}）
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {s.lastScheduledFor ? (
                      <>
                        {fmtDate(s.lastScheduledFor)}
                        <span
                          className={`ml-2 text-xs ${
                            (s.runOutDays ?? 999) <= WARN_RUNOUT_DAYS
                              ? "text-amber-800 font-bold"
                              : "text-muted-foreground"
                          }`}
                        >
                          あと{s.runOutDays}日
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => openPosts(s.locationName)}
                      className="text-xs text-[#4a90e2] border border-[#4a90e2] rounded px-2.5 py-1 hover:bg-blue-50 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      投稿を開く
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 投稿の登録が無い店舗 */}
      {data && (
        <Card className="p-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => setShowEmpty(e.target.checked)}
            />
            投稿の登録が1件も無い店舗も表示する（{data.emptyStoreCount} 件）
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            予約も投稿実績も無い店舗です。投稿の契約があるのに登録が漏れている店舗が無いかを確かめるときに使います。
          </p>
          {showEmpty && (
            <div className="mt-3 border rounded max-h-80 overflow-y-auto divide-y">
              {visibleEmpty.length === 0 && (
                <p className="text-sm text-muted-foreground p-3">
                  {loading ? "読み込み中…" : "該当する店舗はありません"}
                </p>
              )}
              {visibleEmpty.map((s) => (
                <div
                  key={s.locationName}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="truncate">{s.title}</span>
                  <button
                    onClick={() => openPosts(s.locationName)}
                    className="text-xs text-[#4a90e2] hover:underline whitespace-nowrap"
                  >
                    投稿を開く
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
