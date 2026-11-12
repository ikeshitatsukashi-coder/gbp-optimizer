/**
 * 月次レポートのデータの形と、月の計算。
 * サーバー（集計）と画面（表示）の両方から使うので、ここにはDBやGoogleの処理を置かない。
 */

export const JST_MS = 9 * 3600e3

export interface ReviewMonth {
  /** その月の終わり時点のクチコミ総数 */
  total: number
  /** その月の終わり時点の平均評価 */
  average: number | null
  /** その月に新しく付いた件数 */
  added: number
}

export interface MonthlyReportData {
  version: 1
  locationName: string
  storeTitle: string
  /** 都道府県＋市区町村（分かる場合） */
  area: string | null
  /** YYYY-MM（日本時間） */
  month: string
  /** 推移に使う6か月（古い順。最後が month） */
  months: string[]
  generatedAt: string
  period: {
    firstDay: string
    lastDay: string
    /** 月の途中までの集計か（今月分） */
    isPartial: boolean
  }
  posts: {
    count: number
    prevCount: number
    withPhoto: number
    byMonth: Record<string, number>
    items: { createTime: string; summary: string; photoUrl: string | null; hasButton: boolean }[]
  } | null
  photos: {
    /** 写真欄に追加した枚数 */
    added: number
    prevAdded: number
    /** 写真欄の総数 */
    total: number
    byMonth: Record<string, number>
    items: { createTime: string; thumbnailUrl: string; isVideo: boolean }[]
  } | null
  insights: {
    byMonth: Record<
      string,
      { impressions: number; calls: number; directions: number; websiteClicks: number }
    >
    /** 数字が入っている最後の日（Googleの集計は数日遅れる） */
    lastDataDay: string | null
  } | null
  reviews: {
    total: number
    average: number | null
    added: number
    prevAdded: number
    repliedInMonth: number
    byMonth: Record<string, ReviewMonth>
    voices: { star: number; reviewer: string | null; comment: string; createTime: string }[]
  } | null
  errors: { section: "posts" | "photos" | "insights" | "reviews"; message: string }[]
}

export function isValidMonth(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
}

/** 日時 → 日本時間の YYYY-MM */
export function jstMonthKey(t: string | Date): string {
  const d = typeof t === "string" ? new Date(t) : t
  return new Date(d.getTime() + JST_MS).toISOString().slice(0, 7)
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

/** その月（日本時間）の始まりと終わり（終わりは翌月1日0時）を、実際の時刻で返す */
export function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - JST_MS),
    end: new Date(Date.UTC(y, m, 1) - JST_MS),
  }
}

export function lastSixMonths(month: string): string[] {
  return [-5, -4, -3, -2, -1, 0].map((d) => shiftMonth(month, d))
}

/** いまの月（日本時間） */
export function currentMonth(): string {
  return jstMonthKey(new Date())
}

/** レポートを出せる月か（先の月は不可・Googleが数字を返すのは過去18か月まで） */
export function isReportableMonth(month: string): boolean {
  if (!isValidMonth(month)) return false
  const cur = currentMonth()
  return month <= cur && month >= shiftMonth(cur, -16)
}
