"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Plus,
  Loader2,
  X,
  ExternalLink,
  Upload,
  Download,
  Search,
  Trash2,
  ImagePlus,
  ChevronDown,
  FileSpreadsheet,
  Send,
  Clock,
} from "lucide-react"
import { useGbp } from "@/lib/store"
import { ImagePicker } from "@/components/image-picker"

/* -------------------------------------------------------------------------- */
/*                                   Types                                     */
/* -------------------------------------------------------------------------- */

interface GbpPost {
  name: string
  summary: string
  callToAction?: { actionType?: string; url?: string }
  media?: { sourceUrl?: string; googleUrl?: string }[]
  createTime?: string
  state?: string
  searchUrl?: string
  topicType?: string
}

interface ScheduledPost {
  id: number
  locationName: string
  storeName: string
  scheduledFor: string
  postType: string
  summary: string
  mediaUrls: string[] | null
  callToAction: { actionType?: string; url?: string } | null
  status: string
  executedAt: string | null
  errorMessage: string | null
}

type Row =
  | {
      kind: "live"
      key: string
      postType: string
      summary: string
      image?: string
      storeTitle: string
      date?: string
      status: string
      searchUrl?: string
    }
  | {
      kind: "scheduled"
      key: string
      id: number
      postType: string
      summary: string
      image?: string
      storeTitle: string
      date?: string
      status: string
      errorMessage?: string | null
    }

const TOPIC_LABELS: Record<string, string> = {
  STANDARD: "最新情報",
  EVENT: "イベント",
  OFFER: "特典",
  ALERT: "お知らせ",
  PRODUCT: "商品",
}

const CTA_LABELS: Record<string, string> = {
  ACTION_TYPE_UNSPECIFIED: "なし",
  BOOK: "予約",
  ORDER: "注文",
  SHOP: "ショップ",
  LEARN_MORE: "詳細を見る",
  SIGN_UP: "登録",
  CALL: "電話",
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  LIVE: { label: "投稿済", cls: "text-green-700" },
  posted: { label: "投稿済", cls: "text-green-700" },
  pending: { label: "予約中", cls: "text-blue-600" },
  failed: { label: "失敗", cls: "text-red-600" },
}

