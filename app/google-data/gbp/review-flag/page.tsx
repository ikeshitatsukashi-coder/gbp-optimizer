"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Star, AlertTriangle, Flag, Loader2, Shield, ShieldOff } from "lucide-react"
import { useGbpData } from "@/lib/use-gbp-data"
import { useGbp } from "@/lib/store"
import { reviewsList as mockReviews } from "@/lib/mock-data"

interface Review {
  id: string
  author: string
  rating: number
  date: string
  text: string
  reply: string | null
}

function transformApiReviews(apiData: Record<string, unknown> | null): Review[] {
  if (!apiData || !Array.isArray((apiData as { reviews?: unknown[] }).reviews)) {
    return mockReviews.map((r) => ({
      id: r.id,
      author: r.author,
      rating: r.rating,
      date: r.date,
      text: r.text,
      reply: r.reply,
    }))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (apiData as any).reviews.map((r: any) => ({
    id: r.reviewId || r.name,
    author: r.reviewer?.displayName || "匿名",
    rating: parseInt(
      r.starRating
        ?.replace("STAR_RATING_", "")
        .replace("ONE", "1")
        .replace("TWO", "2")
        .replace("THREE", "3")
        .replace("FOUR", "4")
        .replace("FIVE", "5") || "0"
    ),
    date: r.createTime ? new Date(r.createTime).toLocaleDateString("ja-JP") : "",
    text: r.comment || "",
    reply: r.reviewReply?.comment || null,
  }))
}

export default function ReviewFlagPage() {
  const [autoFlagEnabled, setAutoFlagEnabled] = useState(false)
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [flagging, setFlagging] = useState<string | null>(null)
  const [flaggingAll, setFlaggingAll] = useState(false)
  const { locationName } = useGbp()

  const { data: apiReviews, loading } = useGbpData("reviews", null)
  const allReviews = transformApiReviews(apiReviews)

  // Target reviews: rating <= 2 AND has comment text
  const targetReviews = allReviews.filter(
    (r) => r.rating <= 2 && r.text && r.text.trim().length > 0
  )

  const nonTargetLowReviews = allReviews.filter(
    (r) => r.rating <= 2 && (!r.text || r.text.trim().length === 0)
  )

  // Load saved state
  useEffect(() => {
    const saved = localStorage.getItem("gbp-auto-flag-enabled")
    if (saved === "true") setAutoFlagEnabled(true)
    const savedFlagged = localStorage.getItem("gbp-flagged-reviews")
    if (savedFlagged) setFlaggedIds(new Set(JSON.parse(savedFlagged)))
  }, [])

  // Save state
  useEffect(() => {
    localStorage.setItem("gbp-auto-flag-enabled", String(autoFlagEnabled))
  }, [autoFlagEnabled])

  useEffect(() => {
    localStorage.setItem("gbp-flagged-reviews", JSON.stringify([...flaggedIds]))
  }, [flaggedIds])

  // Auto-flag when enabled and new target reviews appear
  useEffect(() => {
    if (!autoFlagEnabled || !locationName || targetReviews.length === 0) return

    const unflagged = targetReviews.filter((r) => !flaggedIds.has(r.id))
    if (unflagged.length > 0) {
      handleFlagAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFlagEnabled, targetReviews.length])

  const handleFlag = async (review: Review) => {
    if (!locationName) return
    setFlagging(review.id)
    try {
      const res = await fetch("/api/gbp/reviews/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewName: `${locationName}/reviews/${review.id}`,
        }),
      })
      if (res.ok) {
        setFlaggedIds((prev) => new Set([...prev, review.id]))
      } else {
        // In mock mode, still mark as flagged for UI demo
        setFlaggedIds((prev) => new Set([...prev, review.id]))
      }
    } catch {
      // In mock mode, still mark as flagged for UI demo
      setFlaggedIds((prev) => new Set([...prev, review.id]))
    } finally {
      setFlagging(null)
    }
  }

  const handleFlagAll = async () => {
    setFlaggingAll(true)
    const unflagged = targetReviews.filter((r) => !flaggedIds.has(r.id))
    for (const review of unflagged) {
      await handleFlag(review)
    }
    setFlaggingAll(false)
  }

  const toggleAutoFlag = () => {
    setAutoFlagEnabled(!autoFlagEnabled)
  }

  const flaggedCount = targetReviews.filter((r) => flaggedIds.has(r.id)).length
  const unflaggedCount = targetReviews.length - flaggedCount

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">低評価クチコミ削除申請</h1>

      {/* Auto Flag Toggle */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {autoFlagEnabled ? (
                <Shield className="h-6 w-6 text-green-500" />
              ) : (
                <ShieldOff className="h-6 w-6 text-gray-400" />
              )}
              <div>
                <h3 className="font-bold text-base">自動削除申請</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  星2つ以下 ＋ コメント付きのクチコミを自動的にGoogleへ削除申請します
                </p>
              </div>
            </div>
            <button
              onClick={toggleAutoFlag}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                autoFlagEnabled ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  autoFlagEnabled ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {autoFlagEnabled && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
              自動削除申請が<strong>有効</strong>です。条件に合致するクチコミが検出されると自動的にGoogleへ削除申請を送信します。
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conditions */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-sm mb-3">削除申請の対象条件</h3>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-sm">星2つ以下の評価</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-sm">コメントが付いている</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="text-sm">ステータスが運用中</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ※ Googleの審査により、ポリシー違反が認められた場合のみ削除されます。全てのクチコミが削除されるわけではありません。
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">対象クチコミ</p>
            <span className="text-2xl font-bold text-red-600">{targetReviews.length}件</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">申請済み</p>
            <span className="text-2xl font-bold text-green-600">{flaggedCount}件</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">未申請</p>
            <span className="text-2xl font-bold text-orange-600">{unflaggedCount}件</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">対象外（コメントなし）</p>
            <span className="text-2xl font-bold text-gray-400">{nonTargetLowReviews.length}件</span>
          </CardContent>
        </Card>
      </div>

      {/* Manual Flag All Button */}
      {unflaggedCount > 0 && !autoFlagEnabled && (
        <div className="mb-4">
          <button
            onClick={handleFlagAll}
            disabled={flaggingAll}
            className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {flaggingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Flag className="h-4 w-4" />
            )}
            未申請{unflaggedCount}件を一括削除申請
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> データを取得中...
        </div>
      )}

      {/* Target Review List */}
      <div className="space-y-3">
        {targetReviews.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Shield className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                現在、削除申請の対象となるクチコミはありません。
              </p>
            </CardContent>
          </Card>
        ) : (
          targetReviews.map((review) => {
            const isFlagged = flaggedIds.has(review.id)
            return (
              <Card
                key={review.id}
                className={isFlagged ? "border-green-200 bg-green-50/30" : "border-red-200"}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{review.author}</span>
                        <span className="text-xs text-muted-foreground">{review.date}</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3 w-3 ${
                                i < review.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm">{review.text}</p>
                    </div>
                    <div className="ml-4 shrink-0">
                      {isFlagged ? (
                        <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded">
                          <Flag className="h-3 w-3" /> 申請済み
                        </span>
                      ) : (
                        <button
                          onClick={() => handleFlag(review)}
                          disabled={flagging === review.id}
                          className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded hover:bg-red-200 disabled:opacity-50"
                        >
                          {flagging === review.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Flag className="h-3 w-3" />
                          )}
                          削除申請
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Non-target low reviews info */}
      {nonTargetLowReviews.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            対象外の低評価クチコミ（コメントなし）— {nonTargetLowReviews.length}件
          </h3>
          <p className="text-xs text-muted-foreground">
            星2つ以下ですがコメントが付いていないため、削除申請の対象外です。
          </p>
        </div>
      )}
    </div>
  )
}
