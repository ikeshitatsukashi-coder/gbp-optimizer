import type { CSSProperties } from "react"
import type { MonthlyReportData } from "@/lib/monthly-report-types"
import "./monthly-report.css"

/**
 * 月次レポートの表示（お客様に見せる画面）。
 * 社内の確認画面と、お客様用URLの画面の両方でこの部品を使う。
 * 状態を持たない純粋な表示なので、数字は渡されたものだけを出す。
 */

const MONTH_EN = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
]

const nf = (n: number) => n.toLocaleString("ja-JP")

/** 投稿の抜粋から絵文字・飾りの記号（♪★など）・改行を外して1行にする（表示のためだけ。投稿そのものは変えない） */
function plain(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[\u{2190}-\u{21FF}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}
const monthNum = (m: string) => Number(m.slice(5, 7))
const dot = (d: string) => d.replaceAll("-", ".")

/** 日本時間の「月.日」 */
function mdOf(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3)
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`
}

/** 前月との比べ方。増えた時だけ差を出し、それ以外は前月の数字をそのまま添える */
function versus(cur: number, prev: number, unit: string, partial: boolean) {
  if (partial) return null
  if (cur > prev) return { up: true, text: `前月より +${nf(cur - prev)}${unit}` }
  return { up: false, text: `前月 ${nf(prev)}${unit}` }
}

function Bars({
  months,
  values,
  target,
  unit,
}: {
  months: string[]
  values: number[]
  target: string
  unit: string
}) {
  const max = Math.max(1, ...values)
  return (
    <div className="mr-bars" role="img" aria-label={`直近6か月の推移（単位：${unit}）`}>
      {months.map((m, i) => (
        <div key={m} className={`mr-bar${m === target ? " is-now" : ""}`}>
          <span className="mr-bar-v">{nf(values[i])}</span>
          <span className="mr-bar-b" style={{ "--r": values[i] / max } as CSSProperties} />
          <span className="mr-bar-m">
            {monthNum(m)}
            <small>月</small>
          </span>
        </div>
      ))}
    </div>
  )
}

function SectionHead({
  no,
  en,
  ja,
}: {
  no: string
  en: string
  ja: string
}) {
  return (
    <div className="mr-head">
      <p className="mr-band">
        <span>{no}</span>
        <span>{ja}</span>
      </p>
      <span className="mr-head-no" aria-hidden="true">
        {no}
      </span>
      <h2 className="mr-h2">
        <span className="mr-h2-en">{en}</span>
        <span className="mr-h2-ja">{ja}</span>
      </h2>
    </div>
  )
}

export function MonthlyReportView({ data }: { data: MonthlyReportData }) {
  const m = monthNum(data.month)
  const year = data.month.slice(0, 4)
  const partial = data.period.isPartial
  const months = data.months
  const prevKey = months[months.length - 2]

  const ins = data.insights?.byMonth
  const insNow = ins?.[data.month]
  const insPrev = ins?.[prevKey]
  const titleLines = data.storeTitle.split(/[\s　]+/).filter(Boolean)
  // いちばん長い行の字数（半角は0.55字ぶん。最後の行は「様」のぶんを足す）
  const widthOf = (t: string) =>
    [...t].reduce((a, ch) => a + (/[\u0020-\u007e\uff61-\uff9f]/.test(ch) ? 0.55 : 1), 0)
  const titleN = Math.max(
    ...titleLines.map((t, i) => widthOf(t) + (i === titleLines.length - 1 ? 1 : 0))
  )

  const impressionsVs =
    insNow && insPrev ? versus(insNow.impressions, insPrev.impressions, "回", partial) : null
  const postsVs = data.posts ? versus(data.posts.count, data.posts.prevCount, "本", partial) : null

  // 数字の出どころ・集計の時期（画面では末尾の奥付、印刷では「数字」のページに出す）
  const notes = (
    <>
      <p>
        数字の出どころ：Googleビジネスプロフィール
        {data.insights?.lastDataDay
          ? `（表示回数は ${Number(data.insights.lastDataDay.slice(5, 7))}月${Number(
              data.insights.lastDataDay.slice(8, 10)
            )}日分まで。Googleの集計は数日おくれて届きます）`
          : ""}
      </p>
      <p>クチコミの過去の件数と評価は、現在の合計から逆算した値です。</p>
      {data.keywords && data.keywords.words.length > 0 && (
        <p>検索された言葉の回数は、Googleが回数を公開している言葉だけの合計です。</p>
      )}
      <p>
        作成日　
        {dot(new Date(new Date(data.generatedAt).getTime() + 9 * 3600e3).toISOString().slice(0, 10))}
      </p>
    </>
  )

  let sectionNo = 0
  const nextNo = () => String(++sectionNo).padStart(2, "0")

  return (
    <article className="mr">
      {/* ------------------------------ 表紙 ------------------------------ */}
      <header className="mr-hero mr-sheet">
        <p className="mr-eyebrow">
          <b>MONTHLY REPORT</b>
          <span>Google Business Profile</span>
        </p>
        <p className="mr-hero-vert" aria-hidden="true">
          {MONTH_EN[m - 1]} {year}
        </p>
        <div className="mr-hero-wm" aria-hidden="true">
          {MONTH_EN[m - 1]}
        </div>
        <div className="mr-hero-num" aria-hidden="true">
          <span>{m}</span>
          <i>月</i>
        </div>
        <div className="mr-hero-body">
          <p className="mr-hero-ym">
            {year}年{m}月のご報告
          </p>
          <h1 className="mr-hero-title" style={{ "--n": titleN } as CSSProperties}>
            {titleLines.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
            <small>様</small>
          </h1>
          <p className="mr-hero-period">
            集計期間　{dot(data.period.firstDay)} — {dot(data.period.lastDay).slice(5)}
            {partial ? "（月の途中までの集計です）" : ""}
            {data.area ? <span>{data.area}</span> : null}
          </p>
        </div>
      </header>

      {/* --------------------------- 今月の数字 --------------------------- */}
      <section className="mr-sec mr-sheet mr-kpi">
        <SectionHead no={nextNo()} en="Numbers" ja={`${m}月の数字`} />
        <div className="mr-kpi-grid">
          <div className="mr-kpi-main">
            <p className="mr-label">Googleの検索・マップで表示された回数</p>
            <p className="mr-giant">
              {insNow ? nf(insNow.impressions) : "—"}
              <small>回</small>
            </p>
            {impressionsVs && (
              <p className={`mr-vs${impressionsVs.up ? " is-up" : ""}`}>{impressionsVs.text}</p>
            )}
            <div className="mr-print-note">{notes}</div>
          </div>
          <dl className="mr-kpi-list">
            <div>
              <dt>
                <span className="en">POSTS</span>公開した投稿
              </dt>
              <dd>
                {data.posts ? nf(data.posts.count) : "—"}
                <small>本</small>
              </dd>
              <dd className="sub">
                {postsVs && <span className={postsVs.up ? "is-up" : ""}>{postsVs.text}</span>}
                {data.posts && data.posts.withPhoto > 0 && (
                  <span>写真つき {nf(data.posts.withPhoto)}本</span>
                )}
              </dd>
            </div>
            <div>
              <dt>
                <span className="en">PHOTOS</span>
                {data.photos && data.photos.added > 0 ? "写真欄に追加した写真" : "写真欄に掲載中の写真"}
              </dt>
              <dd>
                {data.photos
                  ? nf(data.photos.added > 0 ? data.photos.added : data.photos.total)
                  : "—"}
                <small>枚</small>
              </dd>
              <dd className="sub">
                {data.photos && data.photos.added > 0 && (
                  <span>掲載中の合計 {nf(data.photos.total)}枚</span>
                )}
              </dd>
            </div>
            <div>
              <dt>
                <span className="en">REVIEWS</span>クチコミ
              </dt>
              <dd>
                {data.reviews ? nf(data.reviews.total) : "—"}
                <small>件</small>
              </dd>
              <dd className="sub">
                {data.reviews && data.reviews.added > 0 && (
                  <span className="is-up">{m}月の新着 +{nf(data.reviews.added)}件</span>
                )}
                {data.reviews?.average != null && (
                  <span>平均評価 {data.reviews.average.toFixed(1)}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>
                <span className="en">ACTIONS</span>問い合わせへの動き
              </dt>
              <dd>
                {insNow ? nf(insNow.calls + insNow.directions + insNow.websiteClicks) : "—"}
                <small>回</small>
              </dd>
              <dd className="sub">
                {insNow && (
                  <span>
                    サイト {nf(insNow.websiteClicks)}・ルート {nf(insNow.directions)}・電話{" "}
                    {nf(insNow.calls)}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ---------------------------- 表示回数 ---------------------------- */}
      {ins && (
        <section className="mr-sec mr-sheet mr-views">
          <SectionHead no={nextNo()} en="Views" ja="表示回数の推移" />
          <div className="mr-views-grid">
            <p className="mr-lead">
              {m}月は、Googleの検索とマップで
              <wbr />
              <b>{nf(insNow?.impressions ?? 0)}回</b>
              <wbr />
              表示されました。
              {impressionsVs?.up && (
                <>
                  <wbr />
                  前の月より{nf((insNow?.impressions ?? 0) - (insPrev?.impressions ?? 0))}回
                  <wbr />
                  増えています。
                </>
              )}
            </p>
            <Bars
              months={months}
              values={months.map((k) => ins[k]?.impressions ?? 0)}
              target={data.month}
              unit="回"
            />
          </div>
          <div className="mr-table-wrap">
            <table className="mr-table">
              <thead>
                <tr>
                  <th scope="col">見られたあとの動き</th>
                  {months.map((k) => (
                    <th key={k} scope="col" className={k === data.month ? "is-now" : ""}>
                      {monthNum(k)}月
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Webサイトへ進んだ", "websiteClicks"],
                    ["ルートを調べた", "directions"],
                    ["電話をかけた", "calls"],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    {months.map((k) => (
                      <td key={k} className={k === data.month ? "is-now" : ""}>
                        {nf(ins[k]?.[key] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* --------------------------- 検索された言葉 --------------------------- */}
      {data.keywords && data.keywords.words.length > 0 && (
        <section className="mr-sec mr-sheet mr-words">
          <SectionHead no={nextNo()} en="Keywords" ja="検索された言葉" />
          <div className="mr-words-grid">
            <div>
              <p className="mr-label">検索されて、プロフィールが表示された回数</p>
              <p className="mr-giant">
                {nf(data.keywords.total)}
                <small>回</small>
              </p>
              <p className="mr-lead mr-words-lead">
                {m}月は、
                <wbr />
                こうした言葉での検索から、
                <wbr />
                プロフィールが表示されました。
              </p>
            </div>
            <div className="mr-table-wrap">
              <table className="mr-table">
                <thead>
                  <tr>
                    <th scope="col">{m}月に検索された言葉（多い順）</th>
                    <th scope="col" className="is-now">
                      表示された回数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.keywords.words.map((k) => (
                    <tr key={k.word}>
                      <th scope="row">{k.word}</th>
                      <td className="is-now">{nf(k.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------- クチコミ ---------------------------- */}
      {data.reviews && data.reviews.total > 0 && (
        <section className="mr-sec mr-sheet mr-reviews">
          <SectionHead no={nextNo()} en="Reviews" ja="クチコミと評価の推移" />
          <div className="mr-reviews-grid">
            <div className="mr-rating">
              <p className="mr-label">平均評価</p>
              <p className="mr-giant">
                {data.reviews.average != null ? data.reviews.average.toFixed(1) : "—"}
                <small>/ 5</small>
              </p>
              <div
                className="mr-meter"
                role="img"
                aria-label={`5段階のうち ${data.reviews.average?.toFixed(1) ?? "—"}`}
              >
                <span style={{ width: `${((data.reviews.average ?? 0) / 5) * 100}%` }} />
              </div>
              <p className="mr-vs">
                クチコミ {nf(data.reviews.total)}件
                {data.reviews.added > 0 ? `（${m}月の新着 ${nf(data.reviews.added)}件）` : ""}
              </p>
            </div>
            <div className="mr-reviews-chart">
              <p className="mr-label">クチコミの件数（月末時点）</p>
              <Bars
                months={months}
                values={months.map((k) => data.reviews!.byMonth[k]?.total ?? 0)}
                target={data.month}
                unit="件"
              />
              <div className="mr-table-wrap">
                <table className="mr-table is-tight">
                  <tbody>
                    <tr>
                      <th scope="row">平均評価</th>
                      {months.map((k) => (
                        <td key={k} className={k === data.month ? "is-now" : ""}>
                          {data.reviews!.byMonth[k]?.average != null
                            ? data.reviews!.byMonth[k].average!.toFixed(1)
                            : "—"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">その月の新着</th>
                      {months.map((k) => (
                        <td key={k} className={k === data.month ? "is-now" : ""}>
                          {nf(data.reviews!.byMonth[k]?.added ?? 0)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {data.reviews.voices.length > 0 && (
            <div className="mr-voices">
              <p className="mr-label">{m}月にいただいた声</p>
              {data.reviews.voices.map((v, i) => (
                <blockquote key={i}>
                  <p>{v.comment}</p>
                  <footer>
                    評価 {v.star} ／ {v.reviewer ?? "お客様"} ／ {mdOf(v.createTime)}
                  </footer>
                </blockquote>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------------------------- 今月の投稿 ---------------------------- */}
      {data.posts && data.posts.items.length > 0 && (
        <section className="mr-sec mr-posts">
          <SectionHead no={nextNo()} en="Posts" ja={`${m}月に公開した投稿`} />
          <p className="mr-lead">
            <b>{nf(data.posts.count)}本</b>の投稿を
            <wbr />
            公開しました。
          </p>
          <div className="mr-collage">
            {data.posts.items.map((p, i) => (
              <figure key={i}>
                {p.photoUrl && (
                  // 投稿の写真はGoogleに置かれている実物。切り抜かず、文字も重ねずに載せる
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${p.photoUrl}=w720`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    // 参照元を付けて読むと Google 側で断られることがあるため、付けずに読む
                    referrerPolicy="no-referrer"
                  />
                )}
                <figcaption>
                  <b>{mdOf(p.createTime)}</b>
                  <span>{plain(p.summary)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          {data.posts.count > data.posts.items.length && (
            <p className="mr-note is-screen">
              ほか {nf(data.posts.count - data.posts.items.length)}本
            </p>
          )}
          {/* 印刷では8本までを1ページに載せるので、残りの本数を添える */}
          {data.posts.count > 8 && (
            <p className="mr-note is-print">ほか {nf(data.posts.count - 8)}本</p>
          )}
        </section>
      )}

      {/* --------------------------- 追加した写真 --------------------------- */}
      {data.photos && data.photos.items.length > 0 && (
        <section className="mr-sec mr-photos">
          <SectionHead no={nextNo()} en="Photos" ja={`${m}月に追加した写真`} />
          <p className="mr-lead">
            写真欄に<b>{nf(data.photos.added)}枚</b>を
            <wbr />
            追加しました。
          </p>
          <div className="mr-strip">
            {data.photos.items.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={p.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ))}
          </div>
          {data.photos.added > data.photos.items.length && (
            <p className="mr-note">ほか {nf(data.photos.added - data.photos.items.length)}枚</p>
          )}
        </section>
      )}

      <footer className="mr-foot">{notes}</footer>
    </article>
  )
}
