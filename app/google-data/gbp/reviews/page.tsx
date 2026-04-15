"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Star, MessageSquare, Search, Loader2, FileText, ChevronDown } from "lucide-react"
import { useGbpData } from "@/lib/use-gbp-data"
import { useGbp } from "@/lib/store"
import { reviewsList as mockReviews, storeName } from "@/lib/mock-data"
import { getTemplatesForRating, applyTemplate } from "@/lib/reply-templates"

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
  const [openTemplateMenu, setOpenTemplateMenu] = useState<string | null>(null)
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

  const handleSelectTemplate = (reviewId: string, author: string, templateText: string) => {
    const applied = applyTemplate(templateText, { author, storeName })
    setReplyTexts((prev) => ({ ...prev, [reviewId]: applied }))
    setOpenTemplateMenu(null)
  }

  const handleAutoFillAll = () => {
    const unreplied = reviews.filter((r) => !r.reply)
    const newTexts: Record<string, string> = {}
    for (const review of unreplied) {
      if (!replyTexts[review.id]) {
        const templates = getTemplatesForRating(review.rating)
        if (templates.length > 0) {
          newTexts[review.id] = applyTemplate(templates[0].template, {
            author: review.author,
            storeName,
          })
        }
      }
    }
    setReplyTexts((prev) => ({ ...prev, ...newTexts }))
  }

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

  const unrepliedCount = reviews.filter((r) => !r.reply).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">クチコミ管理</h1>
        {unrepliedCount > 0 && (
          <button
            onClick={handleAutoFillAll}
            className="flex items-center gap-1.5 bg-[#2c3e50] text-white px-4 py-2 rounded text-sm hover:bg-[#34495e]"
          >
            <FileText className="h-4 w-4" />
            未返信{unrepliedCount}件にテンプレート一括適用
          </button>
        )}
      </div>

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
            { key: "unreplied", label: `未返信 (${unrepliedCount})` },
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
        {filtered.map((review) => {
          const templates = getTemplatesForRating(review.rating)

          return (
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

                {/* Existing reply */}
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

                {/* Reply form for unreplied reviews */}
                {!review.reply && (
                  <div className="mt-3">
                    {/* Template Selector */}
                    <div className="relative mb-2">
                      <button
                        onClick={() =>
                          setOpenTemplateMenu(openTemplateMenu === review.id ? null : review.id)
                        }
                        className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-100"
                      >
                        <FileText className="h-3 w-3" />
                        テンプレートから選択
                        <ChevronDown className="h-3 w-3" />
                      </button>

                      {openTemplateMenu === review.id && (
                        <div className="absolute z-10 mt-1 bg-white border rounded-lg shadow-lg w-80 max-h-60 overflow-y-auto">
                          {templates.map((tmpl) => (
                            <button
                              key={tmpl.id}
                              onClick={() =>
                                handleSelectTemplate(review.id, review.author, tmpl.template)
                              }
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b last:border-b-0"
                            >
                              <span className="font-medium">{tmpl.label}</span>
                              <p className="text-muted-foreground mt-0.5 line-clamp-2">
                                {applyTemplate(tmpl.template, {
                                  author: review.author,
                                  storeName,
                                }).substring(0, 80)}
                                ...
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <textarea
                      placeholder="返信を入力... またはテンプレートから選択できます"
                      value={replyTexts[review.id] || ""}
                      onChange={(e) =>
                        setReplyTexts((prev) => ({ ...prev, [review.id]: e.target.value }))
                      }
                      className="w-full border rounded px-3 py-2 text-sm h-32"
                    />
                    <div className="flex justify-end mt-2 gap-2">
                      {replyTexts[review.id] && (
                        <button
                          onClick={() =>
                            setReplyTexts((prev) => ({ ...prev, [review.id]: "" }))
                          }
                          className="text-xs text-gray-500 hover:underline"
                        >
                          クリア
                        </button>
                      )}
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
          )
        })}
      </div>
    </div>
  )
}
