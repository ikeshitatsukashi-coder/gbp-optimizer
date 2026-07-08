"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Plus,
  Upload,
  Download,
  Copy,
  Trash2,
  Send,
  X,
  ExternalLink,
  Image as ImageIcon,
  FileSpreadsheet,
} from "lucide-react"
import { useGbp } from "@/lib/store"
import { ImageLibraryModal } from "@/components/gbp/image-library-modal"

interface GbpPost {
  name: string
  summary?: string
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

interface UnifiedRow {
  key: string
  source: "published" | "scheduled"
  storeName: string
  postType: string
  summary: string
  imageUrl: string | null
  scheduledFor: string | null
  createdAt: string | null
  status: string
  cta: { actionType?: string; url?: string } | null
  searchUrl?: string
  scheduledId?: number
  publishedName?: string
}

const POST_TYPE_LABELS: Record<string, string> = {
  STANDARD: "最新情報",
  EVENT: "イベント",
  OFFER: "特典",
  ALERT: "お知らせ",
}

const STATUS_LABELS: Record<string, string> = {
  LIVE: "投稿済",
  posted: "投稿済",
  pending: "予約中",
  failed: "失敗",
}

const STATUS_COLORS: Record<string, string> = {
  LIVE: "bg-green-100 text-green-700",
  posted: "bg-green-100 text-green-700",
  pending: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
}

const CTA_LABELS: Record<string, string> = {
  BOOK: "予約",
  ORDER: "注文",
  SHOP: "ショップ",
  LEARN_MORE: "詳細を見る",
  SIGN_UP: "登録",
  CALL: "電話",
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ja-JP")
}

function formatDateTime(iso: string | null): string {
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

export default function PostsPage() {
  const { locationName, locations } = useGbp()
  const [published, setPublished] = useState<GbpPost[]>([])
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [imageLibraryOpen, setImageLibraryOpen] = useState(false)
  const [formStore, setFormStore] = useState("")
  const [formTopicType, setFormTopicType] = useState("STANDARD")
  const [formTiming, setFormTiming] = useState<"immediate" | "scheduled">("immediate")
  const [formScheduledFor, setFormScheduledFor] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1)
    d.setMinutes(0)
    return toDateTimeLocal(d)
  })
  const [formSummary, setFormSummary] = useState("")
  const [formMediaUrl, setFormMediaUrl] = useState("")
  const [formCtaType, setFormCtaType] = useState("ACTION_TYPE_UNSPECIFIED")
  const [formCtaUrl, setFormCtaUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Bulk operations
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadPublished = useCallback(async () => {
    if (!locationName) {
      setPublished([])
      return
    }
    const res = await fetch(
      `/api/gbp/posts?locationName=${encodeURIComponent(locationName)}`
    )
    const j = await res.json()
    if (res.ok) {
      setPublished(Array.isArray(j.localPosts) ? j.localPosts : [])
    }
  }, [locationName])

  const loadScheduled = useCallback(async () => {
    const url = locationName
      ? `/api/scheduled-posts?locationName=${encodeURIComponent(locationName)}`
      : `/api/scheduled-posts`
    const res = await fetch(url)
    const j = await res.json()
    if (res.ok) {
      setScheduled(j.posts)
    }
  }, [locationName])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadPublished(), loadScheduled()])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [loadPublished, loadScheduled])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Unified rows for the table
  const rows: UnifiedRow[] = useMemo(() => {
    const currentStoreTitle =
      locations.find((l) => l.name === locationName)?.title ?? ""
    const p: UnifiedRow[] = published.map((post) => ({
      key: `p:${post.name}`,
      source: "published",
      storeName: currentStoreTitle,
      postType: post.topicType ?? "STANDARD",
      summary: post.summary ?? "",
      imageUrl: post.media?.[0]?.googleUrl || post.media?.[0]?.sourceUrl || null,
      scheduledFor: post.createTime ?? null,
      createdAt: post.createTime ?? null,
      status: post.state ?? "LIVE",
      cta: post.callToAction ?? null,
      searchUrl: post.searchUrl,
      publishedName: post.name,
    }))
    const s: UnifiedRow[] = scheduled.map((sp) => ({
      key: `s:${sp.id}`,
      source: "scheduled",
      storeName: sp.storeName,
      postType: sp.postType,
      summary: sp.summary,
      imageUrl: sp.mediaUrls?.[0] ?? null,
      scheduledFor: sp.scheduledFor,
      createdAt: sp.executedAt ?? null,
      status: sp.status,
      cta: sp.callToAction ?? null,
      scheduledId: sp.id,
    }))
    return [...s, ...p].sort((a, b) => {
      const da = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
      const db = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
      return db - da
    })
  }, [published, scheduled, locationName, locations])

  const resetForm = () => {
    setFormStore(locationName ?? "")
    setFormTopicType("STANDARD")
    setFormTiming("immediate")
    const d = new Date()
    d.setHours(d.getHours() + 1)
    d.setMinutes(0)
    setFormScheduledFor(toDateTimeLocal(d))
    setFormSummary("")
    setFormMediaUrl("")
    setFormCtaType("ACTION_TYPE_UNSPECIFIED")
    setFormCtaUrl("")
    setError(null)
  }

  const openNewModal = () => {
    resetForm()
    setShowModal(true)
  }

  const openDuplicate = (row: UnifiedRow) => {
    resetForm()
    // 同店舗にコピー、日時は即時、種類・本文・画像・CTA はコピー
    setFormStore(locationName ?? "")
    setFormTopicType(row.postType)
    setFormSummary(row.summary)
    setFormMediaUrl(row.imageUrl ?? "")
    if (row.cta?.actionType) {
      setFormCtaType(row.cta.actionType)
      setFormCtaUrl(row.cta.url ?? "")
    }
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formStore || !formSummary.trim()) {
      setError("店舗・本文は必須です")
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    const callToAction =
      formCtaType !== "ACTION_TYPE_UNSPECIFIED" && formCtaUrl.trim()
        ? { actionType: formCtaType, url: formCtaUrl.trim() }
        : undefined

    try {
      if (formTiming === "immediate") {
        // 即時: /api/gbp/posts (v4 直接)
        const post: Record<string, unknown> = {
          languageCode: "ja",
          summary: formSummary.trim(),
          topicType: formTopicType,
        }
        if (callToAction) post.callToAction = callToAction
        if (formMediaUrl.trim()) {
          post.media = [
            { mediaFormat: "PHOTO", sourceUrl: formMediaUrl.trim() },
          ]
        }
        const res = await fetch("/api/gbp/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationName: formStore, post }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`)
        setSuccess("投稿しました")
      } else {
        // 予約: /api/scheduled-posts
        const body: Record<string, unknown> = {
          locationName: formStore,
          scheduledFor: new Date(formScheduledFor).toISOString(),
          summary: formSummary.trim(),
          postType: formTopicType,
        }
        if (formMediaUrl.trim()) body.mediaUrl = formMediaUrl.trim()
        if (callToAction) body.callToAction = callToAction
        const res = await fetch("/api/scheduled-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`)
        setSuccess("予約を作成しました")
      }
      setShowModal(false)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
      setTimeout(() => setSuccess(null), 4000)
    }
  }

  const handleDeleteScheduled = async (id: number) => {
    if (!confirm("この予約を削除しますか？")) return
    try {
      const res = await fetch(`/api/scheduled-posts?id=${id}`, { method: "DELETE" })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      }
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(`s:${id}`)
        return next
      })
      await loadScheduled()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDeleteSelected = async () => {
    const scheduledIds = Array.from(selected)
      .filter((k) => k.startsWith("s:"))
      .map((k) => parseInt(k.slice(2), 10))
    if (scheduledIds.length === 0) {
      setError("削除できる予約が選択されていません（投稿済みは削除不可）")
      return
    }
    if (!confirm(`${scheduledIds.length} 件の予約を削除しますか？`)) return
    let deleted = 0
    for (const id of scheduledIds) {
      const res = await fetch(`/api/scheduled-posts?id=${id}`, { method: "DELETE" })
      if (res.ok) deleted++
    }
    setSuccess(`${deleted} 件削除しました`)
    setSelected(new Set())
    await loadScheduled()
  }

  const handleDownload = async () => {
    try {
      const res = await fetch("/api/scheduled-posts/import")
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `scheduled-posts-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleTemplate = async () => {
    const res = await fetch("/api/scheduled-posts/import?template=1")
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "scheduled-posts-template.xlsx"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError(null)
    setSuccess(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/scheduled-posts/import", {
        method: "POST",
        body: formData,
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setSuccess(
        `インポート完了: 登録 ${j.inserted} / ${j.totalRows} 件${
          j.errors.length ? ` / エラー ${j.errors.length} 件` : ""
        }`
      )
      if (j.errors.length > 0) {
        const errorSummary = j.errors
          .slice(0, 3)
          .map((e: { rowIndex: number; error: string }) => `行${e.rowIndex}: ${e.error}`)
          .join("\n")
        setError(
          `一部エラー:\n${errorSummary}${
            j.errors.length > 3 ? `\n...他 ${j.errors.length - 3} 件` : ""
          }`
        )
      }
      await loadScheduled()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const toggleSelectAll = () => {
    // 予約のみ選択対象
    const selectable = rows.filter((r) => r.source === "scheduled").map((r) => r.key)
    if (selected.size === selectable.length && selectable.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectable))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">投稿一覧｜Googleビジネスプロフィール</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Googleビジネスプロフィールに表示する投稿の一覧です。
        </p>
      </div>

      <div className="text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded p-3 space-y-1">
        <p>投稿する場合は「新規投稿」ボタンをクリックしてください（1店舗ずつ）。</p>
        <p>
          複数店舗分をまとめて予約する場合は、「EXCELテンプレート」をダウンロード → 記入
          → 「投稿一括インポート」で読み込み。実行は自動投稿スケジューラで各予約が個別に実行されます。
        </p>
        <p className="text-xs">
          ※ 1時間以内の連続投稿はお控えください。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800 whitespace-pre-wrap">{error}</p>
        </Card>
      )}
      {success && (
        <Card className="p-4 bg-green-50 border-green-200">
          <p className="text-sm text-green-800">{success}</p>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTemplate}
            title="空のテンプレートをダウンロード"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> テンプレート
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" /> 全予約ダウンロード
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            投稿一括インポート
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <div className="flex-1" />
          <Button onClick={openNewModal} disabled={!locationName}>
            <Plus className="h-4 w-4" /> 新規投稿
          </Button>
        </div>
      </Card>

      {selected.size > 0 && (
        <Card className="p-3 bg-yellow-50 border-yellow-200">
          <div className="flex items-center gap-2">
            <span className="text-sm">{selected.size} 件選択中</span>
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="h-3.5 w-3.5" /> 選択した予約を削除
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              解除
            </Button>
          </div>
        </Card>
      )}

      {!locationName && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            画面上部の店舗セレクタで店舗を選択すると、その店舗の投稿一覧が表示されます。
            （予約投稿は全店舗の予約が表示されます）
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    onChange={toggleSelectAll}
                    checked={
                      rows.filter((r) => r.source === "scheduled").length > 0 &&
                      selected.size ===
                        rows.filter((r) => r.source === "scheduled").length
                    }
                    className="h-3.5 w-3.5"
                  />
                </th>
                <th className="text-left px-2 py-2 font-medium">画像</th>
                <th className="text-left px-3 py-2 font-medium">種別</th>
                <th className="text-left px-3 py-2 font-medium">本文</th>
                <th className="text-left px-3 py-2 font-medium">店舗</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">投稿日時</th>
                <th className="text-left px-3 py-2 font-medium">ステータス</th>
                <th className="text-left px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">
                    投稿がありません
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.key} className="border-t hover:bg-muted/30">
                  <td className="px-2 py-2 text-center">
                    {r.source === "scheduled" ? (
                      <input
                        type="checkbox"
                        checked={selected.has(r.key)}
                        onChange={() => toggleSelected(r.key)}
                        className="h-3.5 w-3.5"
                      />
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-gray-400" />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded whitespace-nowrap">
                      {POST_TYPE_LABELS[r.postType] ?? r.postType}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-md">
                    <div className="text-sm truncate" title={r.summary}>
                      {r.summary}
                    </div>
                    {r.cta?.actionType && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        CTA: {CTA_LABELS[r.cta.actionType] ?? r.cta.actionType}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.storeName}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {formatDateTime(r.scheduledFor)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[r.status] ?? "bg-gray-100"} whitespace-nowrap`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openDuplicate(r)}
                        className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 flex items-center gap-1"
                        title="複製"
                      >
                        <Copy className="h-3 w-3" /> 複製
                      </button>
                      {r.source === "scheduled" && r.status === "pending" && (
                        <button
                          onClick={() => handleDeleteScheduled(r.scheduledId!)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 flex items-center gap-1"
                          title="削除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                      {r.searchUrl && (
                        <a
                          href={r.searchUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                          title="Google で表示"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 新規投稿モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold">新規投稿</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Topic tabs */}
              <div className="flex border-b">
                {(
                  [
                    { key: "STANDARD", label: "最新情報" },
                    { key: "OFFER", label: "特典" },
                    { key: "EVENT", label: "イベント" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setFormTopicType(t.key)}
                    className={`px-4 py-2 text-sm border-b-2 -mb-px ${
                      formTopicType === t.key
                        ? "border-blue-500 text-blue-600 font-medium"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  店舗 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formStore}
                  onChange={(e) => setFormStore(e.target.value)}
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
                <label className="block text-sm font-medium mb-1">投稿日時</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={formTiming === "immediate"}
                      onChange={() => setFormTiming("immediate")}
                    />
                    即時投稿
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={formTiming === "scheduled"}
                        onChange={() => setFormTiming("scheduled")}
                      />
                      予約
                    </label>
                    <input
                      type="datetime-local"
                      value={formScheduledFor}
                      onChange={(e) => setFormScheduledFor(e.target.value)}
                      disabled={formTiming !== "scheduled"}
                      className="border rounded px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  投稿内容 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  required
                  rows={6}
                  maxLength={1500}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formSummary.length} / 1500 文字
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">画像</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setImageLibraryOpen(true)}
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> 画像を選択
                  </Button>
                  {formMediaUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={formMediaUrl}
                        alt=""
                        className="w-12 h-12 rounded object-cover border"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setFormMediaUrl("")}
                      >
                        <X className="h-3 w-3" /> 解除
                      </Button>
                    </>
                  )}
                </div>
                {formMediaUrl && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {formMediaUrl}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">CTA（任意）</label>
                <div className="flex gap-2">
                  <select
                    value={formCtaType}
                    onChange={(e) => setFormCtaType(e.target.value)}
                    className="border rounded px-2 py-2 text-sm bg-white"
                  >
                    <option value="ACTION_TYPE_UNSPECIFIED">なし</option>
                    {Object.entries(CTA_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {formCtaType !== "ACTION_TYPE_UNSPECIFIED" &&
                    formCtaType !== "CALL" && (
                      <input
                        type="url"
                        value={formCtaUrl}
                        onChange={(e) => setFormCtaUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 border rounded px-3 py-2 text-sm"
                      />
                    )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t sticky bottom-0 bg-white pb-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  キャンセル
                </Button>
                <Button type="submit" disabled={submitting || !formSummary.trim()}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {formTiming === "immediate" ? "投稿中…" : "予約中…"}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {formTiming === "immediate" ? "投稿する" : "予約する"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ImageLibraryModal
        isOpen={imageLibraryOpen}
        onClose={() => setImageLibraryOpen(false)}
        locationName={formStore || locationName}
        onSelect={(url) => setFormMediaUrl(url)}
      />
    </div>
  )
}
