"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, XCircle, ExternalLink, Plus } from "lucide-react"

const citationSites = [
  { name: "Googleビジネスプロフィール", category: "検索エンジン", registered: true, url: "https://google.com/maps", napConsistent: true, lastChecked: "2026/04/13" },
  { name: "Yahoo!ロコ", category: "検索エンジン", registered: true, url: "#", napConsistent: true, lastChecked: "2026/04/10" },
  { name: "Bing Places", category: "検索エンジン", registered: false, url: "#", napConsistent: false, lastChecked: null },
  { name: "Apple Maps", category: "検索エンジン", registered: false, url: "#", napConsistent: false, lastChecked: null },
  { name: "食べログ", category: "業種特化", registered: false, url: "#", napConsistent: false, lastChecked: null },
  { name: "ホットペッパー", category: "業種特化", registered: false, url: "#", napConsistent: false, lastChecked: null },
  { name: "エキテン", category: "ポータル", registered: false, url: "#", napConsistent: false, lastChecked: null },
  { name: "iタウンページ", category: "ポータル", registered: true, url: "#", napConsistent: false, lastChecked: "2026/03/01" },
  { name: "マピオン", category: "地図", registered: false, url: "#", napConsistent: false, lastChecked: null },
  { name: "NAVITIME", category: "地図", registered: false, url: "#", napConsistent: false, lastChecked: null },
  { name: "Facebook", category: "SNS", registered: true, url: "#", napConsistent: false, lastChecked: "2026/04/05" },
  { name: "Instagram", category: "SNS", registered: true, url: "https://instagram.com/ligo.saiyou", napConsistent: false, lastChecked: "2026/04/05" },
  { name: "X (Twitter)", category: "SNS", registered: true, url: "https://twitter.com/nagatsumajohnji", napConsistent: true, lastChecked: "2026/04/05" },
  { name: "LinkedIn", category: "SNS", registered: true, url: "#", napConsistent: true, lastChecked: "2026/04/01" },
]

export default function CitationsPage() {
  const [filter, setFilter] = useState("all")
  const categories = [...new Set(citationSites.map((s) => s.category))]

  const filtered = filter === "all" ? citationSites :
    filter === "registered" ? citationSites.filter((s) => s.registered) :
    filter === "unregistered" ? citationSites.filter((s) => !s.registered) :
    citationSites.filter((s) => s.category === filter)

  const registeredCount = citationSites.filter((s) => s.registered).length
  const consistentCount = citationSites.filter((s) => s.napConsistent).length

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">サイテーション管理</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground mb-1">登録済みサイト</p>
            <span className="text-3xl font-bold text-blue-600">{registeredCount}</span>
            <span className="text-sm text-muted-foreground"> / {citationSites.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground mb-1">NAP整合性</p>
            <span className="text-3xl font-bold text-green-600">{consistentCount}</span>
            <span className="text-sm text-muted-foreground"> / {registeredCount} 一致</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground mb-1">未登録サイト</p>
            <span className="text-3xl font-bold text-orange-600">{citationSites.length - registeredCount}</span>
            <span className="text-sm text-muted-foreground"> 件</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: "all", label: "すべて" },
          { key: "registered", label: "登録済み" },
          { key: "unregistered", label: "未登録" },
          ...categories.map((c) => ({ key: c, label: c })),
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs rounded border ${
              filter === f.key ? "bg-[#2c3e50] text-white border-[#2c3e50]" : "bg-white border-gray-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 px-3">サイト名</th>
                  <th className="text-center py-2 px-3">カテゴリ</th>
                  <th className="text-center py-2 px-3">登録状況</th>
                  <th className="text-center py-2 px-3">NAP整合性</th>
                  <th className="text-center py-2 px-3">最終確認日</th>
                  <th className="text-center py-2 px-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((site) => (
                  <tr key={site.name} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium">
                      <div className="flex items-center gap-1">
                        {site.name}
                        {site.registered && (
                          <a href={site.url} target="_blank" rel="noreferrer" className="text-blue-500">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-2 px-3">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{site.category}</span>
                    </td>
                    <td className="text-center py-2 px-3">
                      {site.registered ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                      )}
                    </td>
                    <td className="text-center py-2 px-3">
                      {site.registered ? (
                        site.napConsistent ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="text-center py-2 px-3 text-xs text-muted-foreground">
                      {site.lastChecked ?? "-"}
                    </td>
                    <td className="text-center py-2 px-3">
                      {site.registered ? (
                        <button className="text-xs text-blue-500 hover:underline">確認</button>
                      ) : (
                        <button className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600">登録する</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end">
        <button className="border px-4 py-2 rounded text-sm hover:bg-gray-50 flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> サイテーション先を追加
        </button>
      </div>
    </div>
  )
}
