import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function getAccessToken(): Promise<string | null> {
  // ローカルデバッグ専用バイパス（NODE_ENV=development かつ明示フラグの二重ガード。
  // 本番ビルドでは絶対に有効化されない。Google API を呼ぶ機能はこのトークンでは動かない）
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1"
  ) {
    return "dev-bypass-token"
  }
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (session as any)?.accessToken ?? null
}

export async function getSessionEmail(): Promise<string | null> {
  // getAccessToken と同じ二重ガードのローカルデバッグ用バイパス。
  // これがないと権限チェック（authz）がローカルで常に未認証になる。
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1"
  ) {
    return process.env.DEV_AUTH_EMAIL || "dev@li-go.jp"
  }
  const session = await getServerSession(authOptions)
  return session?.user?.email ?? null
}
