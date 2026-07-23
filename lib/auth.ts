import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || "li-go.jp"
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean)

/**
 * Refresh an expired Google OAuth access token using the refresh token
 */
async function refreshAccessToken(token: {
  refreshToken?: string
  accessToken?: string
  expiresAt?: number
}) {
  try {
    if (!token.refreshToken) throw new Error("No refresh token")

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to refresh token")

    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in as number),
      refreshToken: data.refresh_token ?? token.refreshToken,
    }
  } catch (error) {
    console.error("Token refresh failed:", error)
    return { ...token, error: "RefreshAccessTokenError" }
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/business.manage",
            // 投稿一括取り込み用: スプレッドシートの読み取り（読み取り専用）
            "https://www.googleapis.com/auth/spreadsheets.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    /**
     * Restrict sign-in to allowed domain or email list
     */
    async signIn({ user }) {
      const email = user.email?.toLowerCase()
      if (!email) return false

      // If specific emails are allowed, check the list
      if (ALLOWED_EMAILS.length > 0) {
        return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email)
      }

      // Otherwise, check by domain
      const domain = email.split("@")[1]
      return domain === ALLOWED_DOMAIN.toLowerCase()
    },

    async jwt({ token, account }) {
      // Initial sign-in: store tokens
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        }
      }

      // Token still valid
      const expiresAt = (token.expiresAt as number | undefined) ?? 0
      if (Date.now() / 1000 < expiresAt - 60) {
        return token
      }

      // Token expired: try to refresh
      return refreshAccessToken(
        token as { refreshToken?: string; accessToken?: string; expiresAt?: number }
      )
    },

    async session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = session as any
      s.accessToken = token.accessToken
      s.error = token.error
      return session
    },
  },
  pages: {
    error: "/auth/error",
  },
}
