"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Star, MessageSquare, Search } from "lucide-react"
import { reviewsList } from "@/lib/mock-data"

export default function ReviewsPage() {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")

  const filtered = reviewsList.filter((r) => {
    if (filter === "unreplied") return !r.reply
    if (filter === "replied") return !!r.reply
    return true
  }).filter((r) =>
    search ? r.text.includes(search) || r.author.includes(search) : true
  )

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">クチコミ管理</h1>

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
                    review.reply
                      ? "bg-green-100 text-green-700"
                      : "bg-orange-100 text-orange-700"
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
                    className="w-full border rounded px-3 py-2 text-sm h-20"
                  />
                  <div className="flex justify-end mt-2">
                    <button className="bg-[#2c3e50] text-white px-4 py-1.5 rounded text-sm hover:bg-[#34495e]">
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
