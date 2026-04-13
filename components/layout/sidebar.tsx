"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Bot,
  BarChart3,
  TrendingUp,
  Megaphone,
  FileText,
  MapPin,
  Store,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { menuConfig } from "@/lib/menu-config"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Bot,
  BarChart3,
  TrendingUp,
  Megaphone,
  FileText,
  MapPin,
  Store,
}

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <aside
      className={cn(
        "bg-[#2c3e50] text-white flex flex-col transition-all duration-300 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        {!collapsed && (
          <span className="font-bold text-sm tracking-wide">
            GBP Optimizer
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 hover:bg-white/10 rounded"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-2">
        {menuConfig.map((group) => {
          const Icon = iconMap[group.icon]
          const isActive = group.href
            ? pathname === group.href
            : group.children?.some((c) => pathname === c.href)
          const isOpen = openMenus[group.label]

          if (group.href) {
            return (
              <Link
                key={group.label}
                href={group.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/10 transition-colors",
                  isActive && "bg-white/15 text-white font-medium"
                )}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                {!collapsed && <span>{group.label}</span>}
              </Link>
            )
          }

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleMenu(group.label)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/10 transition-colors",
                  isActive && "bg-white/10"
                )}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </>
                )}
              </button>
              {!collapsed && isOpen && group.children && (
                <div className="ml-4 border-l border-white/10">
                  {group.children.map((item) => {
                    if (item.label.startsWith("---")) {
                      return (
                        <div
                          key={item.label}
                          className="px-4 py-1.5 text-xs text-white/50 font-medium"
                        >
                          {item.label.replace(/---/g, "").trim()}
                        </div>
                      )
                    }
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block px-4 py-1.5 text-xs hover:bg-white/10 transition-colors",
                          pathname === item.href &&
                            "bg-white/15 text-white font-medium"
                        )}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
