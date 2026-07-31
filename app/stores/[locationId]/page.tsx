"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Building2,
  Share2,
  Bell,
  Camera,
  Globe,
  MessageCircle,
  BarChart3,
  Trash2,
  ExternalLink,
  Info,
} from "lucide-react"
import { fetchJsonRetry } from "@/lib/fetch-json"
import { LinePanel } from "@/components/stores/line-panel"
import { Ga4Panel } from "@/components/stores/ga4-panel"

/* -------------------------------------------------------------------------- */
/*  店舗詳細 — 基本情報 / SNS・外部連携 / 通知設定                              */
/* -------------------------------------------------------------------------- */

interface Store {
  locationName: string
  title: string
  address: Record<string, unknown> | null
  primaryPhone: string | null
  primaryCategory: string | null
  status: string
  industry: string
  autoReplyEnabled: boolean
  autoFlagEnabled: boolean
  parentCompany: string | null
  placeId: string | null
  newReviewUri: string | null
  notifyEmail: string | null
  reviewNotifyKeywords: string[] | null
  notes: string | null
  lastSyncedAt: string | null
}

interface Connection {
  id: number
  provider: string
  accountName: string | null
  externalId: string | null
  status: string
  settings: Record<string, unknown> | null
  lastSyncedAt: string | null
  errorMessage: string | null
}

const INDUSTRY_LABELS: Record<string, string> = {
  btob_logistics: "運送・物流・倉庫・観光バス",
  bakery: "ベーカリー",
  funeral: "葬祭",
  restaurant: "飲食店",
  construction: "建設・不動産・建物管理",
  staffing: "人材派遣",
  buyback: "買取・質屋・リサイクル",
  general_btoc: "その他BtoC",
  general_btob: "その他BtoB",
}

const STATUS_LABELS: Record<string, string> = {
  active: "運用中",
  paused: "一時停止",
  archived: "アーカイブ",
}

/** 連携プロバイダの定義（承認が必要なものは note に明記） */
const PROVIDERS = [
  {
    key: "instagram",
    label: "Instagram連携",
    icon: Camera,
    color: "#d6249f",
    desc: "Instagramに投稿された内容をGoogleビジネスプロフィールへ転載します。",
    note: "Metaのアプリ審査（4〜6週間）の承認後に有効化されます。",
    fields: [
      { key: "accountName", label: "Instagramユーザー名（@なし）", placeholder: "kyowaexpress_official" },
      { key: "externalId", label: "InstagramビジネスID（分かる場合）", placeholder: "17841400000000000" },
    ],
    options: [
      { key: "toGbp", label: "IG → GBP投稿を有効にする" },
      { key: "stripHashtags", label: "ハッシュタグを除いて投稿する" },
      { key: "excludePhone", label: "電話番号を含む投稿は転載しない（Googleポリシー推奨）" },
    ],
  },
  {
    key: "facebook",
    label: "Facebook連携",
    icon: Globe,
    color: "#1877f2",
    desc: "FacebookページのGoogleビジネスプロフィールへの転載に使用します。",
    note: "Metaのアプリ審査（4〜6週間）の承認後に有効化されます。",
    fields: [
      { key: "accountName", label: "Facebookページ名", placeholder: "協和興運株式会社" },
      { key: "externalId", label: "FacebookページID", placeholder: "359777337213654" },
    ],
    options: [
      { key: "toGbp", label: "FB → GBP投稿を有効にする" },
      { key: "excludePhone", label: "電話番号を含む投稿は転載しない" },
    ],
  },
  {
    key: "line",
    label: "LINE連携",
    icon: MessageCircle,
    color: "#06c755",
    desc: "LINE公式アカウントからの配信・クーポン等に使用します。",
    note: "審査不要・無料枠ありで今すぐ使えます。登録後に「接続を確認する」を押してください。",
    fields: [
      { key: "accountName", label: "LINE公式アカウント名", placeholder: "＠kyowa" },
      { key: "externalId", label: "チャネルID", placeholder: "1234567890" },
      { key: "accessToken", label: "チャネルアクセストークン", placeholder: "（保存後は非表示）", secret: true },
    ],
    options: [],
  },
  {
    key: "ga4",
    label: "Google Analytics（GA4）連携",
    icon: BarChart3,
    color: "#e8710a",
    desc: "サイト側の流入データをあわせて確認するために使用します。",
    note: "審査不要。閲覧権限のあるGoogleアカウントでログインしている必要があります（初回はログアウト→再ログインで権限の許可が必要）。",
    fields: [
      { key: "externalId", label: "GA4 プロパティID", placeholder: "properties/123456789" },
    ],
    options: [],
  },
] as const

