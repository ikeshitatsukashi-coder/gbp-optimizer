import type { Metadata } from "next"
import { reportFontVars } from "@/components/reports/report-fonts"

export const metadata: Metadata = {
  title: "写真の受付",
  // お客様ごとのURLなので、検索エンジンには載せない
  robots: { index: false, follow: false },
}

export default function PhotoIntakeLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${reportFontVars} min-h-full`}>{children}</div>
}
