/**
 * 検索キーワードを「お店を知っている人の検索」と「探している人の検索」に分ける。
 *
 *   知っている人 … 社名・住所・電話番号で検索した（もともとお店を知っている）
 *   探している人 … 業種や地域など、一般の言葉で検索した（MEOで伸ばしたいのはこちら）
 *
 * 画面とサーバーの両方から使うので、DBやGoogleの処理は置かない。
 */

export interface KeywordCount {
  word: string
  /** null = Google が「15回未満」などとしか教えてくれなかった */
  count: number | null
  under?: number
}

export type KeywordKind = "known" | "seeking"

/** 比べやすい形にそろえる（全角半角・大文字小文字・空白・記号の違いをならす） */
export function normalizeWord(s: string): string {
  return (
    s
      .normalize("NFKC")
      .toLowerCase()
      // ひらがなはカタカナにそろえる（「ぱる」と「パル」を同じに扱う）
      .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
      .replace(/[\s　・･.,，、。\-‐‑–—―ー()（）「」『』【】[\]/／&＆'’"”]/g, "")
      // 「ケイ」と「ケー」のような伸ばし方の違いをならす（ー はすでに消してある）
      .replace(/([エケセテネヘメレゲゼデベペ])イ/g, "$1")
  )
}

/** アルファベットの読み（K→ケー、S→エス）。「KSI」と「ケーエスアイ」を同じ社名として扱うため */
const LETTER_KANA: Record<string, string> = {
  a: "エー", b: "ビー", c: "シー", d: "ディー", e: "イー", f: "エフ", g: "ジー", h: "エイチ",
  i: "アイ", j: "ジェー", k: "ケー", l: "エル", m: "エム", n: "エヌ", o: "オー", p: "ピー",
  q: "キュー", r: "アール", s: "エス", t: "ティー", u: "ユー", v: "ブイ", w: "ダブリュー",
  x: "エックス", y: "ワイ", z: "ゼット",
}
const LETTER_KANA_NORM: [string, string][] = [
  ...Object.entries(LETTER_KANA),
  // 社名でよく使われる別の読み（D＝デー／デイ、T＝テー）
  ["d", "デー"],
  ["t", "テー"],
]
  .map(([l, k]) => [l, normalizeWord(k)] as [string, string])
  .sort((a, b) => b[1].length - a[1].length)

const isLatin = (x: string) => /^[a-z0-9]+$/.test(x)

/** 「spec」→「エスピーイーシー」（ならした形で返す） */
function lettersToKana(latin: string): string | null {
  if (!/^[a-z]{2,6}$/.test(latin)) return null
  return normalizeWord([...latin].map((ch) => LETTER_KANA[ch]).join(""))
}

/** 「ケイエスアイ」→「ksi」。アルファベットの読みだけでできている言葉の時だけ返す */
function kanaToLetters(kana: string): string | null {
  let rest = kana
  let out = ""
  while (rest.length > 0) {
    const hit = LETTER_KANA_NORM.find(([, k]) => rest.startsWith(k))
    if (!hit) return null
    out += hit[0]
    rest = rest.slice(hit[1].length)
  }
  return out.length >= 2 && out.length <= 6 ? out : null
}

const ROMAJI: Record<string, string> = {
  キャ: "kya", キュ: "kyu", キョ: "kyo", シャ: "sha", シュ: "shu", ショ: "sho", チャ: "cha",
  チュ: "chu", チョ: "cho", ニャ: "nya", ニュ: "nyu", ニョ: "nyo", ヒャ: "hya", ヒュ: "hyu",
  ヒョ: "hyo", ミャ: "mya", ミュ: "myu", ミョ: "myo", リャ: "rya", リュ: "ryu", リョ: "ryo",
  ギャ: "gya", ギュ: "gyu", ギョ: "gyo", ジャ: "ja", ジュ: "ju", ジョ: "jo", ビャ: "bya",
  ビュ: "byu", ビョ: "byo", ピャ: "pya", ピュ: "pyu", ピョ: "pyo", ファ: "fa", フィ: "fi",
  フェ: "fe", フォ: "fo", ティ: "ti", ディ: "di", ジェ: "je", チェ: "che", シェ: "she",
  ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o", カ: "ka", キ: "ki", ク: "ku", ケ: "ke", コ: "ko",
  サ: "sa", シ: "shi", ス: "su", セ: "se", ソ: "so", タ: "ta", チ: "chi", ツ: "tsu", テ: "te",
  ト: "to", ナ: "na", ニ: "ni", ヌ: "nu", ネ: "ne", ノ: "no", ハ: "ha", ヒ: "hi", フ: "fu",
  ヘ: "he", ホ: "ho", マ: "ma", ミ: "mi", ム: "mu", メ: "me", モ: "mo", ヤ: "ya", ユ: "yu",
  ヨ: "yo", ラ: "ra", リ: "ri", ル: "ru", レ: "re", ロ: "ro", ワ: "wa", ヲ: "o", ン: "n",
  ガ: "ga", ギ: "gi", グ: "gu", ゲ: "ge", ゴ: "go", ザ: "za", ジ: "ji", ズ: "zu", ゼ: "ze",
  ゾ: "zo", ダ: "da", ヂ: "ji", ヅ: "zu", デ: "de", ド: "do", バ: "ba", ビ: "bi", ブ: "bu",
  ベ: "be", ボ: "bo", パ: "pa", ピ: "pi", プ: "pu", ペ: "pe", ポ: "po", ヴ: "vu",
}

/** カタカナ → ローマ字（「パル」→ paru）。カタカナ以外が混ざっていたら null */
function toRomaji(kana: string): string | null {
  let out = ""
  for (let i = 0; i < kana.length; ) {
    if (kana[i] === "ッ") {
      i++
      continue
    }
    const two = ROMAJI[kana.slice(i, i + 2)]
    if (two) {
      out += two
      i += 2
      continue
    }
    const one = ROMAJI[kana[i]]
    if (!one) return null
    out += one
    i++
  }
  return out
}

const CORP_WORDS = [
  "株式会社",
  "有限会社",
  "合同会社",
  "合資会社",
  "一般社団法人",
  "(株)",
  "（株）",
  "㈱",
  "(有)",
  "（有）",
  "㈲",
]
const BRANCH_WORDS =
  /(本社|本店|支社|支店|営業所|事業所|出張所|センター|工場|作業所|倉庫|ホールディングス|グループ)$/

/**
 * 店舗名から「社名として通じる芯の部分」を取り出す。
 * 例: 「株式会社アイ・リンク」→ アイリンク ／「日本運輸株式会社 本社」→ 日本運輸
 *     「有限会社フロンティア 入谷リサイクル工場」→ フロンティア
 */
export function brandCores(storeTitle: string, extra: string[] = []): string[] {
  let t = storeTitle.normalize("NFKC")
  for (const w of CORP_WORDS) t = t.split(w.normalize("NFKC")).join(" ")
  const parts = t
    .split(/[\s　]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const cores = new Set<string>()
  // 先頭のかたまりが社名（「〇〇本社」「〇〇営業所」のような後ろの言葉は落とす）
  if (parts[0]) {
    let core = normalizeWord(parts[0])
    for (let i = 0; i < 2; i++) core = core.replace(BRANCH_WORDS, "")
    if (core.length >= 2) cores.add(core)
  }
  // 2つ目以降のかたまりは、支店・営業所の名前（＝地名）であることが多いので社名にしない。
  // 「エコレ城南島」のような施設の固有名（支店を表す言葉で終わらないもの）だけ、社名と同じ扱いにする
  for (const part of parts.slice(1)) {
    const n = normalizeWord(part)
    if (n.length >= 4 && !BRANCH_WORDS.test(n)) cores.add(n)
  }
  for (const e of extra) {
    const n = normalizeWord(e)
    if (n.length >= 2) cores.add(n)
  }
  // アルファベットの社名はカタカナ読みでも、カタカナ読みの社名はアルファベットでも検索される
  for (const c of [...cores]) {
    const alt = isLatin(c) ? lettersToKana(c) : kanaToLetters(c)
    if (alt && alt.length >= 2) cores.add(alt)
  }
  return [...cores]
}

/** 住所・電話番号での検索か（番地や電話番号のように数字が続く・郵便番号・都道府県から始まる） */
export function looksLikeAddressOrPhone(raw: string): boolean {
  const s = raw.normalize("NFKC")
  if (/\d{2,4}[-\s]?\d{2,4}[-\s]?\d{3,4}/.test(s)) return true // 電話番号
  if (/〒|\d{3}-\d{4}/.test(s)) return true // 郵便番号
  if (/^(北海道|東京都|(京都|大阪)府|.{2,3}県).+\d/.test(s)) return true // 住所（都道府県＋番地）
  if (/[市区町村郡].*\d+\s*([-−ー‐]|番|丁目)\s*\d*/.test(s)) return true // 住所（市区町村＋番地）
  return false
}

/** 2つの言葉が何文字違うか（入れ替え・抜け・余分を1文字ずつ数える） */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return dp[a.length][b.length]
}

/**
 * 社名を打ちかけた・打ち間違えた検索か。
 *   「極東」      … 社名「極東運輸」の頭の部分だけ
 *   「極東運送」  … 社名と出だしが同じで、1〜2文字だけ違う
 */
function nearBrand(n: string, core: string): boolean {
  if (n.length >= 2 && core.startsWith(n)) return true
  return (
    n.length >= 3 &&
    Math.abs(n.length - core.length) <= 1 &&
    n.slice(0, 2) === core.slice(0, 2) &&
    distance(n, core) <= 2
  )
}

export function classifyKeyword(word: string, cores: string[]): KeywordKind {
  if (looksLikeAddressOrPhone(word)) return "known"
  let n = normalizeWord(word)
  // 「株式会社」「有限会社」だけの検索は、社名を打ちかけた検索として扱う
  for (const w of CORP_WORDS) n = n.split(normalizeWord(w)).join("")
  if (!n) return "known"
  for (const c of cores) {
    if (n.includes(c)) return "known"
    // 社名の一部だけで検索している場合（「アイリンクス」「リンク」など）も、社名の検索として扱う
    if (c.length >= 3 && n.length >= 3 && c.includes(n)) return "known"
    if (nearBrand(n, c)) return "known"
    // アルファベットの社名を、そのままカタカナで読んだ検索（PAL →「パル」「パルム」）
    if (isLatin(c) && c.length >= 3 && !isLatin(n)) {
      const r = toRomaji(n)
      if (r && r.startsWith(c.replace(/l/g, "r"))) return "known"
    }
  }
  return "seeking"
}

export interface KeywordSplit {
  known: KeywordCount[]
  seeking: KeywordCount[]
  /** 回数が分かっている分の合計（「15回未満」の言葉は足していない） */
  knownTotal: number
  seekingTotal: number
}

export function splitKeywords(list: KeywordCount[], cores: string[]): KeywordSplit {
  const known: KeywordCount[] = []
  const seeking: KeywordCount[] = []
  for (const k of list) (classifyKeyword(k.word, cores) === "known" ? known : seeking).push(k)
  const sum = (a: KeywordCount[]) => a.reduce((t, k) => t + (k.count ?? 0), 0)
  const byCount = (a: KeywordCount, b: KeywordCount) => (b.count ?? 0) - (a.count ?? 0)
  return {
    known: known.sort(byCount),
    seeking: seeking.sort(byCount),
    knownTotal: sum(known),
    seekingTotal: sum(seeking),
  }
}
