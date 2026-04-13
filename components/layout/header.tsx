"use client"

import { Bell, ChevronDown } from "lucide-react"
import { storeName } from "@/lib/mock-data"

export function Header() {
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
      </div>
    </header>
  )
}
