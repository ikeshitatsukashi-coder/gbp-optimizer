"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  Building2,
  Settings,
  Users,
  ClipboardCheck,
  KeyRound,
  Share2,
  Store,
  Link2,
  BellRing,
  ChevronRight,
} from "lucide-react"
import { useGbp } from "@/lib/store"

/**
 * ヘッダー右上の2つのアイコン（GMOのツールと同じ位置・役割）
 *
 * 左: 管理メニュー   … 利用者・権限、ワークフロー承認、API連携など運用管理系
 * 右: 店舗メニュー   … 選択中の店舗の詳細（基本情報 / SNS・外部連携 / クチコミ通知）
 */

/** 外側クリックで閉じる */
function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])
  return ref
}

interface MenuItem {
  href: string
  label: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
}

const ADMIN_ITEMS: MenuItem[] = [
  {
    href: "/settings/companies",
    label: "会社マスタ",
    desc: "店舗を会社単位でまとめる・会社IDの管理",
    icon: Building2,
  },
  {
    href: "/settings/users",
    label: "利用者・権限管理",
    desc: "管理者 / 編集者 / 閲覧のみ の割り当て",
    icon: Users,
  },
  {
    href: "/workflow",
    label: "ワークフロー承認",
    desc: "予約投稿を承認制にする・承認する",
    icon: ClipboardCheck,
  },
  {
    href: "/settings/api-keys",
    label: "API連携",
    desc: "外部ツール向けAPIキーの発行・失効",
    icon: KeyRound,
  },
  {
    href: "/share-links",
    label: "お客様共有ページ",
    desc: "閲覧専用ページの発行・停止",
    icon: Share2,
  },
]

export function AdminMenu() {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(() => setOpen(false))

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="管理メニュー"
        aria-label="管理メニュー"
        aria-expanded={open}
        className={`p-2 rounded hover:bg-gray-100 ${open ? "bg-gray-100" : ""}`}
      >
        <Settings className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-md border bg-white shadow-lg z-50 py-1">
          <div className="px-3 py-2 text-[11px] font-medium text-gray-400">
            管理メニュー
          </div>
          {ADMIN_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50"
              >
                <Icon className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm text-gray-800">{item.label}</span>
                  <span className="block text-[11px] text-gray-500">{item.desc}</span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function StoreMenu() {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(() => setOpen(false))
  const { locationName, locations } = useGbp()

  const current = locations.find((l) => l.name === locationName)
  const locationId = locationName?.replace(/^locations\//, "") ?? ""

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="店舗メニュー（詳細・SNS連携）"
        aria-label="店舗メニュー"
        aria-expanded={open}
        className={`p-2 rounded hover:bg-gray-100 ${open ? "bg-gray-100" : ""}`}
      >
        <Building2 className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-md border bg-white shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b">
            <div className="text-[11px] text-gray-400">選択中の店舗</div>
            <div className="text-sm font-medium truncate">
              {current?.title ?? "（未選択）"}
            </div>
          </div>

          {locationId ? (
            <>
              <Link
                href={`/stores/${locationId}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
              >
                <Store className="h-4 w-4 text-gray-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-800">店舗詳細・運用設定</span>
                  <span className="block text-[11px] text-gray-500">
                    業種・ステータス・自動化フラグ
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
              </Link>
              <Link
                href={`/stores/${locationId}?tab=social`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
              >
                <Link2 className="h-4 w-4 text-gray-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-800">SNS・外部連携</span>
                  <span className="block text-[11px] text-gray-500">
                    Instagram / Facebook / LINE / GA4
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
              </Link>
              <Link
                href={`/stores/${locationId}?tab=notify`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
              >
                <BellRing className="h-4 w-4 text-gray-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-800">クチコミ通知設定</span>
                  <span className="block text-[11px] text-gray-500">
                    通知先メール・キーワード
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
              </Link>
            </>
          ) : (
            <div className="px-3 py-3 text-xs text-gray-500">
              左の店舗セレクタで店舗を選ぶと、その店舗の詳細設定を開けます。
            </div>
          )}

          <div className="border-t mt-1 pt-1">
            <Link
              href="/stores"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50"
            >
              <Building2 className="h-4 w-4 text-gray-500 shrink-0" />
              <span className="text-sm text-gray-800">店舗マスタ（一覧）</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
