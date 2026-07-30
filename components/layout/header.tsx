"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell, LogIn, LogOut } from "lucide-react"
import { useSession, signIn, signOut } from "next-auth/react"
import { StoreSelector } from "@/components/layout/store-selector"
import { AdminMenu, StoreMenu } from "@/components/layout/header-menus"

export function Header() {
  const { data: session, status } = useSession()

  /** 未返信クチコミの件数（従来は固定の「4」が出ていたため実データに置き換え） */
  const [unreplied, setUnreplied] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    fetch("/api/reviews/unreplied?days=30")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.candidates) setUnreplied(j.candidates.length)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">店舗名：</span>
        <StoreSelector />
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/google-data/gbp/reviews"
          title={
            unreplied === null
              ? "クチコミ管理"
              : `未返信のクチコミ ${unreplied} 件（過去30日）`
          }
          className="relative p-2 hover:bg-gray-100 rounded"
        >
          <Bell className="h-4 w-4" />
          {unreplied !== null && unreplied > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
              {unreplied > 99 ? "99+" : unreplied}
            </span>
          )}
        </Link>

        <AdminMenu />
        <StoreMenu />

        {status === "loading" ? (
          <span className="text-xs text-muted-foreground">読込中...</span>
        ) : session ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{session.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border rounded px-2 py-1"
            >
              <LogOut className="h-3 w-3" /> ログアウト
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="flex items-center gap-1 bg-blue-500 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-600"
          >
            <LogIn className="h-3 w-3" /> Googleでログイン
          </button>
        )}
      </div>
    </header>
  )
}
