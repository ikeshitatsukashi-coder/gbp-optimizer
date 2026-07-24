"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Calendar,
  Plus,
  Trash2,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  Play,
} from "lucide-react"
import { useGbp } from "@/lib/store"

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
  createdAt: string
}

const POST_TYPE_LABELS: Record<string, string> = {
  STANDARD: "最新情報",
  EVENT: "イベント",
  OFFER: "特典",
  ALERT: "お知らせ",
}

const STATUS_LABELS: Record<string, string> = {
  pending: "予約中",
  draft: "下書き",
  posted: "投稿済",
  failed: "失敗",
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700",
  draft: "bg-gray-100 text-gray-600",
  posted: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
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

export default function ScheduledPostsPage() {
  const { locationName, locations } = useGbp()
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("pending")
  const [showModal, setShowModal] = useState(false)
  const [executing, setExecuting] = useState(false)

  // Form state
  const [formStore, setFormStore] = useState("")
  const [formDate, setFormDate] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1)
    d.setMinutes(0)
    return toDateTimeLocal(d)
  })
  const [formSummary, setFormSummary] = useState("")
  const [formPostType, setFormPostType] = useState("STANDARD")
  const [formMediaUrl, setFormMediaUrl] = useState("")
  const [formCtaType, setFormCtaType] = useState("ACTION_TYPE_UNSPECIFIED")
  const [formCtaUrl, setFormCtaUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // 自動実行の設定状態
  const [autoStatus, setAutoStatus] = useState<{
    configured: boolean
    savedBy?: string
    savedAt?: string
  } | null>(null)
  const [autoSaving, setAutoSaving] = useState(false)

  const loadAutoStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/cron/setup")
      if (res.ok) setAutoStatus(await res.json())
    } catch {
      /* noop */
    }
  }, [])

  const enableAuto = async () => {
    if (
      !confirm(
        "自動実行を有効化しますか？\n\n現在ログイン中のGoogleアカウントの権限で、期日が来た予約投稿を15分おきに自動投稿するようになります。\n※投稿権限のあるアカウント（meo-support@li-go.jp）でログインした状態で押してください。"
      )
    )
      return
    setAutoSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/cron/setup", { method: "POST" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setSuccess("自動実行を有効化しました。期日が来た予約は15分おきに自動投稿されます。")
      await loadAutoStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAutoSaving(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set("status", statusFilter)
      const res = await fetch(`/api/scheduled-posts?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setPosts(j.posts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadAutoStatus()
  }, [loadAutoStatus])

  const openModal = () => {
    setFormStore(locationName ?? "")
    setShowModal(true)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formStore || !formSummary.trim() || !formDate) {
      setError("店舗・日時・本文は必須です")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        locationName: formStore,
        scheduledFor: new Date(formDate).toISOString(),
        summary: formSummary.trim(),
        postType: formPostType,
      }
      if (formMediaUrl.trim()) body.mediaUrl = formMediaUrl.trim()
      if (formCtaType !== "ACTION_TYPE_UNSPECIFIED" && formCtaUrl.trim()) {
        body.callToAction = { actionType: formCtaType, url: formCtaUrl.trim() }
      }
      const res = await fetch("/api/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setSuccess("予約を作成しました")
      setShowModal(false)
      setFormSummary("")
      setFormMediaUrl("")
      setFormCtaUrl("")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("この予約を削除しますか？（投稿済みは削除できません）")) return
    try {
      const res = await fetch(`/api/scheduled-posts?id=${id}`, { method: "DELETE" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setPosts((prev) => prev.filter((p) => p.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleExecuteNow = async () => {
    if (
      !confirm(
        "期日が到来している予約を今すぐ実行しますか？\n（自分の Google アカウントの権限で投稿します）"
      )
    )
      return
    setExecuting(true)
    setError(null)
    try {
      const res = await fetch("/api/cron/execute-scheduled", { method: "POST" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setSuccess(`実行完了: 投稿成功 ${j.posted} 件 / 失敗 ${j.failed} 件 / 対象 ${j.processed} 件`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            自動投稿スケジューラ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            未来の日時を指定して投稿を予約。期日が来ると 15 分以内に自動投稿されます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExecuteNow}
            disabled={executing}
            variant="outline"
            size="sm"
          >
            {executing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                実行中…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                期日到来分を今すぐ実行
              </>
            )}
          </Button>
          <Button onClick={openModal}>
            <Plus className="h-4 w-4" /> 新規予約
          </Button>
        </div>
      </div>

      {/* 自動実行の状態 */}
      {autoStatus && (
        <Card
          className={`p-4 flex items-start justify-between gap-3 flex-wrap ${
            autoStatus.configured
              ? "bg-green-50 border-green-200"
              : "bg-amber-50 border-amber-300"
          }`}
        >
          <div className="text-sm">
            {autoStatus.configured ? (
              <>
                <p className="font-bold text-green-900">
                  自動実行: 有効（15分おきに期日到来分を自動投稿）
                </p>
                <p className="text-xs text-green-800 mt-0.5">
                  権限: {autoStatus.savedBy}
                  {autoStatus.savedAt &&
                    ` ／ 設定日: ${new Date(autoStatus.savedAt).toLocaleDateString("ja-JP")}`}
                  　※投稿が失敗するようになった場合は、meo-supportでログインして再度有効化してください
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-amber-900">
                  自動実行: 未設定（予約は自動では投稿されません）
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  meo-support@li-go.jp
                  でログインした状態で右のボタンを押すと、以後は期日が来た予約が15分おきに自動投稿されます。
                </p>
              </>
            )}
          </div>
          <Button onClick={enableAuto} disabled={autoSaving} size="sm" variant="outline">
            {autoSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : autoStatus.configured ? (
              "権限を更新（再有効化）"
            ) : (
              "自動実行を有効化"
            )}
          </Button>
        </Card>
      )}

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {success && (
        <Card className="p-4 bg-green-50 border-green-200 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
          <p className="text-sm text-green-800">{success}</p>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "pending", label: "予約中" },
            { key: "draft", label: "下書き" },
            { key: "posted", label: "投稿済" },
            { key: "failed", label: "失敗" },
            { key: "", label: "全て" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded border ${
                statusFilter === f.key
                  ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                  : "bg-white border-gray-300 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      )}

      {!loading && posts.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">予約がありません</p>
          <p className="text-xs mt-1">「+ 新規予約」から作成してください。</p>
        </Card>
      )}

      <div className="space-y-2">
        {posts.map((p) => (
          <Card key={p.id}>
            <div className="p-4">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <span className="text-sm font-medium">{p.storeName}</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  {POST_TYPE_LABELS[p.postType] ?? p.postType}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[p.status] ?? "bg-gray-100"}`}
                >
                  {STATUS_LABELS[p.status] ?? p.status}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  予約: {formatDateTime(p.scheduledFor)}
                </span>
                {p.executedAt && (
                  <span className="text-xs text-muted-foreground">
                    実行: {formatDateTime(p.executedAt)}
                  </span>
                )}
                {(p.status === "pending" || p.status === "draft") && (
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="ml-auto text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" /> 削除
                  </button>
                )}
              </div>

              <p className="text-sm whitespace-pre-wrap">{p.summary}</p>

              {p.callToAction?.actionType && (
                <div className="text-xs text-muted-foreground mt-2">
                  CTA: {p.callToAction.actionType} → {p.callToAction.url}
                </div>
              )}

              {p.errorMessage && (
                <div className="text-xs text-red-700 mt-2 bg-red-50 rounded p-2">
                  {p.errorMessage}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* New scheduled post modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold">新規予約</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    予約日時 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">投稿タイプ</label>
                  <select
                    value={formPostType}
                    onChange={(e) => setFormPostType(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm bg-white"
                  >
                    {Object.entries(POST_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  本文 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  required
                  rows={5}
                  maxLength={1500}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formSummary.length} / 1500
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">画像 URL（任意）</label>
                <input
                  type="url"
                  value={formMediaUrl}
                  onChange={(e) => setFormMediaUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border rounded px-3 py-2 text-sm"
                />
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
                    <option value="BOOK">予約</option>
                    <option value="ORDER">注文</option>
                    <option value="SHOP">ショップ</option>
                    <option value="LEARN_MORE">詳細</option>
                    <option value="SIGN_UP">登録</option>
                    <option value="CALL">電話</option>
                  </select>
                  {formCtaType !== "ACTION_TYPE_UNSPECIFIED" && formCtaType !== "CALL" && (
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

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  キャンセル
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> 作成中…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> 予約する
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        ※ 自動実行が有効なら、期日が来た予約は約15分以内に自動投稿されます（1回の実行で最大20件、残りは次回に処理）。急ぎの場合は「期日到来分を今すぐ実行」で即時実行できます。
      </p>
    </div>
  )
}
