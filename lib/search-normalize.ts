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
