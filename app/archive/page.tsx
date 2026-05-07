"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { useGbp } from "@/lib/store"
import { Archive, RotateCcw, Search, Building2 } from "lucide-react"

export default function ArchivePage() {
  const { archivedLocations, unarchiveLocation } = useGbp()
  const [search, setSearch] = useState("")

  const filtered = search
    ? archivedLocations.filter(
        (l) =>
          l.title.toLowerCase().includes(search.toLowerCase()) ||
          (l.address && l.address.toLowerCase().includes(search.toLowerCase()))
      )
    : archivedLocations

  const handleUnarchive = (name: string) => {
    if (confirm("この店舗をアーカイブから戻しますか？")) {
      unarchiveLocation(name)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Archive className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">アーカイブ済み店舗</h1>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="店舗名・住所で検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border rounded pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {filtered.length}件 / 全{archivedLocations.length}件
            </span>
          </div>
        </CardContent>
      </Card>

      {archivedLocations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Archive className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              アーカイブされた店舗はありません。
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              店舗セレクターのアーカイブボタン（📦）から、契約終了など利用しない店舗を非表示にできます。
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">該当する店舗がありません。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((loc) => (
            <Card key={loc.name}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{loc.title}</div>
                    {loc.address && (
                      <div className="text-xs text-muted-foreground">{loc.address}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnarchive(loc.name)}
                    className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-100"
                  >
                    <RotateCcw className="h-3 w-3" />
                    アーカイブから戻す
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
