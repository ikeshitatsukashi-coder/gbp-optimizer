import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import {
  importScheduledRows,
  suggestMapping,
  type ColumnMapping,
} from "@/lib/services/import-scheduled-rows"

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
    // 1) 対象シート名を特定（gid 指定があればそのシート、なければ先頭シート）
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!metaRes.ok) {
      const txt = await metaRes.text()
      if (metaRes.status === 403 || metaRes.status === 401) {
        return NextResponse.json(
          {
            error:
              "スプレッドシートにアクセスできません。ログイン中のGoogleアカウント（meo-support@li-go.jp）がこのシートを開けるか、共有設定をご確認ください。権限を追加した直後は一度ログインし直してください。",
          },
          { status: 403 }
        )
      }
      return NextResponse.json(
        { error: `シート情報の取得に失敗しました: ${metaRes.status} ${txt.slice(0, 200)}` },
        { status: metaRes.status }
      )
    }
    const meta = (await metaRes.json()) as {
      sheets?: { properties?: { sheetId?: number; title?: string } }[]
    }
    const sheets = meta.sheets ?? []
    if (sheets.length === 0) {
      return NextResponse.json({ error: "シートが見つかりません" }, { status: 400 })
    }
    let sheetTitle = sheets[0].properties?.title ?? "Sheet1"
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
      return NextResponse.json(
        { error: `シートの読み取りに失敗しました: ${valRes.status} ${txt.slice(0, 200)}` },
        { status: valRes.status }
      )
    }
    const valJson = (await valRes.json()) as { values?: string[][] }
    const values = valJson.values ?? []
    if (values.length < 2) {
      return NextResponse.json(
        { error: "データ行がありません（1行目は見出し、2行目以降にデータが必要です）" },
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

    // 4a) プレビュー: 取り込まず、見出し・サンプル・推定マッピングを返す（列対応づけUI用）
    if (body.preview) {
      return NextResponse.json({
        preview: true,
        sheetTitle,
        headers: header.filter(Boolean),
        rowCount: rows.length,
        sampleRows: rows.slice(0, 3),
        suggestedMapping: suggestMapping(header.filter(Boolean)),
      })
    }

    // 4b) 本取り込み（列マッピングがあれば適用）
    const result = await importScheduledRows(rows, body.mapping)
    return NextResponse.json({ sheetTitle, ...result })
  } catch (e) {
    return errorResponse("Failed to import from sheet", e)
  }
}
