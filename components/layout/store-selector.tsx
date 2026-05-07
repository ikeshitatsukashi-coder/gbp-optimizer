"use client"

import { useState, useRef, useEffect } from "react"
import { useGbp } from "@/lib/store"
import { Search, ChevronDown, Archive, Building2 } from "lucide-react"

export function StoreSelector() {
  const { locations, locationName, setLocationName, archiveLocation, loading } = useGbp()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  const current = locations.find((l) => l.name === locationName)

  const filtered = search
    ? locations.filter(
        (l) =>
          l.title.toLowerCase().includes(search.toLowerCase()) ||
          (l.address && l.address.toLowerCase().includes(search.toLowerCase()))
      )
    : locations

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleArchive = (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    if (confirm("この店舗をアーカイブしますか？プルダウンから非表示になります。")) {
      archiveLocation(name)
    }
  }

  if (loading) {
    return <span className="text-xs text-muted-foreground">店舗を読込中...</span>
  }

  if (locations.length === 0) {
    return (
      <span className="font-bold text-sm flex items-center gap-1">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        店舗なし
      </span>
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 font-bold text-sm border rounded px-3 py-1.5 hover:bg-gray-50 min-w-[200px]"
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-left truncate">
          {current?.title ?? "店舗を選択"}
        </span>
        <ChevronDown className="h-3 w-3 text-gray-500" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-50 w-96">
          {/* Search */}
          <div className="p-2 border-b sticky top-0 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="店舗名・住所で検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border rounded pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 px-1">
              {filtered.length}件 / 全{locations.length}件
            </p>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                該当する店舗がありません
              </div>
            ) : (
              filtered.map((loc) => (
                <div
                  key={loc.name}
                  className={`flex items-center group hover:bg-gray-50 ${
                    locationName === loc.name ? "bg-blue-50" : ""
                  }`}
                >
                  <button
                    onClick={() => {
                      setLocationName(loc.name)
                      setOpen(false)
                      setSearch("")
                    }}
                    className="flex-1 text-left px-3 py-2 min-w-0"
                  >
                    <div className="text-sm font-medium truncate">{loc.title}</div>
                    {loc.address && (
                      <div className="text-xs text-muted-foreground truncate">
                        {loc.address}
                      </div>
                    )}
                  </button>
                  <button
                    onClick={(e) => handleArchive(e, loc.name)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-orange-500"
                    title="アーカイブする"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
