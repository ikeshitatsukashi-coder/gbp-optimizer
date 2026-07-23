/**
 * 店舗名からグループ（会社名）を推定する。
 * 命名規則「会社名 支店名（例: 丸進運輸株式会社 本社）」を利用し、
 * 最初の空白より前を会社名（グループ）とみなす。
 * 空白がない単独店舗（例: 辻水産株式会社）は、それ自体が1グループ。
 *
 * ※ 将来 parentCompany を店舗マスタに設定した場合はそちらを優先する運用も可能。
 */
export function deriveStoreGroup(title: string): string {
  const t = title.trim()
  // 半角/全角スペースの最初の位置で分割
  const m = t.match(/^(.+?)[\s　]/)
  if (m && m[1].length >= 2) return m[1]
  return t
}
