"use client"

import { Bell, ChevronDown, LogIn, LogOut } from "lucide-react"
import { useSession, signIn, signOut } from "next-auth/react"
import { storeName } from "@/lib/mock-data"

export function Header() {
  const { data: session, status } = useSession()

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">店舗名：</span>
        <button className="flex items-center gap-1 font-bold text-sm">
          {storeName}
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative p-2 hover:bg-gray-100 rounded">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            4
          </span>
        </button>

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
