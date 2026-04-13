"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Calendar, Clock, Image, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react"

const postSchedule = [
  { day: "月", type: "最新情報", status: "posted", title: "サービス紹介" },
  { day: "火", type: "-", status: "skip", title: "" },
  { day: "水", type: "イベント", status: "scheduled", title: "セミナー告知" },
  { day: "木", type: "-", status: "skip", title: "" },
  { day: "金", type: "特典", status: "pending", title: "未作成" },
  { day: "土", type: "-", status: "skip", title: "" },
  { day: "日", type: "-", status: "skip", title: "" },
]

const postTemplates = [
  {
    type: "最新情報",
    title: "サービス紹介テンプレート",
    template: "【{サービス名}のご案内】\n\n{サービスの説明（2-3文）}\n\n✅ {メリット1}\n✅ {メリット2}\n✅ {メリット3}\n\n詳しくはお気軽にお問い合わせください。\n📞 03-5776-2504",
    tips: "写真を必ず添付。CTAボタンは「詳細」を設定。",
  },
  {
    type: "イベント",
    title: "セミナー・イベント告知テンプレート",
    template: "【{イベント名}開催のお知らせ】\n\n📅 日時: {日時}\n📍 場所: {場所}\n💰 参加費: {費用}\n\n{イベント概要（2-3文）}\n\nお申し込みは下記よりお願いいたします。",
    tips: "イベント開催の1-2週間前に投稿。CTAボタンは「予約」を設定。",
  },
  {
    type: "特典",
    title: "キャンペーン告知テンプレート",
    template: "【期間限定！{キャンペーン名}】\n\n🎉 {特典内容}\n\n⏰ 期間: {開始日}〜{終了日}\n\n{キャンペーン詳細（1-2文）}\n\nこの機会をお見逃しなく！",
    tips: "期間を明記。CTAボタンは「特典を利用」を設定。",
  },
  {
    type: "コロナ対策",
    title: "安全対策のお知らせテンプレート",
    template: "【安心・安全への取り組み】\n\n当社では以下の対策を実施しております。\n\n✅ {対策1}\n✅ {対策2}\n✅ {対策3}\n\n安心してご来社ください。",
    tips: "信頼感を高める投稿。必要に応じて更新。",
  },
]

const optimizationTips = [
  { tip: "投稿頻度は週1回以上を維持しましょう", status: "warning", detail: "現在の投稿頻度: 月2-3回" },
  { tip: "全ての投稿に写真を含めましょう", status: "error", detail: "写真なし投稿が33%あります" },
  { tip: "CTAボタンを必ず設定しましょう", status: "warning", detail: "CTA未設定の投稿があります" },
  { tip: "投稿にターゲットキーワードを含めましょう", status: "ok", detail: "主要キーワードが含まれています" },
  { tip: "投稿時間は平日10-12時が最適です", status: "ok", detail: "概ね最適な時間に投稿されています" },
]

export default function PostOptimizationPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">投稿最適化</h1>

      {/* Optimization Tips */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-3">最適化チェック</h3>
          <div className="space-y-2">
            {optimizationTips.map((item) => (
              <div key={item.tip} className="flex items-center gap-3 py-2 px-3 rounded hover:bg-gray-50">
                {item.status === "ok" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : item.status === "warning" ? (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <div>
                  <span className="text-sm font-medium">{item.tip}</span>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Schedule */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4" /> 今週の投稿スケジュール
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {postSchedule.map((day) => (
              <div
                key={day.day}
                className={`p-3 rounded border text-center ${
                  day.status === "posted"
                    ? "bg-green-50 border-green-200"
                    : day.status === "scheduled"
                      ? "bg-blue-50 border-blue-200"
                      : day.status === "pending"
                        ? "bg-orange-50 border-orange-200"
                        : "bg-gray-50 border-gray-200"
                }`}
              >
                <p className="text-xs font-bold mb-1">{day.day}</p>
                <p className="text-[10px] text-muted-foreground">{day.type}</p>
                {day.status === "posted" && <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto mt-1" />}
                {day.status === "scheduled" && <Clock className="h-4 w-4 text-blue-500 mx-auto mt-1" />}
                {day.status === "pending" && <AlertTriangle className="h-4 w-4 text-orange-500 mx-auto mt-1" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Post Templates */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4">投稿テンプレート</h3>
          <div className="space-y-4">
            {postTemplates.map((tmpl) => (
              <div key={tmpl.title} className="border rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{tmpl.type}</span>
                    <span className="font-medium text-sm">{tmpl.title}</span>
                  </div>
                  <button className="text-xs bg-[#2c3e50] text-white px-3 py-1 rounded hover:bg-[#34495e]">
                    このテンプレートで投稿作成
                  </button>
                </div>
                <pre className="text-xs bg-gray-50 p-3 rounded whitespace-pre-wrap font-sans">{tmpl.template}</pre>
                <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> {tmpl.tips}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
