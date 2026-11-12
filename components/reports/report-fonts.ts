import { Barlow_Condensed, Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google"

/**
 * お客様に見せるページ（月次レポート・写真の受付）専用の書体。
 * 和文見出し／和文本文／欧文数字の3系統。社内の画面には読み込まない。
 */
const zen = Zen_Kaku_Gothic_New({
  weight: ["300", "500", "900"],
  preload: false,
  display: "swap",
  variable: "--font-zen",
})

const barlow = Barlow_Condensed({
  weight: ["500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-barlow",
})

const shippori = Shippori_Mincho({
  weight: ["500"],
  preload: false,
  display: "swap",
  variable: "--font-shippori",
})

export const reportFontVars = `${zen.variable} ${barlow.variable} ${shippori.variable}`
