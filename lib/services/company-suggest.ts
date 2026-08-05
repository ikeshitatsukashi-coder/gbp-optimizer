/**
 * 店舗名から「同じ会社と思われるグループ」を提案する。
 *
 * ここでの提案は候補であって確定ではない。
 * 店舗名からの推測は必ず外すため（同名で別会社の可能性もある）、
 * 実際の紐づけは画面で人が確認して確定する。
 */

/** 会社名として切り出すため、営業所・支店などの拠点名を落とす */
const BRANCH_SUFFIX = new RegExp(
  "(" +
    [
      "営業所",
      "支店",
      "支社",
      "出張所",
      "工場",
      "倉庫",
      "本社",
      "本店",
      "本部",
      "センター",
      "物流センター",
      "配送センター",
      "事業所",
      "店",
    ].join("|") +
    ")$"
)

/** 法人格の表記ゆれを1つに寄せる（株式会社 / （株）/ (株) → 株式会社） */
function normalizeCorpForm(s: string): string {
  return s
    .replace(/[（(]\s*株\s*[)）]/g, "株式会社")
    .replace(/[（(]\s*有\s*[)）]/g, "有限会社")
    .replace(/[（(]\s*同\s*[)）]/g, "合同会社")
    .replace(/[（(]\s*名\s*[)）]/g, "合名会社")
    .replace(/[（(]\s*資\s*[)）]/g, "合資会社")
}

/**
 * 店舗名から会社名部分を推定する。
 * 例: 「株式会社国商運輸 伊勢崎営業所」→「株式会社国商運輸」
 *     「日本運輸（株） 本社」        →「日本運輸株式会社」
 */
export function guessCompanyName(title: string): string {
  let s = normalizeCorpForm(title.trim())
  // 全角スペースを半角に寄せてから、最後のスペース以降を拠点名候補として見る
  s = s.replace(/　/g, " ").replace(/\s+/g, " ").trim()

  const parts = s.split(" ")
  if (parts.length > 1) {
    const last = parts[parts.length - 1]
    // 末尾が拠点名で終わる場合はそこを落とす
    if (BRANCH_SUFFIX.test(last)) {
      return parts.slice(0, -1).join(" ").trim()
    }
  }
  // スペースが無い場合も末尾の拠点名を落とす（例: 「◯◯運輸東京営業所」）
  const m = s.match(
    /^(.+?)([^\s]{1,12}(営業所|支店|支社|出張所|物流センター|配送センター|センター|事業所))$/
  )
  if (m && m[1].length >= 3) return m[1].trim()

  return s
}

/** 比較用キー（記号・空白差を無視する） */
export function companyKey(name: string): string {
  return normalizeCorpForm(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・･·\-‐‑–—−,，、.．]/g, "")
}

export interface SuggestedGroup {
  /** 会社名の候補（グループ内で最も多く現れた表記） */
  companyName: string
  /** 比較キー */
  key: string
  stores: { locationName: string; title: string }[]
}

/**
 * 未紐づけ店舗を会社候補ごとにまとめる。
 * 店舗数が多いグループを先に返す（まとめて確定できるものから片付けられるように）。
 */
export function suggestCompanyGroups(
  stores: { locationName: string; title: string }[]
): SuggestedGroup[] {
  type Group = {
    names: Map<string, number>
    stores: { locationName: string; title: string }[]
  }
  const groups = new Map<string, Group>()

  for (const s of stores) {
    const guessed = guessCompanyName(s.title)
    const key = companyKey(guessed)
    if (!key) continue
    const g: Group = groups.get(key) ?? { names: new Map<string, number>(), stores: [] }
    g.names.set(guessed, (g.names.get(guessed) ?? 0) + 1)
    g.stores.push(s)
    groups.set(key, g)
  }

  const result: SuggestedGroup[] = []
  for (const [key, g] of groups) {
    // グループ内で最も多い表記を代表名にする
    const companyName = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0]
    result.push({ companyName, key, stores: g.stores })
  }

  return result.sort(
    (a, b) => b.stores.length - a.stores.length || a.companyName.localeCompare(b.companyName)
  )
}
