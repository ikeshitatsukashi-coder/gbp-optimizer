"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
} from "lucide-react"

const diagnosticItems = [
  {
    category: "基本情報",
    items: [
      { label: "ビジネス名が正確に設定されている", status: "ok", detail: "「株式会社LIGO」が設定済み" },
      { label: "カテゴリが適切に設定されている", status: "ok", detail: "メイン: インターネットマーケティングサービス" },
      { label: "住所が正確に入力されている", status: "ok", detail: "東京都港区南青山2-2-15" },
      { label: "電話番号が設定されている", status: "ok", detail: "03-5776-2504" },
      { label: "WebサイトURLが設定されている", status: "ok", detail: "https://www.li-go.jp/" },
      { label: "ビジネスの説明が250文字以上", status: "warning", detail: "現在180文字 — 250文字以上を推奨" },
    ],
  },
  {
    category: "営業時間",
    items: [
      { label: "通常営業時間が設定されている", status: "ok", detail: "月〜金 09:00-18:00" },
      { label: "特別営業時間が最新に更新されている", status: "error", detail: "最終更新: 2023/05 — 更新が必要" },
      { label: "祝日の営業時間が設定されている", status: "warning", detail: "一部未設定の祝日あり" },
    ],
  },
  {
    category: "写真・メディア",
    items: [
      { label: "ロゴ画像が設定されている", status: "ok", detail: "設定済み" },
      { label: "カバー写真が設定されている", status: "error", detail: "未設定 — 必ず設定してください" },
      { label: "写真が10枚以上アップロードされている", status: "error", detail: "現在4枚 — 10枚以上を推奨" },
      { label: "写真が定期的に追加されている", status: "warning", detail: "最終追加: 2025/07 — 月1回以上を推奨" },
      { label: "動画がアップロードされている", status: "warning", detail: "未設定 — 動画は表示で優位" },
    ],
  },
  {
    category: "クチコミ",
    items: [
      { label: "クチコミ件数が10件以上", status: "warning", detail: "現在9件 — あと1件で達成" },
      { label: "平均評価が4.0以上", status: "ok", detail: "現在4.4" },
      { label: "クチコミへの返信率が80%以上", status: "warning", detail: "現在66.7% — 80%以上を推奨" },
      { label: "直近30日以内にクチコミがある", status: "ok", detail: "2026/03/15に最新クチコミ" },
    ],
  },
  {
    category: "投稿",
    items: [
      { label: "直近7日以内に投稿がある", status: "error", detail: "最終投稿: 2026/03/01 — 週1回以上を推奨" },
      { label: "投稿にCTAボタンが設定されている", status: "warning", detail: "一部の投稿にCTA未設定" },
      { label: "投稿に写真が含まれている", status: "warning", detail: "写真なし投稿あり — 写真付きを推奨" },
    ],
  },
  {
    category: "その他",
    items: [
      { label: "SNSプロフィールが設定されている", status: "ok", detail: "4つ設定済み" },
      { label: "FAQが3件以上登録されている", status: "ok", detail: "3件登録済み" },
      { label: "サービスが登録されている", status: "ok", detail: "5件登録済み" },
      { label: "構造化データが設定されている", status: "error", detail: "未設定 — リッチリザルト表示に影響" },
    ],
  },
]

function getScore() {
  let total = 0
  let ok = 0
  diagnosticItems.forEach((cat) => {
    cat.items.forEach((item) => {
      total++
      if (item.status === "ok") ok++
      else if (item.status === "warning") ok += 0.5
    })
  })
  return Math.round((ok / total) * 100)
}

function StatusIcon({ status }: { status: string }) {
  if (status === "ok") return <CheckCircle2 className="h-5 w-5 text-green-500" />
  if (status === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500" />
  return <XCircle className="h-5 w-5 text-red-500" />
}

export default function DiagnosisPage() {
  const score = getScore()
  const scoreColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600"
  const scoreBg = score >= 80 ? "bg-green-50 border-green-200" : score >= 60 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"

  const counts = { ok: 0, warning: 0, error: 0 }
  diagnosticItems.forEach((cat) =>
    cat.items.forEach((item) => {
      counts[item.status as keyof typeof counts]++
    })
  )

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">GBP最適化診断</h1>

      {/* Score Card */}
      <Card className={`mb-6 border-2 ${scoreBg}`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">GBP最適化スコア</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-bold ${scoreColor}`}>{score}</span>
                <span className="text-xl text-muted-foreground">/100</span>
              </div>
              <p className="text-sm mt-2">
                {score >= 80
                  ? "良好な状態です。細かい改善でさらに上を目指しましょう。"
                  : score >= 60
                    ? "改善の余地があります。エラー項目から対応しましょう。"
                    : "改善が必要です。まずはエラー項目を優先的に対応してください。"}
              </p>
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                <div className="flex items-center gap-1 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">完了</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{counts.ok}</span>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 mb-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm">注意</span>
                </div>
                <span className="text-2xl font-bold text-yellow-600">{counts.warning}</span>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 mb-1">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm">要対応</span>
                </div>
                <span className="text-2xl font-bold text-red-600">{counts.error}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diagnostic Categories */}
      <div className="space-y-4">
        {diagnosticItems.map((cat) => (
          <Card key={cat.category}>
            <CardContent className="p-5">
              <h3 className="font-bold text-base mb-3">{cat.category}</h3>
              <div className="space-y-2">
                {cat.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 py-2 px-3 rounded hover:bg-gray-50"
                  >
                    <StatusIcon status={item.status} />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{item.label}</span>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    {item.status !== "ok" && (
                      <button className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
                        改善する <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button className="bg-[#2c3e50] text-white px-6 py-2.5 rounded text-sm hover:bg-[#34495e]">
          再診断する
        </button>
      </div>
    </div>
  )
}
