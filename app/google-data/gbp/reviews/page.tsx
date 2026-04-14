"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Star, MessageSquare, Search, Loader2 } from "lucide-react"
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
  replyDate: string | null
}

function transformApiReviews(apiData: Record<string, unknown> | null): Review[] {
  if (!apiData || !Array.isArray((apiData as { reviews?: unknown[] }).reviews)) {
    return mockReviews
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (apiData as any).reviews.map((r: any) => ({
    id: r.reviewId || r.name,
    author: r.reviewer?.displayName || "匿名",
    rating: parseInt(r.starRating?.replace("STAR_RATING_", "").replace("ONE", "1").replace("TWO", "2").replace("THREE", "3").replace("FOUR", "4").replace("FIVE", "5") || "0"),
    date: r.createTime ? new Date(r.createTime).toLocaleDateString("ja-JP") : "",
    text: r.comment || "",
    reply: r.reviewReply?.comment || null,
    replyDate: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime).toLocaleDateString("ja-JP") : null,
  }))
}

export default function ReviewsPage() {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({})
  const [replying, setReplying] = useState<string | null>(null)
  const { locationName } = useGbp()

  const { data: apiReviews, loading, refetch } = useGbpData("reviews", null)
  const reviews = transformApiReviews(apiReviews)

  const filtered = reviews
    .filter((r) => {
      if (filter === "unreplied") return !r.reply
      if (filter === "replied") return !!r.reply
      return true
    })
    .filter((r) => (search ? r.text.includes(search) || r.author.includes(search) : true))

  const handleReply = async (reviewId: string) => {
    const comment = replyTexts[reviewId]
    if (!comment || !locationName) return

    setReplying(reviewId)
    try {
      const res = await fetch("/api/gbp/reviews", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewName: `${locationName}/reviews/${reviewId}`,
          comment,
        }),
      })
      if (res.ok) {
        setReplyTexts((prev) => ({ ...prev, [reviewId]: "" }))
        refetch()
      }
    } catch (err) {
      console.error("Reply failed:", err)
    } finally {
      setReplying(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">クチコミ管理</h1>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> データを取得中...
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-2">
          {[
            { key: "all", label: "すべて" },
            { key: "unreplied", label: "未返信" },
            { key: "replied", label: "返信済み" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-sm rounded border ${
                filter === f.key
                  ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                  : "bg-white border-gray-300 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="クチコミを検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded pl-9 pr-3 py-1.5 text-sm"
          />
        </div>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length}件</span>
      </div>

      {/* Review List */}
      <div className="space-y-4">
        {filtered.map((review) => (
          <Card key={review.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{review.author}</span>
                    <span className="text-xs text-muted-foreground">{review.date}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${
                          i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    review.reply ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {review.reply ? "返信済み" : "未返信"}
                </span>
              </div>
              <p className="text-sm mt-2">{review.text}</p>
              {review.reply && (
                <div className="mt-3 bg-gray-50 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="h-3 w-3 text-blue-500" />
                    <span className="text-xs font-medium text-blue-500">オーナーからの返信</span>
                    <span className="text-xs text-muted-foreground">{review.replyDate}</span>
                  </div>
                  <p className="text-sm">{review.reply}</p>
                </div>
              )}
              {!review.reply && (
                <div className="mt-3">
                  <textarea
                    placeholder="返信を入力..."
                    value={replyTexts[review.id] || ""}
                    onChange={(e) =>
                      setReplyTexts((prev) => ({ ...prev, [review.id]: e.target.value }))
                    }
                    className="w-full border rounded px-3 py-2 text-sm h-20"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => handleReply(review.id)}
                      disabled={replying === review.id || !replyTexts[review.id]}
                      className="bg-[#2c3e50] text-white px-4 py-1.5 rounded text-sm hover:bg-[#34495e] disabled:opacity-50 flex items-center gap-1"
                    >
                      {replying === review.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      返信する
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
