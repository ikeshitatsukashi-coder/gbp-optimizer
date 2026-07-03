"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar, Clock, TrendingUp, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { useGbp } from "@/lib/store"

interface GbpPost {
  summary?: string
  callToAction?: { actionType?: string }
  media?: unknown[]
  createTime?: string
  topicType?: string
}

interface ScheduledPost {
  scheduledFor: string
  postType: string
  status: string
}

const TOPIC_LABELS: Record<string, string> = {
  STANDARD: "最新情報",
  EVENT: "イベント",
  OFFER: "特典",
  ALERT: "お知らせ",
}

const postTemplates = [
  {
    type: "最新情報",
    title: "サービス紹介テンプレート",
    template:
      "【{サービス名}のご案内】\n\n{サービスの説明（2-3文）}\n\n✅ {メリット1}\n✅ {メリット2}\n✅ {メリット3}\n\n詳しくはお気軽にお問い合わせください。",
    tips: "写真を必ず添付。CTAボタンは「詳細」を設定。",
  },
  {
    type: "イベント",
    title: "セミナー・イベント告知テンプレート",
    template:
      "【{イベント名}開催のお知らせ】\n\n📅 日時: {日時}\n📍 場所: {場所}\n💰 参加費: {費用}\n\n{イベント概要（2-3文）}\n\nお申し込みは下記よりお願いいたします。",
    tips: "イベント開催の1-2週間前に投稿。CTAボタンは「予約」を設定。",
  },
  {
    type: "特典",
    title: "キャンペーン告知テンプレート",
    template:
      "【期間限定！{キャンペーン名}】\n\n🎉 {特典内容}\n\n⏰ 期間: {開始日}〜{終了日}\n\n{キャンペーン詳細（1-2文）}\n\nこの機会をお見逃しなく！",
    tips: "期間を明記。CTAボタンは「特典を利用」を設定。",
  },
]

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]

function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() - r.getDay()) // Sunday start
  return r
}

export default function PostOptimizationPage() {
  const { locationName } = useGbp()
  const [posts, setPosts] = useState<GbpPost[]>([])
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!locationName) {
      setPosts([])
      setScheduled([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`/api/gbp/posts?locationName=${encodeURIComponent(locationName)}`),
        fetch(`/api/scheduled-posts?locationName=${encodeURIComponent(locationName)}`),
      ])
      const pj = await pRes.json()
      const sj = await sRes.json()
      setPosts(Array.isArray(pj.localPosts) ? pj.localPosts : [])
      setScheduled(Array.isArray(sj.posts) ? sj.posts : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [locationName])

  useEffect(() => {
    load()
  }, [load])

  /* -------------------------- optimization checks ------------------------- */

  const checks = useMemo(() => {
    const now = Date.now()
    const days30 = posts.filter(
      (p) => p.createTime && now - new Date(p.createTime).getTime() < 30 * 864e5
    )
    const days7 = posts.filter(
      (p) => p.createTime && now - new Date(p.createTime).getTime() < 7 * 864e5
    )
    const withPhoto = days30.filter((p) => p.media && p.media.length > 0).length
    const withCta = days30.filter((p) => p.callToAction?.actionType).length
    const noPhotoRate = days30.length ? Math.round((1 - withPhoto / days30.length) * 100) : 0
    const ctaRate = days30.length ? Math.round((withCta / days30.length) * 100) : 0

    return [
      {
        tip: "投稿頻度は週1回以上を維持しましょう",
        status: days7.length >= 1 ? "ok" : "warning",
        detail:
          days7.length >= 1
            ? `直近7日で ${days7.length} 件投稿`
            : `直近30日で ${days30.length} 件（週1回未満）`,
      },
      {
        tip: "全ての投稿に写真を含めましょう",
        status: days30.length === 0 ? "warning" : noPhotoRate === 0 ? "ok" : noPhotoRate > 30 ? "error" : "warning",
        detail:
          days30.length === 0 ? "直近30日の投稿がありません" : `写真なし投稿が ${noPhotoRate}%`,
      },
      {
        tip: "CTAボタンを必ず設定しましょう",
        status: days30.length === 0 ? "warning" : ctaRate >= 80 ? "ok" : "warning",
        detail: days30.length === 0 ? "直近30日の投稿がありません" : `CTA設定率 ${ctaRate}%`,
      },
    ]
  }, [posts])

  /* ------------------------------ weekly grid ----------------------------- */

  const weekGrid = useMemo(() => {
    const weekStart = startOfWeek(new Date())
    const cells = WEEKDAYS.map((label, i) => {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + i)
      const dayEnd = new Date(day)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const inDay = (iso?: string) => {
        if (!iso) return false
        const t = new Date(iso).getTime()
        return t >= day.getTime() && t < dayEnd.getTime()
      }
      const posted = posts.find((p) => inDay(p.createTime))
      const sched = scheduled.find((s) => s.status === "pending" && inDay(s.scheduledFor))
      if (posted) {
        return { day: label, type: TOPIC_LABELS[posted.topicType ?? "STANDARD"] ?? "投稿", status: "posted" }
      }
      if (sched) {
        return { day: label, type: TOPIC_LABELS[sched.postType] ?? "予約", status: "scheduled" }
      }
      return { day: label, type: "-", status: "empty" }
    })
    return cells
  }, [posts, scheduled])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">投稿最適化</h1>

      {!locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            画面上部の店舗セレクタで店舗を選択すると、その店舗の投稿状況を分析します。
          </p>
        </Card>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> 分析中…
        </div>
      )}
      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      {/* Optimization checks */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-3">最適化チェック（直近30日の投稿から算出）</h3>
          <div className="space-y-2">
            {checks.map((item) => (
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

      {/* Weekly schedule */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4" /> 今週の投稿状況（投稿済み・予約）
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {weekGrid.map((day, i) => (
              <div
                key={i}
                className={`p-3 rounded border text-center ${
                  day.status === "posted"
                    ? "bg-green-50 border-green-200"
                    : day.status === "scheduled"
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-200"
                }`}
              >
                <p className="text-xs font-bold mb-1">{day.day}</p>
                <p className="text-[10px] text-muted-foreground">{day.type}</p>
                {day.status === "posted" && <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto mt-1" />}
                {day.status === "scheduled" && <Clock className="h-4 w-4 text-blue-500 mx-auto mt-1" />}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            予約投稿は
            <a href="/google-data/gbp/posts" className="text-blue-500 hover:underline mx-1">
              投稿ページ
            </a>
            から作成できます。
          </p>
        </CardContent>
      </Card>

      {/* Post templates */}
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
                  <a
                    href="/google-data/gbp/posts"
                    className="text-xs bg-[#2c3e50] text-white px-3 py-1 rounded hover:bg-[#34495e]"
                  >
                    投稿ページで作成
                  </a>
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
