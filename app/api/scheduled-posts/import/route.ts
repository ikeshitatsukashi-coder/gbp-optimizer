import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scheduledPosts, stores } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { importScheduledRows } from "@/lib/services/import-scheduled-rows"
import * as XLSX from "xlsx"

/**
 * POST /api/scheduled-posts/import
 *  (A) application/json  { rows: [...] }  … クライアントで xlsx を解析済み（推奨・軽量）
 *  (B) multipart/form-data file=<xlsx>   … 後方互換（ファイルが4.5MB超だと413で失敗）
 *
 * 実行はしない — 全て status='pending' の予約として登録する。
 */
export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let rows: Record<string, unknown>[] = []
  const contentType = request.headers.get("content-type") ?? ""

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { rows?: Record<string, unknown>[] }
      if (!Array.isArray(body.rows)) {
        return NextResponse.json({ error: "rows 配列が必要です" }, { status: 400 })
      }
      rows = body.rows
    } else {
      const formData = await request.formData()
      const f = formData.get("file")
      if (!(f instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 })
      }
      const arrayBuf = await f.arrayBuffer()
      const workbook = XLSX.read(arrayBuf, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        return NextResponse.json({ error: "No sheet found" }, { status: 400 })
      }
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[sheetName],
        { raw: false, defval: null }
      )
    }
  } catch {
    return NextResponse.json({ error: "ファイルの読み取りに失敗しました" }, { status: 400 })
  }

  try {
    const result = await importScheduledRows(rows)
    return NextResponse.json(result)
  } catch (e) {
    return errorResponse("Failed to import", e)
  }
}


/**
 * GET /api/scheduled-posts/import?template=1
 * 空のテンプレート EXCEL をダウンロード
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  if (url.searchParams.get("template") === "1") {
    return exportTemplate()
  }

  // 現状の予約一覧を EXCEL でエクスポート
  const rows = await db
    .select({
      locationName: scheduledPosts.locationName,
      scheduledFor: scheduledPosts.scheduledFor,
      postType: scheduledPosts.postType,
      summary: scheduledPosts.summary,
      mediaUrls: scheduledPosts.mediaUrls,
      callToAction: scheduledPosts.callToAction,
      status: scheduledPosts.status,
    })
    .from(scheduledPosts)
    .orderBy(scheduledPosts.scheduledFor)

  const storeMap = new Map(
    (await db.select({ locationName: stores.locationName, title: stores.title }).from(stores)).map(
      (s) => [s.locationName, s.title]
    )
  )

  const data = rows.map((r) => ({
    locationName: r.locationName,
    店舗名: storeMap.get(r.locationName) ?? "",
    予約日時: r.scheduledFor?.toISOString().slice(0, 16).replace("T", " "),
    投稿タイプ: r.postType,
    本文: r.summary,
    画像URL: r.mediaUrls?.[0] ?? "",
    CTA種別:
      (r.callToAction as { actionType?: string } | null)?.actionType ?? "",
    CTAリンク: (r.callToAction as { url?: string } | null)?.url ?? "",
    ステータス: r.status,
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "scheduled_posts")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="scheduled-posts-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}

async function exportTemplate() {
  const example = [
    {
      locationName: "locations/12345678901234567",
      店舗名: "（省略可・locationName が正しければ不要）",
      予約日時: "2026-07-15 10:00",
      投稿タイプ: "STANDARD",
      本文: "本文サンプル。1500文字まで。",
      画像URL: "https://example.com/photo.jpg",
      CTA種別: "LEARN_MORE",
      CTAリンク: "https://www.example.com",
    },
  ]
  const ws = XLSX.utils.json_to_sheet(example)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "template")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="scheduled-posts-template.xlsx"`,
    },
  })
}
