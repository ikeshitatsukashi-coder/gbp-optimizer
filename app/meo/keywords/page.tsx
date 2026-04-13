"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, TrendingUp, TrendingDown, Minus, Search } from "lucide-react"

const keywordData = [
  { keyword: "MEO対策 港区", volume: 320, difficulty: 45, currentRank: 8, trend: "up", inDescription: true, inPosts: true, inFaq: false },
  { keyword: "Webマーケティング 南青山", volume: 180, difficulty: 32, currentRank: 3, trend: "up", inDescription: true, inPosts: false, inFaq: false },
  { keyword: "SEO対策 東京", volume: 2400, difficulty: 78, currentRank: null, trend: "stable", inDescription: true, inPosts: true, inFaq: true },
  { keyword: "Web制作会社 港区", volume: 480, difficulty: 55, currentRank: 12, trend: "down", inDescription: false, inPosts: false, inFaq: false },
  { keyword: "Google マップ 集客", volume: 890, difficulty: 42, currentRank: null, trend: "stable", inDescription: false, inPosts: true, inFaq: false },
  { keyword: "MEO 青山", volume: 90, difficulty: 25, currentRank: null, trend: "stable", inDescription: false, inPosts: false, inFaq: false },
  { keyword: "ローカルSEO 東京", volume: 210, difficulty: 48, currentRank: 15, trend: "up", inDescription: false, inPosts: false, inFaq: false },
  { keyword: "Googleビジネスプロフィール 代行", volume: 590, difficulty: 58, currentRank: null, trend: "stable", inDescription: false, inPosts: false, inFaq: false },
]

const suggestedKeywords = [
  { keyword: "MEO対策 費用", volume: 720, difficulty: 38, reason: "関連性が高く、競合度が低い" },
  { keyword: "Googleマップ 上位表示", volume: 1200, difficulty: 52, reason: "検索ボリュームが大きい" },
  { keyword: "口コミ 集め方 店舗", volume: 340, difficulty: 28, reason: "サービスとの関連性が高い" },
  { keyword: "MEO対策 自分で", volume: 480, difficulty: 35, reason: "顕在層向けキーワード" },
]

export default function KeywordsPage() {
  const [search, setSearch] = useState("")

  const filtered = keywordData.filter((k) =>
    search ? k.keyword.includes(search) : true
  )

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">キーワード最適化</h1>

      {/* Current Keywords */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base">登録キーワード</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="キーワードを検索"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border rounded pl-8 pr-3 py-1.5 text-sm w-48"
                />
              </div>
              <button className="bg-[#2c3e50] text-white px-3 py-1.5 rounded text-sm hover:bg-[#34495e] flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> 追加
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 px-3">キーワード</th>
                  <th className="text-center py-2 px-3">月間検索数</th>
                  <th className="text-center py-2 px-3">競合度</th>
                  <th className="text-center py-2 px-3">現在順位</th>
                  <th className="text-center py-2 px-3">トレンド</th>
                  <th className="text-center py-2 px-3">説明文</th>
                  <th className="text-center py-2 px-3">投稿</th>
                  <th className="text-center py-2 px-3">FAQ</th>
                  <th className="text-center py-2 px-3">最適化状況</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((kw) => {
                  const optimized = [kw.inDescription, kw.inPosts, kw.inFaq].filter(Boolean).length
                  return (
                    <tr key={kw.keyword} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{kw.keyword}</td>
                      <td className="text-center py-2 px-3">{kw.volume.toLocaleString()}</td>
                      <td className="text-center py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          kw.difficulty >= 60 ? "bg-red-100 text-red-700" :
                          kw.difficulty >= 40 ? "bg-yellow-100 text-yellow-700" :
                          "bg-green-100 text-green-700"
                        }`}>
                          {kw.difficulty}
                        </span>
                      </td>
                      <td className="text-center py-2 px-3">
                        {kw.currentRank ? `${kw.currentRank}位` : "圏外"}
                      </td>
                      <td className="text-center py-2 px-3">
                        {kw.trend === "up" ? <TrendingUp className="h-4 w-4 text-green-500 mx-auto" /> :
                         kw.trend === "down" ? <TrendingDown className="h-4 w-4 text-red-500 mx-auto" /> :
                         <Minus className="h-4 w-4 text-gray-400 mx-auto" />}
                      </td>
                      <td className="text-center py-2 px-3">{kw.inDescription ? "✓" : "-"}</td>
                      <td className="text-center py-2 px-3">{kw.inPosts ? "✓" : "-"}</td>
                      <td className="text-center py-2 px-3">{kw.inFaq ? "✓" : "-"}</td>
                      <td className="text-center py-2 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div className={`rounded-full h-2 ${
                              optimized === 3 ? "bg-green-500" : optimized === 2 ? "bg-yellow-500" : optimized === 1 ? "bg-orange-500" : "bg-red-500"
                            }`} style={{ width: `${(optimized / 3) * 100}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{optimized}/3</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Suggested Keywords */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4">おすすめキーワード</h3>
          <p className="text-xs text-muted-foreground mb-3">ビジネス内容に基づいた追加キーワードの提案です。</p>
          <div className="space-y-2">
            {suggestedKeywords.map((kw) => (
              <div key={kw.keyword} className="flex items-center gap-4 py-2 px-3 rounded border hover:bg-gray-50">
                <span className="font-medium text-sm flex-1">{kw.keyword}</span>
                <span className="text-xs text-muted-foreground">月間{kw.volume}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  kw.difficulty >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                }`}>
                  競合度 {kw.difficulty}
                </span>
                <span className="text-xs text-muted-foreground max-w-48">{kw.reason}</span>
                <button className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
                  追加
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
