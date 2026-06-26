"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, MessageCircle, Send, ExternalLink } from "lucide-react"
import { useGbp } from "@/lib/store"

interface Answer {
  name?: string
  text?: string
  author?: {
    displayName?: string
    type?: string // MERCHANT | LOCAL_GUIDE | REGULAR_USER
    profilePhotoUri?: string
  }
  upvoteCount?: number
  createTime?: string
}

interface Question {
  name?: string
  author?: {
    displayName?: string
    profilePhotoUri?: string
  }
  upvoteCount?: number
  text?: string
  createTime?: string
  updateTime?: string
  totalAnswerCount?: number
  topAnswers?: Answer[]
}

function formatDate(iso?: string): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("ja-JP")
}

export default function FaqPage() {
  const { locationName } = useGbp()
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [posting, setPosting] = useState<string | null>(null)

  const fetchQuestions = useCallback(async () => {
    if (!locationName) {
      setQuestions([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/gbp/qanda?locationName=${encodeURIComponent(locationName)}`
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`)
      const list = Array.isArray(j.questions) ? j.questions : []
      setQuestions(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setQuestions([])
    } finally {
      setLoading(false)
    }
  }, [locationName])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  const handleSubmit = async (questionName: string) => {
    const text = draft[questionName]?.trim()
    if (!text) return
    setPosting(questionName)
    try {
      const res = await fetch("/api/gbp/qanda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionName, text }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`)
      setEditing(null)
      setDraft((prev) => {
        const next = { ...prev }
        delete next[questionName]
        return next
      })
      await fetchQuestions()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(null)
    }
  }

  const findMerchantAnswer = (q: Question): Answer | undefined =>
    q.topAnswers?.find((a) => a.author?.type === "MERCHANT")

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">FAQ管理（Q&A）</h1>
      </div>

      {!locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            画面上部の店舗セレクタで店舗を選択してください。
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Q&A を取得中…
        </div>
      )}

      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800 break-all">エラー: {error}</p>
          <p className="text-xs text-red-700 mt-1">
            ※ Q&A API（mybusinessqanda.googleapis.com）が未有効化の場合は Cloud Shell で
            `gcloud services enable mybusinessqanda.googleapis.com --project=gbp-optimizer-493203` を実行してください。
          </p>
        </Card>
      )}

      {!loading && !error && locationName && questions.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">この店舗には Q&A がまだありません</p>
        </Card>
      )}

      <div className="space-y-4">
        {questions.map((q) => {
          const merchantAns = findMerchantAnswer(q)
          const others = (q.topAnswers ?? []).filter((a) => a.author?.type !== "MERCHANT")
          const isEditing = editing === q.name
          return (
            <Card key={q.name}>
              <CardContent className="p-5">
                <div className="flex items-start gap-2 mb-3">
                  <span className="font-bold text-blue-600 text-sm shrink-0">Q.</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{q.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {q.author?.displayName ?? "匿名"} ・ {formatDate(q.createTime)}
                      {(q.upvoteCount ?? 0) > 0 && ` ・ いいね ${q.upvoteCount}`}
                    </p>
                  </div>
                </div>

                {merchantAns && (
                  <div className="ml-6 mb-3 bg-green-50 border border-green-200 rounded p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-green-700 text-xs">A.（オーナー）</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(merchantAns.createTime)}
                      </span>
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{merchantAns.text}</p>
                    {!isEditing && (
                      <button
                        onClick={() => {
                          setEditing(q.name ?? null)
                          setDraft((prev) => ({ ...prev, [q.name!]: merchantAns.text ?? "" }))
                        }}
                        className="text-xs text-blue-500 hover:underline mt-2"
                      >
                        編集
                      </button>
                    )}
                  </div>
                )}

                {others.length > 0 && (
                  <div className="ml-6 mb-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      他ユーザーの回答 ({others.length})
                    </p>
                    {others.slice(0, 3).map((a, i) => (
                      <div key={a.name ?? i} className="text-xs bg-gray-50 rounded p-2 mb-1">
                        <span className="font-medium">{a.author?.displayName ?? "匿名"}:</span>{" "}
                        {a.text}
                      </div>
                    ))}
                  </div>
                )}

                {!merchantAns && !isEditing && q.name && (
                  <div className="ml-6">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(q.name ?? null)
                        setDraft((prev) => ({ ...prev, [q.name!]: "" }))
                      }}
                    >
                      オーナーとして回答する
                    </Button>
                  </div>
                )}

                {isEditing && q.name && (
                  <div className="ml-6 space-y-2">
                    <textarea
                      value={draft[q.name] ?? ""}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [q.name!]: e.target.value }))
                      }
                      rows={3}
                      placeholder="オーナーとしての回答を入力..."
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSubmit(q.name!)}
                        disabled={posting === q.name || !draft[q.name]?.trim()}
                      >
                        {posting === q.name ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            送信中…
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            投稿
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(null)
                          setDraft((prev) => {
                            const next = { ...prev }
                            delete next[q.name!]
                            return next
                          })
                        }}
                        disabled={posting === q.name}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {locationName && (
        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          新規 Q&A の作成はユーザー側からのみ可能です。ここでは届いた質問に対する「オーナーとしての回答」を管理します。
        </p>
      )}
    </div>
  )
}
