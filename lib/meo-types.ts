import type { KeywordCount } from "@/lib/meo-keywords"

/**
 * MEO「やることリスト」のデータの形と、点検する項目。
 * 画面とサーバーの両方から使うので、DBやGoogleの処理は置かない。
 */

/** Google から読んだ時点の、1店舗のプロフィールの状態 */
export interface MeoSnapshot {
  version: 1
  /** Googleマップでこの店舗を開くURL（ここから「プロフィールを編集」に進める） */
  mapsUri: string | null
  /** 営業時間の登録（曜日ごとの枠の数。0 = 未設定） */
  hours: number
  hasWebsite: boolean
  primaryCategory: string | null
  additionalCategories: string[]
  /** サービスの登録数 */
  services: number
  descriptionLength: number
  /** これから先の日付で登録されている特別営業時間（祝日・年末年始など）の数 */
  futureSpecialHours: number
  /** 写真欄の枚数 */
  photos: number | null
  lastPhotoAt: string | null
  lastPostAt: string | null
  reviews: {
    total: number
    average: number | null
    /** 新しい順に見た件数（最大50） */
    checked: number
    /** そのうち未返信 */
    unreplied: number
    /** そのうち未返信の星1〜2 */
    lowUnreplied: number
  } | null
  /** 直近の確定した月の検索キーワード */
  keywords: {
    month: string
    knownTotal: number
    seekingTotal: number
    seekingTop: KeywordCount[]
  } | null
  /** 読み取れなかった項目（location / media / posts / reviews / keywords） */
  errors: string[]
}

export type FixTarget = "basic-info" | "photos" | "posts" | "replies" | "photo-intake" | "google"

export interface MeoCheck {
  id: string
  /** やることの名前 */
  label: string
  /** 表の見出し用の短い名前 */
  short: string
  /** なぜ効くのか（1行） */
  why: string
  /** どこで直すか */
  fix: FixTarget
  /** この店舗に「やること」があるか。判定できない（読み取れなかった）ときは false */
  todo: (s: MeoSnapshot, now: number) => boolean
  /** いまの状態を一言で */
  state: (s: MeoSnapshot, now: number) => string
}

const DAY = 86400e3
const daysSince = (iso: string | null, now: number) =>
  iso ? Math.floor((now - new Date(iso).getTime()) / DAY) : null

/**
 * 点検する項目。上にあるものほど、設定されていない時の影響が大きい。
 * 「ほぼ全店舗が合格する項目」（電話・住所・メインカテゴリ）は入れていない。
 */
