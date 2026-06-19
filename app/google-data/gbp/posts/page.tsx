"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Eye,
  MousePointer,
  Plus,
  Loader2,
  X,
  ExternalLink,
  Calendar,
  Tag,
} from "lucide-react"
import { useGbp } from "@/lib/store"

interface GbpPost {
  name: string
  languageCode?: string
  summary: string
  callToAction?: {
    actionType?: string
    url?: string
  }
  media?: { sourceUrl?: string; googleUrl?: string; mediaFormat?: string }[]
  createTime?: string
  updateTime?: string
  state?: string
  searchUrl?: string
  topicType?: string
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

function formatDate(iso?: string): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("ja-JP")
}

export default function PostsPage() {
  const { locationName } = useGbp()
  const [posts, setPosts] = useState<GbpPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  // 新規投稿フォーム state
  const [summary, setSummary] = useState("")
  const [ctaType, setCtaType] = useState("ACTION_TYPE_UNSPECIFIED")
  const [ctaUrl, setCtaUrl] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const fetchPosts = useCallback(async () => {
    if (!locationName) {
      setPosts([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/gbp/posts?locationName=${encodeURIComponent(locationName)}`
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      const list = Array.isArray(j.localPosts) ? j.localPosts : []
      setPosts(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [locationName])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const resetForm = () => {
    setSummary("")
    setCtaType("ACTION_TYPE_UNSPECIFIED")
    setCtaUrl("")
    setMediaUrl("")
    setSubmitError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!locationName) {
      setSubmitError("店舗が選択されていません。画面上部のセレクタで店舗を選んでください。")
      return
    }
    if (!summary.trim()) {
      setSubmitError("投稿本文を入力してください。")
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    // v4 LocalPost format
    const post: Record<string, unknown> = {
      languageCode: "ja",
      summary: summary.trim(),
      topicType: "STANDARD",
    }
    if (ctaType !== "ACTION_TYPE_UNSPECIFIED" && ctaUrl.trim()) {
      post.callToAction = {
        actionType: ctaType,
        url: ctaUrl.trim(),
      }
    }
    if (mediaUrl.trim()) {
      post.media = [
        {
          mediaFormat: "PHOTO",
          sourceUrl: mediaUrl.trim(),
        },
      ]
    }

    try {
      const res = await fetch("/api/gbp/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName, post }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`)
      setShowModal(false)
      resetForm()
      await fetchPosts()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">投稿</h1>
        <Button
          onClick={() => {
            resetForm()
            setShowModal(true)
          }}
          disabled={!locationName}
        >
          <Plus className="h-4 w-4" /> 新規投稿
        </Button>
      </div>

      {!locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            画面上部の店舗セレクタで店舗を選択すると、その店舗の投稿が表示されます。
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> 投稿を取得中…
        </div>
      )}

      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      {!loading && !error && locationName && posts.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <Tag className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">この店舗にはまだ投稿がありません</p>
        </Card>
      )}

      <div className="space-y-4">
        {posts.map((post) => (
          <Card key={post.name}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                    {TOPIC_LABELS[post.topicType ?? "STANDARD"] ?? post.topicType}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(post.createTime)}
                  </span>
                  {post.state && post.state !== "LIVE" && (
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      {post.state}
                    </span>
                  )}
                </div>
                {post.searchUrl && (
                  <a
                    href={post.searchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                  >
                    検索結果で見る <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              <p className="text-sm whitespace-pre-wrap mt-2">{post.summary}</p>

              {post.media && post.media.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {post.media.map((m, i) => {
                    const src = m.googleUrl || m.sourceUrl
                    return src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="h-32 rounded border object-cover"
                      />
                    ) : null
                  })}
                </div>
              )}

              {post.callToAction && (
                <div className="mt-3">
                  <a
                    href={post.callToAction.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 inline-flex items-center gap-1"
                  >
                    {CTA_LABELS[post.callToAction.actionType ?? ""] ??
                      post.callToAction.actionType}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="opacity-60">投稿 ID: {post.name?.split("/").pop()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 新規投稿モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold">新規投稿</h2>
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
                  投稿本文 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  required
                  maxLength={1500}
                  rows={6}
                  placeholder="例: 年末年始の営業時間のお知らせです。"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.length} / 1500 文字
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  CTA（行動を促すボタン）
                </label>
                <select
                  value={ctaType}
                  onChange={(e) => setCtaType(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm bg-white"
                >
                  {Object.entries(CTA_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {ctaType !== "ACTION_TYPE_UNSPECIFIED" && ctaType !== "CALL" && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    CTA リンク先 URL
                  </label>
                  <input
                    type="url"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">
                  画像 URL（任意）
                </label>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  公開URLが必要です。ローカル画像アップロードは未対応。
                </p>
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                  {submitError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  キャンセル
                </Button>
                <Button type="submit" disabled={submitting || !summary.trim()}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> 投稿中…
                    </>
                  ) : (
                    "投稿する"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
