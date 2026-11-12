import type { Metadata } from "next"
import { reportFontVars } from "@/components/reports/report-fonts"

export const metadata: Metadata = {
  title: "月次レポート",
  // お客様ごとのURLなので、検索エンジンには載せない
  robots: { index: false, follow: false },
}

export default function MonthlyShareLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${reportFontVars} min-h-full`}>{children}</div>
}
