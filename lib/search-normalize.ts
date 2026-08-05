/**
 * 日本語検索用のあいまい正規化。
 * 「アイリンク」で「株式会社アイ・リンク」がヒットするように、
 * 中黒・空白・ハイフン類・括弧を除去し、全角半角を統一（NFKC）、
 * ひらがなをカタカナに寄せてから比較する。
 * クエリ側と対象側の両方に同じ正規化をかけて includes 判定すること。
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    )
    .replace(/[\s・･·•．.,、()[\]｢｣「」_＿\-‐‑–—−]/g, "")
}

/**
 * 法人格の表記を取り除く。
 *
 * GBP側とスプレッドシート側で「北池 運送」「有限会社北池運送」のように
 * 法人格の有無が違うだけで照合に失敗するため、比較用にこれを落とした形も作る。
 *
 * 「（株）」等の略記も先に正式表記へ寄せてから除去する。
 */
export function stripCorpForm(input: string): string {
  return input
    .replace(/[（(]\s*株\s*[)）]/g, "株式会社")
    .replace(/[（(]\s*有\s*[)）]/g, "有限会社")
    .replace(/[（(]\s*同\s*[)）]/g, "合同会社")
    .replace(/[（(]\s*名\s*[)）]/g, "合名会社")
    .replace(/[（(]\s*資\s*[)）]/g, "合資会社")
    .replace(
      /(株式会社|有限会社|合同会社|合名会社|合資会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|医療法人|学校法人|社会福祉法人|協同組合|事業協同組合)/g,
      ""
    )
    .trim()
}

/** 法人格を除いたうえで検索用に正規化する（比較専用） */
export function normalizeCoreName(input: string): string {
  return normalizeSearchText(stripCorpForm(input))
}
