"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useGbp } from "@/lib/store"
import { normalizeSearchText } from "@/lib/search-normalize"
import { deriveStoreGroup } from "@/lib/store-group"
import {
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Archive,
  Building2,
  FolderOpen,
} from "lucide-react"

type Mode = "store" | "group"

export function StoreSelector() {
  const { locations, locationName, setLocationName, archiveLocation, loading } = useGbp()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("store")
  const [search, setSearch] = useState("")
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const current = locations.find((l) => l.name === locationName)

  const normalizedQuery = normalizeSearchText(search)

  // 店舗名モード: 店舗名・住所であいまい検索
  const filteredStores = normalizedQuery
    ? locations.filter(
        (l) =>
          normalizeSearchText(l.title).includes(normalizedQuery) ||
          (l.address && normalizeSearchText(l.address).includes(normalizedQuery))
      )
    : locations

  // グループ一覧（会社名 → 店舗数）
  const groups = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of locations) {
      const g = deriveStoreGroup(l.title)
      map.set(g, (map.get(g) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"))
  }, [locations])

  const filteredGroups = normalizedQuery
    ? groups.filter((g) => normalizeSearchText(g.name).includes(normalizedQuery))
    : groups

  // 選択中グループの店舗一覧
  const groupStores = activeGroup
    ? locations.filter((l) => deriveStoreGroup(l.title) === activeGroup)
    : []

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

  const closeAndReset = () => {
    setOpen(false)
    setSearch("")
    setActiveGroup(null)
  }

  const handleArchive = (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    if (confirm("この店舗をアーカイブしますか？プルダウンから非表示になります。")) {
      archiveLocation(name)
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setSearch("")
    setActiveGroup(null)
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

  const StoreRow = ({
    loc,
  }: {
    loc: { name: string; title: string; address?: string }
  }) => (
    <div
      className={`flex items-center group hover:bg-gray-50 ${
        locationName === loc.name ? "bg-blue-50" : ""
      }`}
    >
      <button
        onClick={() => {
          setLocationName(loc.name)
          closeAndReset()
        }}
        className="flex-1 text-left px-3 py-2 min-w-0"
      >
        <div className="text-sm font-medium truncate">{loc.title}</div>
        {loc.address && (
          <div className="text-xs text-muted-foreground truncate">{loc.address}</div>
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
  )

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
          {/* モード切替タブ */}
          <div className="flex border-b">
            {(
              [
                { key: "store", label: "店舗名で検索" },
                { key: "group", label: "グループで検索" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => switchMode(t.key)}
                className={`flex-1 text-sm py-2 font-medium border-b-2 -mb-px transition-colors ${
                  mode === t.key
                    ? "border-[#4a90e2] text-[#4a90e2]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 検索窓（グループ内店舗表示中は非表示） */}
          {!(mode === "group" && activeGroup) && (
            <div className="p-2 border-b sticky top-0 bg-white">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder={
                    mode === "store" ? "店舗名・住所で検索..." : "グループ名で検索..."
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border rounded pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 px-1">
                {mode === "store"
                  ? `${filteredStores.length}件 / 全${locations.length}件`
                  : `${filteredGroups.length}グループ / 全${groups.length}グループ`}
              </p>
            </div>
          )}

          {/* --- 店舗名モード --- */}
          {mode === "store" && (
            <div className="max-h-80 overflow-y-auto">
              {filteredStores.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  該当する店舗がありません
                </div>
              ) : (
                filteredStores.map((loc) => <StoreRow key={loc.name} loc={loc} />)
              )}
            </div>
          )}

          {/* --- グループモード（グループ一覧） --- */}
          {mode === "group" && !activeGroup && (
            <div className="max-h-80 overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  該当するグループがありません
                </div>
              ) : (
                filteredGroups.map((g) => (
                  <button
                    key={g.name}
                    onClick={() => {
                      // 1店舗だけのグループは直接選択
                      const stores = locations.filter(
                        (l) => deriveStoreGroup(l.title) === g.name
                      )
                      if (stores.length === 1) {
                        setLocationName(stores[0].name)
                        closeAndReset()
                      } else {
                        setActiveGroup(g.name)
                        setSearch("")
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-left"
                  >
                    <FolderOpen className="h-4 w-4 text-[#4a90e2] shrink-0" />
                    <span className="flex-1 text-sm font-medium truncate">{g.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {g.count}店舗
                    </span>
                    {g.count > 1 && (
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* --- グループモード（グループ内の店舗一覧） --- */}
          {mode === "group" && activeGroup && (
            <>
              <div className="p-2 border-b bg-gray-50 flex items-center gap-2">
                <button
                  onClick={() => setActiveGroup(null)}
                  className="p-1 hover:bg-gray-200 rounded text-gray-600"
                  title="グループ一覧へ戻る"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-bold truncate flex-1">{activeGroup}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {groupStores.length}店舗
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {groupStores.map((loc) => (
                  <StoreRow key={loc.name} loc={loc} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