function formatDate(iso?: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* -------------------------------------------------------------------------- */
/*                                    Page                                     */
/* -------------------------------------------------------------------------- */

export default function PostsPage() {
  const { locationName, locations } = useGbp()
  const storeTitle = useMemo(
    () => locations.find((l) => l.name === locationName)?.title ?? "",
    [locations, locationName]
  )

  const [livePosts, setLivePosts] = useState<GbpPost[]>([])
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importMenuOpen, setImportMenuOpen] = useState(false)

  /* ------------------------------ data loading ---------------------------- */

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const reqs: Promise<void>[] = []

      if (locationName) {
        reqs.push(
          fetch(`/api/gbp/posts?locationName=${encodeURIComponent(locationName)}`)
            .then((r) => r.json())
            .then((j) => {
              setLivePosts(Array.isArray(j.localPosts) ? j.localPosts : [])
            })
            .catch(() => setLivePosts([]))
        )
      } else {
        setLivePosts([])
      }

      const schedUrl = locationName
        ? `/api/scheduled-posts?locationName=${encodeURIComponent(locationName)}`
        : `/api/scheduled-posts`
      reqs.push(
        fetch(schedUrl)
          .then((r) => r.json())
          .then((j) => {
            setScheduled(Array.isArray(j.posts) ? j.posts : [])
          })
          .catch(() => setScheduled([]))
      )

      await Promise.all(reqs)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [locationName])

  useEffect(() => {
    load()
  }, [load])

  /* -------------------------------- rows ---------------------------------- */

  const rows: Row[] = useMemo(() => {
    const live: Row[] = livePosts.map((p) => ({
      kind: "live" as const,
      key: p.name,
      postType: p.topicType ?? "STANDARD",
      summary: p.summary ?? "",
      image: p.media?.[0]?.googleUrl || p.media?.[0]?.sourceUrl,
      storeTitle,
      date: p.createTime,
      status: "LIVE",
      searchUrl: p.searchUrl,
    }))

    const sched: Row[] = scheduled.map((s) => ({
      kind: "scheduled" as const,
      key: `s-${s.id}`,
      id: s.id,
      postType: s.postType,
      summary: s.summary,
      image: s.mediaUrls?.[0],
      storeTitle: s.storeName,
      date: s.scheduledFor,
      status: s.status,
      errorMessage: s.errorMessage,
    }))

    const all = [...sched, ...live]
    const q = query.trim().toLowerCase()
    const filtered = q
      ? all.filter(
          (r) =>
            r.summary.toLowerCase().includes(q) ||
            r.storeTitle.toLowerCase().includes(q)
        )
      : all

    return filtered.sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0
      const tb = b.date ? new Date(b.date).getTime() : 0
      return tb - ta
    })
  }, [livePosts, scheduled, storeTitle, query])

  const pendingIds = useMemo(
    () =>
      rows
        .filter((r) => r.kind === "scheduled" && r.status === "pending")
        .map((r) => (r as Extract<Row, { kind: "scheduled" }>).id),
    [rows]
  )

  /* ------------------------------ bulk delete ----------------------------- */

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === pendingIds.length ? new Set() : new Set(pendingIds)
    )
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`選択した ${selectedIds.size} 件の予約を削除しますか？`)) return
    setError(null)
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/scheduled-posts?id=${id}`, { method: "DELETE" })
        )
      )
      setSelectedIds(new Set())
      setSuccess("選択した予約を削除しました")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  const handleDeleteOne = async (id: number) => {
    if (!confirm("この予約を削除しますか？")) return
    try {
      const res = await fetch(`/api/scheduled-posts?id=${id}`, { method: "DELETE" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /* -------------------------------- render -------------------------------- */

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">投稿一覧 ｜ Google ビジネスプロフィール</h1>
          <p className="text-sm text-muted-foreground mt-1">
            画面上部の店舗を選ぶと、その店舗の投稿・予約が表示されます。「新規投稿」で今すぐ投稿・予約投稿、「一括インポート」でまとめて予約できます。
          </p>
        </div>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}
      {success && (
        <Card className="p-4 bg-green-50 border-green-200">
          <p className="text-sm text-green-800">{success}</p>
        </Card>
      )}

      {/* toolbar */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="本文・店舗名で検索"
              className="w-full border rounded pl-8 pr-3 py-2 text-sm"
            />
          </div>

          {/* 一括インポート dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setImportMenuOpen(false), 150)}
            >
              <Upload className="h-4 w-4" /> 投稿一括インポート
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {importMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white border rounded-md shadow-lg z-20 py-1">
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                  onMouseDown={() => {
                    setShowImport(true)
                    setImportMenuOpen(false)
                  }}
                >
                  <Upload className="h-4 w-4 text-gray-500" /> ファイル（CSV / Excel）
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                  onMouseDown={() => {
                    setShowImport(true)
                    setImportMenuOpen(false)
                  }}
                >
                  <FileSpreadsheet className="h-4 w-4 text-gray-500" /> スプレッドシート連携
                </button>
              </div>
            )}
          </div>

          <a href="/api/gbp/posts/template" download>
            <Button variant="outline" size="sm" type="button">
              <Download className="h-4 w-4" /> テンプレDL
            </Button>
          </a>

          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> 新規投稿
          </Button>
        </div>
      </Card>

      {/* bulk bar */}
      {pendingIds.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === pendingIds.length}
              onChange={toggleSelectAll}
            />
            一括選択（予約中のみ）
          </label>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedIds.size === 0}
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> 削除 ({selectedIds.size})
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      )}

      {/* table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-3 text-left w-10"></th>
                <th className="px-3 py-3 text-left">画像</th>
                <th className="px-3 py-3 text-left">投稿タイプ</th>
                <th className="px-3 py-3 text-left">本文</th>
                <th className="px-3 py-3 text-left">店舗名</th>
                <th className="px-3 py-3 text-left">投稿日時</th>
                <th className="px-3 py-3 text-left">ステータス</th>
                <th className="px-3 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-gray-400">
                    投稿・予約がありません。「新規投稿」または「投稿一括インポート」から作成してください。
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const st = STATUS_STYLE[r.status] ?? { label: r.status, cls: "text-gray-600" }
                const isSched = r.kind === "scheduled"
                const schedId = isSched ? (r as Extract<Row, { kind: "scheduled" }>).id : null
                const canSelect = isSched && r.status === "pending"
                return (
                  <tr key={r.key} className="hover:bg-gray-50/60">
                    <td className="px-3 py-3 align-top">
                      {canSelect && schedId !== null && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(schedId)}
                          onChange={() => toggleSelect(schedId)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {r.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.image}
                          alt=""
                          className="h-12 w-12 rounded border object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded border bg-gray-50" />
                      )}
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {TOPIC_LABELS[r.postType] ?? r.postType}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top max-w-md">
                      <p className="line-clamp-2 whitespace-pre-wrap">{r.summary}</p>
                      {isSched && r.errorMessage && (
                        <p className="text-xs text-red-600 mt-1">{r.errorMessage}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">{r.storeTitle || "—"}</td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      <span className={`text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      {r.kind === "live" && r.searchUrl && (
                        <a
                          href={r.searchUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
                        >
                          表示 <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {canSelect && schedId !== null && (
                        <button
                          onClick={() => handleDeleteOne(schedId)}
                          className="text-xs text-red-500 hover:text-red-700 inline-flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> 削除
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showNew && (
        <NewPostModal
          onClose={() => setShowNew(false)}
          onDone={(msg) => {
            setShowNew(false)
            setSuccess(msg)
            setTimeout(() => setSuccess(null), 4000)
            load()
          }}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={(msg) => {
            setSuccess(msg)
            setTimeout(() => setSuccess(null), 5000)
            load()
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                              New Post Modal                                 */
/* -------------------------------------------------------------------------- */

function NewPostModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const { locationName, locations } = useGbp()
  const [store, setStore] = useState(locationName ?? "")
  const [postType, setPostType] = useState("STANDARD")
  const [summary, setSummary] = useState("")
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [ctaType, setCtaType] = useState("ACTION_TYPE_UNSPECIFIED")
  const [ctaUrl, setCtaUrl] = useState("")
  const [mode, setMode] = useState<"now" | "schedule">("now")
  const [scheduledFor, setScheduledFor] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1, 0, 0, 0)
    return toDateTimeLocal(d)
  })
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const addImage = (url: string) => {
    setMediaUrls((prev) => (prev.includes(url) ? prev : [...prev, url]))
  }
  const removeImage = (url: string) =>
    setMediaUrls((prev) => prev.filter((u) => u !== url))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!store) return setErr("店舗を選択してください。")
    if (!summary.trim()) return setErr("本文を入力してください。")
    setSubmitting(true)
    setErr(null)

    const cta =
      ctaType !== "ACTION_TYPE_UNSPECIFIED" && (ctaType === "CALL" || ctaUrl.trim())
        ? { actionType: ctaType, url: ctaUrl.trim() }
        : null

    try {
      if (mode === "now") {
        const post: Record<string, unknown> = {
          languageCode: "ja",
          summary: summary.trim(),
          topicType: postType,
        }
        if (cta) post.callToAction = cta
        if (mediaUrls.length > 0) {
          post.media = mediaUrls.map((u) => ({ mediaFormat: "PHOTO", sourceUrl: u }))
        }
        const res = await fetch("/api/gbp/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationName: store, post }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`)
        onDone("投稿しました")
      } else {
        const body: Record<string, unknown> = {
          locationName: store,
          scheduledFor: new Date(scheduledFor).toISOString(),
          summary: summary.trim(),
          postType,
        }
        if (mediaUrls.length > 0) body.mediaUrls = mediaUrls
        if (cta) body.callToAction = cta
        const res = await fetch("/api/scheduled-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
        onDone("予約を作成しました")
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">新規投稿</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              店舗 <span className="text-red-500">*</span>
            </label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              required
              className="w-full border rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">選択してください</option>
              {locations.map((l) => (
                <option key={l.name} value={l.name}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">投稿タイプ</label>
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm bg-white"
            >
              {Object.entries(TOPIC_LABELS)
                .filter(([k]) => k !== "PRODUCT")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              本文 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              maxLength={1500}
              rows={5}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="例: 年末年始の営業時間のお知らせです。"
            />
            <p className="text-xs text-muted-foreground mt-1">{summary.length} / 1500</p>
          </div>

          {/* images */}
          <div>
            <label className="block text-sm font-medium mb-1">画像</label>
            <div className="flex flex-wrap gap-2">
              {mediaUrls.map((u) => (
                <div key={u} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-16 w-16 rounded border object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(u)}
                    className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5 text-gray-500 hover:text-red-600 shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="h-16 w-16 rounded border border-dashed flex flex-col items-center justify-center text-gray-400 hover:border-blue-300 hover:text-blue-500"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[10px] mt-0.5">追加</span>
              </button>
            </div>
          </div>

          {/* CTA */}
          <div>
            <label className="block text-sm font-medium mb-1">CTA（任意）</label>
            <div className="flex gap-2">
              <select
                value={ctaType}
                onChange={(e) => setCtaType(e.target.value)}
                className="border rounded px-2 py-2 text-sm bg-white"
              >
                {Object.entries(CTA_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {ctaType !== "ACTION_TYPE_UNSPECIFIED" && ctaType !== "CALL" && (
                <input
                  type="url"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 border rounded px-3 py-2 text-sm"
                />
              )}
            </div>
          </div>

          {/* schedule */}
          <div>
            <label className="block text-sm font-medium mb-1">投稿方法</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setMode("now")}
                className={`flex-1 border rounded px-3 py-2 text-sm inline-flex items-center justify-center gap-1 ${
                  mode === "now" ? "bg-blue-50 border-blue-400 text-blue-700" : "bg-white"
                }`}
              >
                <Send className="h-3.5 w-3.5" /> 今すぐ投稿
              </button>
              <button
                type="button"
                onClick={() => setMode("schedule")}
                className={`flex-1 border rounded px-3 py-2 text-sm inline-flex items-center justify-center gap-1 ${
                  mode === "schedule" ? "bg-blue-50 border-blue-400 text-blue-700" : "bg-white"
                }`}
              >
                <Clock className="h-3.5 w-3.5" /> 予約投稿
              </button>
            </div>
            {mode === "schedule" && (
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            )}
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              キャンセル
            </Button>
            <Button type="submit" disabled={submitting || !summary.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "now" ? "投稿中…" : "作成中…"}
                </>
              ) : mode === "now" ? (
                "投稿する"
              ) : (
                "予約する"
              )}
            </Button>
          </div>
        </form>
      </div>

      <ImagePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={addImage}
        selected={mediaUrls}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                               Import Modal                                  */
/* -------------------------------------------------------------------------- */

interface ImportResult {
  created: number
  skipped: number
  total: number
  errors: { rowNumber: number; message: string }[]
}

function ImportModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [tab, setTab] = useState<"file" | "sheet">("file")
  const [sheetUrl, setSheetUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const runFile = async (file: File) => {
    setSubmitting(true)
    setErr(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/gbp/posts/import", { method: "POST", body: form })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setResult(j)
      if (j.created > 0) onDone(`${j.created} 件を予約登録しました`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const runSheet = async () => {
    if (!sheetUrl.trim()) return setErr("スプレッドシートの URL を入力してください。")
    setSubmitting(true)
    setErr(null)
    setResult(null)
    try {
      const res = await fetch("/api/gbp/posts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: sheetUrl.trim() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setResult(j)
      if (j.created > 0) onDone(`${j.created} 件を予約登録しました`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">投稿一括インポート</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            取り込んだ行は「予約投稿」として登録されます（投稿日時が空の行はすぐ投稿対象になります）。まず「テンプレDL」で雛形を取得し、店舗ID・本文・投稿日時などを入力してください。
          </p>

          <div className="flex gap-4 border-b">
            <button
              onClick={() => setTab("file")}
              className={`py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === "file" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500"
              }`}
            >
              ファイル（CSV / Excel）
            </button>
            <button
              onClick={() => setTab("sheet")}
              className={`py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === "sheet" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500"
              }`}
            >
              スプレッドシート連携
            </button>
          </div>

          {tab === "file" && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) runFile(f)
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={submitting}
                className="w-full border-2 border-dashed rounded-lg py-10 flex flex-col items-center justify-center text-gray-500 hover:border-blue-300"
              >
                {submitting ? (
                  <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-blue-300 mb-2" />
                    <span className="text-sm">CSV / Excel ファイルを選択</span>
                  </>
                )}
              </button>
            </div>
          )}

          {tab === "sheet" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Google スプレッドシートの URL
              </label>
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                対象シートを「リンクを知っている全員が閲覧可」で共有してください。1
                行目はテンプレDLと同じ見出し行にしてください。
              </p>
              <Button type="button" onClick={runSheet} disabled={submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> 取り込み中…
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" /> 取り込む
                  </>
                )}
              </Button>
            </div>
          )}

          {err && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {err}
            </div>
          )}

          {result && (
            <div className="bg-gray-50 border rounded p-3 text-sm space-y-2">
              <p className="font-medium">
                取り込み完了: 登録 {result.created} 件 / スキップ {result.skipped} 件
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto text-xs text-red-700 space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i}>
                      {e.rowNumber} 行目: {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
