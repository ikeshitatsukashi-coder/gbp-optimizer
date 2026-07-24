import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import {
  importScheduledRows,
  suggestMapping,
  type ColumnMapping,
} from "@/lib/services/import-scheduled-rows"
import * as XLSX from "xlsx"

/**
 * フォールバック: シートが「リンクを知っている全員が閲覧可」の場合、
 * Sheets API を使わず公開CSVエクスポートで読み取る（API未有効化でも動く）。
 */
async function fetchViaPublicCsv(
  id: string,
  gid: string | null
): Promise<string[][] | null> {
  try {
    const res = await fetch(
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`,
      { redirect: "follow" }
    )
    if (!res.ok) return null
    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("csv") && !ct.includes("text/plain")) return null
    const text = await res.text()
    if (!text.trim()) return null
    const wb = XLSX.read(text, { type: "string" })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      raw: false,
      defval: null,
    }) as unknown as string[][]
  } catch {
    return null
  }
}

/**
 * POST /api/scheduled-posts/import-sheet
 * body: { url: "https://docs.google.com/spreadsheets/d/.../edit#gid=0", gid?: "0" }
 *
 * Google Sheets API でスプレッドシートを直接読み取り、投稿予約として登録する。
 * ダウンロード/アップロード不要。読み取り専用スコープ(spreadsheets.readonly)を使用。
 * 実投稿はせず status='pending' で登録（従来のインポートと同じ）。
 */

/** URL からスプレッドシートID と gid を取り出す */
function parseSheetUrl(url: string): { id: string | null; gid: string | null } {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/)
  return { id: idMatch?.[1] ?? null, gid: gidMatch?.[1] ?? null }
}

/** Sheets API のエラーを原因別に分類して分かりやすいメッセージにする */
function classifySheetsError(
  status: number,
  bodyText: string
): { status: number; message: string } {
  let gErr: { status?: string; message?: string } = {}
  try {
    gErr = (JSON.parse(bodyText) as { error?: typeof gErr }).error ?? {}
  } catch {
    /* not JSON */
  }
  const msg = gErr.message ?? bodyText
  const lower = msg.toLowerCase()

  // ① Google Sheets API 自体が未有効化
  if (lower.includes("has not been used") || lower.includes("is disabled") || lower.includes("api has not been")) {
    return {
      status: 503,
      message:
        "Googleスプレッドシートの読み取り機能（Sheets API）が、まだこのシステムで有効化されていません。管理者に「Google Sheets API を有効化してほしい」とお伝えください（GCPプロジェクト gbp-optimizer-493203）。有効化はこちら → https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=729277459238",
    }
  }
  // ② トークンにスコープが無い（再ログイン未実施）
  if (lower.includes("insufficient authentication scopes") || lower.includes("scope")) {
    return {
      status: 403,
      message:
        "スプレッドシート読み取りの権限がまだ付与されていません。一度「ログアウト」してから再度ログインし、表示される「スプレッドシートの表示」の許可を承認してください。",
    }
  }
  // ③ そのシートを開く権限がない
  if (status === 404) {
    return {
      status: 404,
      message:
        "スプレッドシートが見つかりません。URLが正しいか、共有リンク（.../spreadsheets/d/xxxx/edit）になっているか確認してください。",
    }
  }
  return {
    status: 403,
    message: `このスプレッドシートを開けません。ログイン中のアカウント（meo-support@li-go.jp）がこのシートにアクセスできるか、共有設定をご確認ください。（詳細: ${msg.slice(0, 150)}）`,
  }
}

export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: { url?: string; gid?: string; preview?: boolean; mapping?: ColumnMapping }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.url?.trim()) {
    return NextResponse.json(
      { error: "スプレッドシートのURLを入力してください" },
      { status: 400 }
    )
  }

  const { id, gid } = parseSheetUrl(body.url.trim())
  if (!id) {
    return NextResponse.json(
      {
        error:
          "URLからスプレッドシートIDを取得できませんでした。共有リンク（.../spreadsheets/d/xxxx/edit）を貼り付けてください。",
      },
      { status: 400 }
    )
  }
  const targetGid = body.gid ?? gid

  try {
    let values: string[][] = []
    let tabs: { gid: string; title: string }[] = []
    let sheetTitle = ""
    let viaPublicCsv = false

    // 1) Sheets API で全タブ一覧を取得
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (metaRes.ok) {
      const meta = (await metaRes.json()) as {
        sheets?: { properties?: { sheetId?: number; title?: string } }[]
      }
      const sheets = meta.sheets ?? []
      if (sheets.length === 0) {
        return NextResponse.json({ error: "シートが見つかりません" }, { status: 400 })
      }
      tabs = sheets.map((s) => ({
        gid: String(s.properties?.sheetId ?? ""),
        title: s.properties?.title ?? "",
      }))

      // 対象タブ: gid 指定があればそれ、なければ先頭タブ
      sheetTitle = sheets[0].properties?.title ?? "Sheet1"
      if (targetGid) {
        const hit = sheets.find(
          (s) => String(s.properties?.sheetId ?? "") === String(targetGid)
        )
        if (hit?.properties?.title) sheetTitle = hit.properties.title
      }

      // 2) 値を取得
      const range = encodeURIComponent(sheetTitle)
      const valRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!valRes.ok) {
        const txt = await valRes.text()
        const classified = classifySheetsError(valRes.status, txt)
        return NextResponse.json({ error: classified.message }, { status: classified.status })
      }
      const valJson = (await valRes.json()) as { values?: string[][] }
      values = valJson.values ?? []
    } else {
      // Sheets API が使えない（未有効化・スコープ不足等）→ 公開CSVフォールバック
      const txt = await metaRes.text()
      const csvValues = await fetchViaPublicCsv(id, targetGid)
      if (!csvValues) {
        const classified = classifySheetsError(metaRes.status, txt)
        return NextResponse.json({ error: classified.message }, { status: classified.status })
      }
      values = csvValues
      viaPublicCsv = true
      sheetTitle = targetGid ? `URLで指定されたタブ` : "先頭のタブ"
      tabs = [{ gid: targetGid ?? "0", title: sheetTitle }]
    }
    if (values.length < 2) {
      // プレビュー時はタブ一覧を返して、別タブを選び直せるようにする
      if (body.preview) {
        return NextResponse.json({
          preview: true,
          sheetTitle,
          selectedGid: targetGid ?? tabs[0]?.gid,
          tabs,
          headers: [],
          rowCount: 0,
          sampleRows: [],
          suggestedMapping: {},
          warning: `このタブ「${sheetTitle}」にはデータ行がありません（1行目=見出し、2行目以降にデータが必要）。別のタブを選んでください。`,
        })
      }
      return NextResponse.json(
        { error: `タブ「${sheetTitle}」にデータ行がありません（1行目は見出し、2行目以降にデータが必要です）` },
        { status: 400 }
      )
    }

    // 3) 見出し行 → オブジェクト配列に変換
    const header = values[0].map((h) => String(h ?? "").trim())
    const rows: Record<string, unknown>[] = values.slice(1).map((r) => {
      const obj: Record<string, unknown> = {}
      header.forEach((key, i) => {
        if (key) obj[key] = r[i] ?? null
      })
      return obj
    })

    // 4a) プレビュー: 取り込まず、タブ一覧・見出し・サンプル・推定マッピングを返す
    if (body.preview) {
      return NextResponse.json({
        preview: true,
        sheetTitle,
        selectedGid: targetGid ?? tabs.find((t) => t.title === sheetTitle)?.gid ?? tabs[0]?.gid,
        tabs,
        headers: header.filter(Boolean),
        rowCount: rows.length,
        sampleRows: rows.slice(0, 3),
        suggestedMapping: suggestMapping(header.filter(Boolean)),
        ...(viaPublicCsv
          ? {
              warning:
                "リンク共有（閲覧可）経由で読み込みました。別のタブを取り込む場合は、そのタブを開いた状態のURL（#gid=…付き）を貼り直してください。",
            }
          : {}),
      })
    }

    // 4b) 本取り込み（列マッピングがあれば適用）
    const result = await importScheduledRows(rows, body.mapping)
    return NextResponse.json({ sheetTitle, ...result })
  } catch (e) {
    return errorResponse("Failed to import from sheet", e)
  }
}