export default function StoreDetailPage() {
  const params = useParams<{ locationId: string }>()
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  // ヘッダーの店舗メニューから ?tab=social / ?tab=notify で直接開けるようにする
  const searchParams = useSearchParams()
  const initialTab = (() => {
    const t = searchParams.get("tab")
    return t === "social" || t === "notify" ? t : "basic"
  })()
  const [tab, setTab] = useState<"basic" | "social" | "notify">(initialTab)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // 編集用フォーム
  const [form, setForm] = useState({
    status: "active",
    industry: "general_btoc",
    parentCompany: "",
    notes: "",
    notifyEmail: "",
    keywords: "",
    autoReplyEnabled: false,
    autoFlagEnabled: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // DBが休止から復帰する直後は初回クエリだけタイムアウトすることがあるため再試行つきで取得
      const [sRes, cRes] = await Promise.all([
        fetchJsonRetry<{ store: Store }>(`/api/stores/${params.locationId}`),
        fetchJsonRetry<{ connections: Connection[] }>(
          `/api/stores/${params.locationId}/connections`
        ),
      ])
      if (!sRes.ok || !sRes.data?.store) {
        throw new Error(sRes.error || `HTTP ${sRes.status}`)
      }
      const s: Store = sRes.data.store
      setStore(s)
      setForm({
        status: s.status,
        industry: s.industry,
        parentCompany: s.parentCompany ?? "",
        notes: s.notes ?? "",
        notifyEmail: s.notifyEmail ?? "",
        keywords: (s.reviewNotifyKeywords ?? []).join("\n"),
        autoReplyEnabled: s.autoReplyEnabled,
        autoFlagEnabled: s.autoFlagEnabled,
      })
      if (cRes.ok) {
        setConnections(cRes.data?.connections ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [params.locationId])

  useEffect(() => {
    load()
  }, [load])

  const saveStore = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/stores/${params.locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.status,
          industry: form.industry,
          parentCompany: form.parentCompany.trim() || null,
          notes: form.notes,
          notifyEmail: form.notifyEmail.trim() || null,
          reviewNotifyKeywords: form.keywords
            .split("\n")
            .map((k) => k.trim())
            .filter(Boolean),
          autoReplyEnabled: form.autoReplyEnabled,
          autoFlagEnabled: form.autoFlagEnabled,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setSuccess("保存しました")
      await load()
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const addressLine = (() => {
    const a = store?.address as
      | { administrativeArea?: string; locality?: string; addressLines?: string[] }
      | null
      | undefined
    if (!a) return "—"
    return (
      [a.administrativeArea, a.locality, ...(a.addressLines ?? [])].filter(Boolean).join(" ") ||
      "—"
    )
  })()

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
      </div>
    )
  }

  if (!store) {
    return (
      <Card className="p-4 bg-red-50 border-red-200">
        <p className="text-sm text-red-800">{error ?? "店舗が見つかりません"}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <button
        onClick={() => router.push("/stores")}
        className="text-sm text-[#4a90e2] hover:underline flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" /> 店舗一覧へ戻る
      </button>

      <div>
        <h1 className="text-2xl font-bold">{store.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {addressLine}
          {store.primaryPhone && `　TEL ${store.primaryPhone}`}
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}
      {success && (
        <Card className="p-4 bg-green-50 border-green-200 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
          <p className="text-sm text-green-800">{success}</p>
        </Card>
      )}

      {/* タブ */}
      <div className="flex border-b">
        {(
          [
            { key: "basic", label: "基本情報・運用設定", icon: Building2 },
            { key: "social", label: "SNS・外部連携", icon: Share2 },
            { key: "notify", label: "クチコミ通知", icon: Bell },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === t.key
                ? "border-[#4a90e2] text-[#4a90e2]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* --- 基本情報 --- */}
      {tab === "basic" && (
        <Card className="p-5 space-y-4">
          <div className="bg-gray-50 border rounded p-3 text-xs text-gray-600 leading-relaxed">
            店舗名・住所・電話番号・カテゴリは Google ビジネスプロフィール側の情報です
            （「店舗マスタ → 同期」で最新化されます）。ここでは社内運用のための設定を編集します。
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1">運用ステータス</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full h-10 px-2 text-sm border rounded"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">業種（返信トーン切替）</label>
              <select
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full h-10 px-2 text-sm border rounded"
              >
                {Object.entries(INDUSTRY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">親会社・グループ名</label>
            <input
              type="text"
              value={form.parentCompany}
              onChange={(e) => setForm({ ...form, parentCompany: e.target.value })}
              placeholder="例: 株式会社アイ・リンクホールディングス"
              className="w-full h-10 px-3 text-sm border rounded"
            />
            <p className="text-xs text-muted-foreground mt-1">
              お客様共有ページのグループ単位発行に使われます。
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoReplyEnabled}
                onChange={(e) => setForm({ ...form, autoReplyEnabled: e.target.checked })}
              />
              自動返信バッチの対象にする
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoFlagEnabled}
                onChange={(e) => setForm({ ...form, autoFlagEnabled: e.target.checked })}
              />
              低評価クチコミの削除申請バッチの対象にする
            </label>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">社内メモ</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm border rounded"
            />
          </div>

          <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
            <div className="text-xs text-muted-foreground">
              {store.newReviewUri && (
                <a
                  href={store.newReviewUri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#4a90e2] hover:underline inline-flex items-center gap-1"
                >
                  クチコミ投稿ページを開く <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <Button onClick={saveStore} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 保存中…
                </>
              ) : (
                "保存する"
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* --- SNS・外部連携 --- */}
      {tab === "social" && (
        <div className="space-y-4">
          <Card className="p-4 bg-blue-50 border-blue-200 flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-900 leading-relaxed">
              <p className="font-bold mb-1">連携の進め方</p>
              Instagram・Facebook は Meta のアプリ審査（<b>4〜6週間</b>
              ）の承認が必要です。承認前でもここにアカウント情報を登録しておけば、
              承認後すぐに転載を開始できます。<b>LINE・GA4 は審査不要で、いま動きます。</b>
            </div>
          </Card>

          {PROVIDERS.map((p) => (
            <ConnectionCard
              key={p.key}
              provider={p}
              locationId={params.locationId}
              connections={connections.filter((c) => c.provider === p.key)}
              onChanged={load}
              onError={setError}
            />
          ))}
        </div>
      )}

      {/* --- クチコミ通知 --- */}
      {tab === "notify" && (
        <Card className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1">通知先メールアドレス</label>
            <input
              type="email"
              value={form.notifyEmail}
              onChange={(e) => setForm({ ...form, notifyEmail: e.target.value })}
              placeholder="例: tantou@example.com（空欄なら通知しません）"
              className="w-full h-10 px-3 text-sm border rounded max-w-md"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">
              通知キーワード（1行1語・空欄なら新着クチコミすべてを通知）
            </label>
            <textarea
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              rows={5}
              placeholder={"例\n遅い\n態度\n運転"}
              className="w-full px-3 py-2 text-sm border rounded font-mono max-w-md"
            />
            <p className="text-xs text-muted-foreground mt-1">
              指定した語を含む新着クチコミが入ったときだけメールで通知します。
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
            通知メールの送信には、クチコミ促進の「クチコミ依頼（メール）」と同じ送信設定（SMTP）を使用します。
            設定が未完了の場合は通知されません。
          </div>
          <div className="flex justify-end">
            <Button onClick={saveStore} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 保存中…
                </>
              ) : (
                "保存する"
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ----------------------------- 連携カード ----------------------------- */

function ConnectionCard({
  provider,
  locationId,
  connections,
  onChanged,
  onError,
}: {
  provider: (typeof PROVIDERS)[number]
  locationId: string
  connections: Connection[]
  onChanged: () => void
  onError: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [options, setOptions] = useState<Record<string, boolean>>({})

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/stores/${locationId}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.key,
          accountName: values.accountName,
          externalId: values.externalId,
          accessToken: values.accessToken,
          // 審査が必要なものは pending、不要なものは connected
          // IG/FBは審査待ち、LINEは疎通確認が通るまで未確認として扱う
          status:
            provider.key === "instagram" ||
            provider.key === "facebook" ||
            provider.key === "line"
              ? "pending"
              : "connected",
          settings: options,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setOpen(false)
      setValues({})
      setOptions({})
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm("この連携を解除しますか？")) return
    try {
      const res = await fetch(`/api/stores/${locationId}/connections?id=${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    }
  }

  const Icon = provider.icon

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span
            className="w-9 h-9 rounded flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${provider.color}18` }}
          >
            <Icon className="h-5 w-5" style={{ color: provider.color }} />
          </span>
          <div>
            <h2 className="text-base font-bold">{provider.label}</h2>
            <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{provider.desc}</p>
            <p className="text-xs text-amber-700 mt-1">{provider.note}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
          {open ? "閉じる" : "アカウントを追加"}
        </Button>
      </div>

      {/* 登録済み */}
      {connections.length > 0 && (
        <div className="mt-4 border rounded divide-y">
          {connections.map((c) => (
            <div key={c.id} className="px-3 py-2 flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0">
                <span className="font-medium">{c.accountName ?? "（名称未設定）"}</span>
                {c.externalId && (
                  <span className="text-xs text-gray-500 ml-2">ID: {c.externalId}</span>
                )}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                  c.status === "connected"
                    ? "bg-green-100 text-green-700"
                    : c.status === "pending"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                {c.status === "connected"
                  ? "連携中"
                  : c.status === "pending"
                    ? provider.key === "line"
                      ? "未確認"
                      : "審査待ち"
                    : "エラー"}
              </span>
              <button
                onClick={() => remove(c.id)}
                className="text-gray-400 hover:text-red-500"
                title="解除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* LINE: 接続確認と配信（審査不要なのでこの場で動く） */}
      {provider.key === "line" && connections.length > 0 && (
        <LinePanel
          locationId={locationId}
          connectionId={connections[0].id}
          onError={onError}
        />
      )}

      {/* GA4: サイト側の数値 */}
      {provider.key === "ga4" && connections.length > 0 && (
        <Ga4Panel locationId={locationId} onError={onError} />
      )}

      {/* 追加フォーム */}
      {open && (
        <div className="mt-4 border-t pt-4 space-y-3">
          {provider.fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              <input
                type={"secret" in f && f.secret ? "password" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="w-full h-9 px-3 text-sm border rounded"
              />
            </div>
          ))}
          {provider.options.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {provider.options.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!options[o.key]}
                    onChange={(e) => setOptions({ ...options, [o.key]: e.target.checked })}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "登録する"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
