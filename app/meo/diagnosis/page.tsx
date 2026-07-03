"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Loader2 } from "lucide-react"
import { useGbp } from "@/lib/store"

type Status = "ok" | "warning" | "error" | "unknown"

interface DiagItem {
  label: string
  status: Status
  detail: string
}
interface DiagCategory {
  category: string
  items: DiagItem[]
}

/* ------------------------------- data types ------------------------------ */

interface LocationData {
  title?: string
  phoneNumbers?: { primaryPhone?: string }
  websiteUri?: string
  storefrontAddress?: { addressLines?: string[] }
  categories?: { primaryCategory?: { displayName?: string } }
  profile?: { description?: string }
  regularHours?: { periods?: unknown[] }
  specialHours?: { specialHourPeriods?: unknown[] }
}
interface MediaItem {
  mediaFormat?: string
  locationAssociation?: { category?: string }
}
interface GbpPost {
  callToAction?: { actionType?: string }
  media?: unknown[]
  createTime?: string
}
interface ReviewKpi {
  total: number
  avgRating: number
  replyRate: number
}

function b(cond: boolean): Status {
  return cond ? "ok" : "error"
}

/* --------------------------------- page ---------------------------------- */

export default function DiagnosisPage() {
  const { locationName } = useGbp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<DiagCategory[]>([])

  const load = useCallback(async () => {
    if (!locationName) {
      setCategories([])
      return
    }
    setLoading(true)
    setError(null)
    const q = `locationName=${encodeURIComponent(locationName)}`

    const [locR, mediaR, postR, revR, faqR] = await Promise.allSettled([
      fetch(`/api/gbp/locations?${q}`).then((r) => r.json()),
      fetch(`/api/gbp/media?${q}`).then((r) => r.json()),
      fetch(`/api/gbp/posts?${q}`).then((r) => r.json()),
      fetch(`/api/reviews/analytics?${q}`).then((r) => r.json()),
      fetch(`/api/gbp/qanda?${q}`).then((r) => r.json()),
    ])

    const loc: LocationData =
      locR.status === "fulfilled" ? (locR.value.location ?? {}) : {}
    const media: MediaItem[] =
      mediaR.status === "fulfilled" && Array.isArray(mediaR.value.mediaItems)
        ? mediaR.value.mediaItems
        : []
    const posts: GbpPost[] =
      postR.status === "fulfilled" && Array.isArray(postR.value.localPosts)
        ? postR.value.localPosts
        : []
    const kpi: ReviewKpi | null =
      revR.status === "fulfilled" && revR.value.kpi ? revR.value.kpi : null
    const faqAvailable =
      faqR.status === "fulfilled" && !faqR.value.error
    const faqCount =
      faqAvailable && Array.isArray(faqR.value.questions)
        ? faqR.value.questions.length
        : 0

    // データがまったく取れない場合はエラー表示
    if (locR.status !== "fulfilled" || locR.value.error) {
      setError(
        (locR.status === "fulfilled" && locR.value.error) ||
          "店舗情報を取得できませんでした。"
      )
      setLoading(false)
      return
    }

    /* ------------------------------ 基本情報 ------------------------------ */
    const desc = loc.profile?.description ?? ""
    const basic: DiagItem[] = [
      { label: "ビジネス名が設定されている", status: b(!!loc.title), detail: loc.title || "未設定" },
      {
        label: "カテゴリが設定されている",
        status: b(!!loc.categories?.primaryCategory?.displayName),
        detail: loc.categories?.primaryCategory?.displayName
          ? `メイン: ${loc.categories.primaryCategory.displayName}`
          : "未設定",
      },
      {
        label: "住所が入力されている",
        status: b(!!loc.storefrontAddress?.addressLines?.length),
        detail: loc.storefrontAddress?.addressLines?.join(" ") || "未設定",
      },
      {
        label: "電話番号が設定されている",
        status: b(!!loc.phoneNumbers?.primaryPhone),
        detail: loc.phoneNumbers?.primaryPhone || "未設定",
      },
      {
        label: "WebサイトURLが設定されている",
        status: b(!!loc.websiteUri),
        detail: loc.websiteUri || "未設定",
      },
      {
        label: "ビジネスの説明が250文字以上",
        status: desc.length >= 250 ? "ok" : desc.length > 0 ? "warning" : "error",
        detail: `現在${desc.length}文字${desc.length >= 250 ? "" : " — 250文字以上を推奨"}`,
      },
    ]

    /* ------------------------------ 営業時間 ------------------------------ */
    const hoursCount = loc.regularHours?.periods?.length ?? 0
    const specialCount = loc.specialHours?.specialHourPeriods?.length ?? 0
    const hours: DiagItem[] = [
      {
        label: "通常営業時間が設定されている",
        status: b(hoursCount > 0),
        detail: hoursCount > 0 ? `${hoursCount} 区分の営業時間を設定済み` : "未設定",
      },
      {
        label: "特別営業時間（祝日など）が設定されている",
        status: specialCount > 0 ? "ok" : "warning",
        detail: specialCount > 0 ? `${specialCount} 件設定済み` : "未設定 — 祝日前の設定を推奨",
      },
    ]

    /* --------------------------- 写真・メディア --------------------------- */
    const photoCount = media.filter((m) => m.mediaFormat !== "VIDEO").length
    const hasLogo = media.some((m) => m.locationAssociation?.category === "LOGO")
    const hasCover = media.some((m) => m.locationAssociation?.category === "COVER")
    const hasVideo = media.some((m) => m.mediaFormat === "VIDEO")
    const photos: DiagItem[] = [
      { label: "ロゴ画像が設定されている", status: b(hasLogo), detail: hasLogo ? "設定済み" : "未設定" },
      { label: "カバー写真が設定されている", status: b(hasCover), detail: hasCover ? "設定済み" : "未設定 — 設定を推奨" },
      {
        label: "写真が10枚以上アップロードされている",
        status: photoCount >= 10 ? "ok" : photoCount > 0 ? "warning" : "error",
        detail: `現在${photoCount}枚${photoCount >= 10 ? "" : " — 10枚以上を推奨"}`,
      },
      { label: "動画がアップロードされている", status: hasVideo ? "ok" : "warning", detail: hasVideo ? "設定済み" : "未設定 — 動画は表示で優位" },
    ]

    /* ------------------------------ クチコミ ------------------------------ */
    const reviews: DiagItem[] = kpi
      ? [
          {
            label: "クチコミ件数が10件以上",
            status: kpi.total >= 10 ? "ok" : kpi.total > 0 ? "warning" : "error",
            detail: `現在${kpi.total}件`,
          },
          {
            label: "平均評価が4.0以上",
            status: kpi.avgRating >= 4.0 ? "ok" : kpi.avgRating > 0 ? "warning" : "unknown",
            detail: kpi.total > 0 ? `現在${kpi.avgRating.toFixed(1)}` : "クチコミなし",
          },
          {
            label: "クチコミへの返信率が80%以上",
            status: kpi.total === 0 ? "unknown" : kpi.replyRate >= 80 ? "ok" : "warning",
            detail: kpi.total > 0 ? `現在${kpi.replyRate}%` : "クチコミなし",
          },
        ]
      : [
          {
            label: "クチコミ状況",
            status: "unknown",
            detail: "クチコミデータが同期されていません（クチコミ管理で同期してください）",
          },
        ]

    /* -------------------------------- 投稿 -------------------------------- */
    const now = Date.now()
    const recent7 = posts.filter(
      (p) => p.createTime && now - new Date(p.createTime).getTime() < 7 * 864e5
    )
    const recent30 = posts.filter(
      (p) => p.createTime && now - new Date(p.createTime).getTime() < 30 * 864e5
    )
    const ctaOk = recent30.length > 0 && recent30.every((p) => p.callToAction?.actionType)
    const photoOk = recent30.length > 0 && recent30.every((p) => p.media && p.media.length > 0)
    const postItems: DiagItem[] = [
      {
        label: "直近7日以内に投稿がある",
        status: recent7.length > 0 ? "ok" : "error",
        detail:
          recent7.length > 0
            ? `直近7日で ${recent7.length} 件`
            : "最近の投稿がありません — 週1回以上を推奨",
      },
      {
        label: "投稿にCTAボタンが設定されている",
        status: recent30.length === 0 ? "unknown" : ctaOk ? "ok" : "warning",
        detail: recent30.length === 0 ? "直近30日の投稿なし" : ctaOk ? "全投稿に設定済み" : "一部の投稿にCTA未設定",
      },
      {
        label: "投稿に写真が含まれている",
        status: recent30.length === 0 ? "unknown" : photoOk ? "ok" : "warning",
        detail: recent30.length === 0 ? "直近30日の投稿なし" : photoOk ? "全投稿に写真あり" : "写真なし投稿あり",
      },
    ]

    /* ------------------------------- その他 ------------------------------- */
    const other: DiagItem[] = [
      {
        label: "FAQが3件以上登録されている",
        status: !faqAvailable ? "unknown" : faqCount >= 3 ? "ok" : faqCount > 0 ? "warning" : "error",
        detail: !faqAvailable ? "Q&A APIが利用できません" : `${faqCount}件登録済み`,
      },
    ]

    setCategories([
      { category: "基本情報", items: basic },
      { category: "営業時間", items: hours },
      { category: "写真・メディア", items: photos },
      { category: "クチコミ", items: reviews },
      { category: "投稿", items: postItems },
      { category: "その他", items: other },
    ])
    setLoading(false)
  }, [locationName])

  useEffect(() => {
    load()
  }, [load])

  /* ------------------------------ score calc ------------------------------ */

  const { score, counts } = useMemo(() => {
    let total = 0
    let pts = 0
    const c = { ok: 0, warning: 0, error: 0, unknown: 0 }
    categories.forEach((cat) =>
      cat.items.forEach((item) => {
        c[item.status]++
        if (item.status === "unknown") return
        total++
        if (item.status === "ok") pts++
        else if (item.status === "warning") pts += 0.5
      })
    )
    return { score: total ? Math.round((pts / total) * 100) : 0, counts: c }
  }, [categories])

  const scoreColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600"
  const scoreBg =
    score >= 80 ? "bg-green-50 border-green-200" : score >= 60 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">GBP最適化診断</h1>
        <button
          onClick={load}
          disabled={loading || !locationName}
          className="bg-[#2c3e50] text-white px-5 py-2 rounded text-sm hover:bg-[#34495e] disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          再診断する
        </button>
      </div>

      {!locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            画面上部の店舗セレクタで店舗を選択すると、その店舗を実データで診断します。
          </p>
        </Card>
      )}
      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      {locationName && !error && (
        <>
          {/* Score */}
          <Card className={`mb-6 border-2 ${scoreBg}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">GBP最適化スコア</p>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-5xl font-bold ${scoreColor}`}>{score}</span>
                    <span className="text-xl text-muted-foreground">/100</span>
                  </div>
                  <p className="text-sm mt-2">
                    {loading
                      ? "診断中…"
                      : score >= 80
                        ? "良好な状態です。細かい改善でさらに上を目指しましょう。"
                        : score >= 60
                          ? "改善の余地があります。要対応項目から対応しましょう。"
                          : "改善が必要です。まずは要対応項目を優先的に対応してください。"}
                  </p>
                </div>
                <div className="flex gap-6">
                  <ScoreCount icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="完了" value={counts.ok} color="text-green-600" />
                  <ScoreCount icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />} label="注意" value={counts.warning} color="text-yellow-600" />
                  <ScoreCount icon={<XCircle className="h-4 w-4 text-red-500" />} label="要対応" value={counts.error} color="text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {loading && categories.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 実データを取得して診断中…
            </div>
          )}

          <div className="space-y-4">
            {categories.map((cat) => (
              <Card key={cat.category}>
                <CardContent className="p-5">
                  <h3 className="font-bold text-base mb-3">{cat.category}</h3>
                  <div className="space-y-2">
                    {cat.items.map((item) => (
                      <div key={item.label} className="flex items-center gap-3 py-2 px-3 rounded hover:bg-gray-50">
                        <StatusIcon status={item.status} />
                        <div className="flex-1">
                          <span className="text-sm font-medium">{item.label}</span>
                          <p className="text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ScoreCount({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="text-center">
      <div className="flex items-center gap-1 mb-1">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
    </div>
  )
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "ok") return <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
  if (status === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
  if (status === "unknown") return <HelpCircle className="h-5 w-5 text-gray-400 shrink-0" />
  return <XCircle className="h-5 w-5 text-red-500 shrink-0" />
}