export const MEO_CHECKS: MeoCheck[] = [
  {
    id: "hours",
    label: "営業時間を登録する",
    short: "営業時間",
    why: "検索結果に「営業中」「営業時間外」が出るようになり、電話や来社の判断材料になります。",
    fix: "basic-info",
    todo: (s) => !s.errors.includes("location") && s.hours === 0,
    state: (s) => (s.hours === 0 ? "未設定" : "登録あり"),
  },
  {
    id: "categories",
    label: "追加カテゴリを設定する",
    short: "追加カテゴリ",
    why: "メインカテゴリ以外の言葉（倉庫・引越し・産業廃棄物など）での検索にも出やすくなります。",
    fix: "google",
    todo: (s) => !s.errors.includes("location") && s.additionalCategories.length === 0,
    state: (s) =>
      s.additionalCategories.length === 0
        ? `メイン「${s.primaryCategory ?? "未設定"}」のみ`
        : `追加 ${s.additionalCategories.length}件`,
  },
  {
    id: "services",
    label: "サービスを登録する",
    short: "サービス",
    why: "「サービス名＋地域」で検索した人に、取り扱いが伝わります。",
    fix: "google",
    todo: (s) => !s.errors.includes("location") && s.services === 0,
    state: (s) => (s.services === 0 ? "未登録" : `${s.services}件`),
  },
  {
    id: "website",
    label: "ウェブサイトを設定する",
    short: "サイト",
    why: "プロフィールから公式サイトへ進めるようになります。",
    fix: "basic-info",
    todo: (s) => !s.errors.includes("location") && !s.hasWebsite,
    state: (s) => (s.hasWebsite ? "設定あり" : "未設定"),
  },
  {
    id: "special_hours",
    label: "年末年始・祝日の営業時間を登録する",
    short: "祝日の時間",
    why: "登録が無いと、祝日に「営業時間が異なる場合があります」と表示されます。",
    fix: "google",
    todo: (s) => !s.errors.includes("location") && s.hours > 0 && s.futureSpecialHours === 0,
    state: (s) =>
      s.futureSpecialHours === 0 ? "これから先の登録なし" : `${s.futureSpecialHours}件 登録あり`,
  },
  {
    id: "description",
    label: "説明文を充実させる",
    short: "説明文",
    why: "説明文に入っている言葉は、検索との一致に使われます（300文字以上が目安）。",
    fix: "basic-info",
    todo: (s) => !s.errors.includes("location") && s.descriptionLength < 300,
    state: (s) => (s.descriptionLength === 0 ? "未設定" : `${s.descriptionLength}文字`),
  },
  {
    id: "photos_count",
    label: "写真を20枚以上にする",
    short: "写真の枚数",
    why: "写真の多いプロフィールほど、ルート検索やサイトへのクリックが増える傾向があります。",
    fix: "photos",
    todo: (s) => s.photos !== null && s.photos < 20,
    state: (s) => (s.photos === null ? "—" : `${s.photos}枚`),
  },
  {
    id: "photos_fresh",
    label: "新しい写真を追加する",
    short: "写真の追加",
    why: "90日以上追加が無いと、動いていないプロフィールに見えます。お客様から写真をもらう機会です。",
    fix: "photo-intake",
    todo: (s, now) => {
      if (s.photos === null || s.photos < 20) return false // 枚数が足りない店舗は上の項目で出す
      const d = daysSince(s.lastPhotoAt, now)
      return d !== null && d > 90
    },
    state: (s, now) => {
      const d = daysSince(s.lastPhotoAt, now)
      return d === null ? "—" : `最後の追加から${d}日`
    },
  },
  {
    id: "posts_fresh",
    label: "投稿を再開する",
    short: "投稿",
    why: "31日以上投稿が無いプロフィールです。週1回の投稿が止まっていないか確認します。",
    fix: "posts",
    todo: (s, now) => {
      if (s.errors.includes("posts")) return false
      const d = daysSince(s.lastPostAt, now)
      return d === null || d > 31
    },
    state: (s, now) => {
      const d = daysSince(s.lastPostAt, now)
      return d === null ? "投稿なし" : `最後の投稿から${d}日`
    },
  },
  {
    id: "replies",
    label: "クチコミに返信する",
    short: "返信",
    why: "返信のあるプロフィールは、見た人の安心につながります。低評価は早めの返信が大切です。",
    fix: "replies",
    todo: (s) => !!s.reviews && s.reviews.unreplied > 0,
    state: (s) =>
      !s.reviews
        ? "—"
        : s.reviews.unreplied === 0
          ? "未返信なし"
          : `未返信 ${s.reviews.unreplied}件` +
            (s.reviews.lowUnreplied > 0 ? `（うち星1〜2：${s.reviews.lowUnreplied}件）` : ""),
  },
]

export const FIX_LABEL: Record<FixTarget, string> = {
  "basic-info": "基本情報の画面で直す",
  photos: "写真管理で追加する",
  posts: "投稿の画面を開く",
  replies: "返信の下書きを開く",
  "photo-intake": "写真の受付ページを開く",
  google: "Googleマップで開いて直す",
}

/** このツールの中で直せる項目の、移動先 */
export const FIX_HREF: Partial<Record<FixTarget, string>> = {
  "basic-info": "/google-data/gbp/basic-info",
  photos: "/google-data/gbp/photos",
  posts: "/google-data/gbp/posts",
  replies: "/review-replies",
  "photo-intake": "/photo-intake",
}

export function checkLabel(id: string): string {
  return MEO_CHECKS.find((c) => c.id === id)?.label ?? (id === "other" ? "その他" : id)
}
