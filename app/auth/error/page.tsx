"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import Link from "next/link"
import { ShieldAlert } from "lucide-react"

function ErrorContent() {
  const params = useSearchParams()
  const error = params.get("error")

  const messageMap: Record<string, { title: string; description: string }> = {
    AccessDenied: {
      title: "アクセスが拒否されました",
      description: "このツールは許可されたアカウントでのみご利用いただけます。許可されたメールアドレスでログインしてください。",
    },
    Configuration: {
      title: "設定エラー",
      description: "認証設定に問題があります。管理者にお問い合わせください。",
    },
    Verification: {
      title: "認証エラー",
      description: "認証トークンが無効です。再度ログインをお試しください。",
    },
  }

  const info = error && messageMap[error]
    ? messageMap[error]
    : {
        title: "認証エラー",
        description: "ログイン処理中にエラーが発生しました。",
      }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="flex justify-center mb-4">
          <div className="bg-red-100 rounded-full p-3">
            <ShieldAlert className="h-8 w-8 text-red-600" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-center mb-2">{info.title}</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {info.description}
        </p>
        <Link
          href="/"
          className="block w-full bg-[#2c3e50] text-white text-center px-4 py-2.5 rounded text-sm hover:bg-[#34495e]"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen flex items-center justify-center">読込中...</div>}
    >
      <ErrorContent />
    </Suspense>
  )
}
