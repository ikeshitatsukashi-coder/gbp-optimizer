"use client"

import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, XCircle, Camera, Image, AlertTriangle } from "lucide-react"

const photoCategories = [
  { category: "ロゴ", recommended: 1, current: 1, status: "ok", tips: "高解像度のロゴ画像。正方形推奨。" },
  { category: "カバー写真", recommended: 1, current: 0, status: "error", tips: "店舗の特徴が伝わる写真。16:9のアスペクト比推奨。" },
  { category: "外観", recommended: 3, current: 1, status: "warning", tips: "日中と夜間、異なる角度から。看板が見える写真が効果的。" },
  { category: "内装", recommended: 3, current: 1, status: "warning", tips: "清潔感のある明るい写真。広角で撮影するとよい。" },
  { category: "商品・サービス", recommended: 5, current: 0, status: "error", tips: "サービスの実例や成果物。Before/After写真も効果的。" },
  { category: "スタッフ・チーム", recommended: 3, current: 1, status: "warning", tips: "親しみやすいスタッフ写真。笑顔が信頼感を高める。" },
  { category: "動画", recommended: 1, current: 0, status: "error", tips: "30秒以内の紹介動画。720p以上推奨。" },
]

const photoGuidelines = [
  { rule: "解像度は720px x 720px以上", important: true },
  { rule: "ファイルサイズは10KB〜5MBの範囲", important: true },
  { rule: "JPEGまたはPNG形式を使用", important: true },
  { rule: "ストック写真やAI生成画像は避ける", important: true },
  { rule: "テキストやロゴの重ね合わせは最小限に", important: false },
  { rule: "フィルター加工しすぎない自然な写真を使用", important: false },
  { rule: "写真にジオタグ（位置情報）を含める", important: false },
  { rule: "ファイル名にキーワードを含める（例: meo-consulting-tokyo.jpg）", important: false },
]

export default function PhotoGuidePage() {
  const totalRecommended = photoCategories.reduce((s, c) => s + c.recommended, 0)
  const totalCurrent = photoCategories.reduce((s, c) => s + c.current, 0)
  const completionRate = Math.round((totalCurrent / totalRecommended) * 100)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">写真最適化ガイド</h1>

      {/* Summary */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">写真充実度</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-bold ${completionRate >= 70 ? "text-green-600" : completionRate >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                  {completionRate}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {totalCurrent}枚 / 推奨{totalRecommended}枚
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm mb-2">
                <span className="font-bold text-red-600">{photoCategories.filter((c) => c.status === "error").length}</span>
                <span className="text-muted-foreground"> カテゴリで写真不足</span>
              </p>
              <button className="bg-[#2c3e50] text-white px-4 py-2 rounded text-sm hover:bg-[#34495e] flex items-center gap-1">
                <Camera className="h-4 w-4" /> 写真をアップロード
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 mb-6">
        Googleによると、写真が充実しているビジネスは、そうでないビジネスに比べて42%多くルートリクエストを受け、35%多くWebサイトクリックを獲得しています。
      </div>

      {/* Photo Categories */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4">カテゴリ別写真状況</h3>
          <div className="space-y-3">
            {photoCategories.map((cat) => (
              <div key={cat.category} className="flex items-center gap-4 py-3 px-4 rounded border hover:bg-gray-50">
                <div className="w-5">
                  {cat.status === "ok" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : cat.status === "warning" ? (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{cat.category}</span>
                    <span className="text-xs text-muted-foreground">
                      {cat.current} / {cat.recommended}枚
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div
                      className={`rounded-full h-2 ${
                        cat.current >= cat.recommended
                          ? "bg-green-500"
                          : cat.current > 0
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, (cat.current / cat.recommended) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{cat.tips}</p>
                </div>
                <button className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 flex items-center gap-1 shrink-0">
                  <Image className="h-3 w-3" />
                  {cat.current < cat.recommended ? "追加" : "管理"}
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Photo Guidelines */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4">写真のガイドライン</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {photoGuidelines.map((g) => (
              <div key={g.rule} className="flex items-start gap-2 py-1.5">
                <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${g.important ? "text-blue-500" : "text-gray-400"}`} />
                <span className="text-sm">
                  {g.rule}
                  {g.important && <span className="text-xs text-red-500 ml-1">*必須</span>}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
