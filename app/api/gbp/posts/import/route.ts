import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { db } from "@/lib/db"
import { scheduledPosts, stores } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import {
  parseMatrix,
  toSheetCsvUrl,
  type Cell,
  type RowError,
} from "@/lib/post-import"

/**
 * POST /api/gbp/posts/import
 *
 * 一括投稿インポート。以下の 2 通りの入力に対応する:
 *   1. multipart/form-data (field: "file")  … CSV / Excel(.xlsx) ファイル
 *   2. application/json { sheetUrl }         … 公開共有した Google スプレッドシート URL
 *
 * 取り込んだ行は既存の `scheduled_posts` テーブルに status="pending" で登録するだけ。
 * → 予約時刻が来るまで（または「今すぐ実行」まで）投稿はされないので、
 *    誤って大量投稿してしまう事故を防ぎつつ、既存の投稿フローを一切壊さない。
 *
 * 投稿日時が空の行は「すぐ投稿対象（次回実行で投稿）」として現在時刻で登録する。
 */

const MAX_ROWS = 500

function sheetToMatrix(workbook: XLSX.WorkBook): Cell[][] {
  const first = workbook.SheetNames[0]
  if (!first) return []
  const sheet = workbook.Sheets[first]
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: true,
  })
}

export async function POST(request: NextRequest) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const contentType = request.headers.get("content-type") ?? ""
  let matrix: Cell[][] = []

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { sheetUrl?: string }
      if (!body.sheetUrl) {
        return NextResponse.json(
          { error: "sheetUrl is required" },
          { status: 400 }
        )
      }
      const csvUrl = toSheetCsvUrl(body.sheetUrl)
      if (!csvUrl) {
        return NextResponse.json(
          { error: "Google スプレッドシートの URL 形式を認識できませんでした。" },
          { status: 400 }
        )
      }
      const res = await fetch(csvUrl, { redirect: "follow" })
      if (!res.ok) {
        return NextResponse.json(
          {
            error:
              "スプレッドシートを読み込めませんでした。『リンクを知っている全員が閲覧可』で共有されているかご確認ください。",
          },
          { status: 400 }
        )
      }
      const text = await res.text()
      // ログインページ HTML が返ってきた場合（非公開シート）を検出
      if (/^\s*</.test(text)) {
        return NextResponse.json(
          {
            error:
              "スプレッドシートが非公開のようです。『リンクを知っている全員が閲覧可』に設定してください。",
          },
          { status: 400 }
        )
      }
      const wb = XLSX.read(text, { type: "string", cellDates: true })
      matrix = sheetToMatrix(wb)
    } else {
      const form = await request.formData()
      const file = form.get("file")
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file がありません。" }, { status: 400 })
      }
      const buf = Buffer.from(await file.arrayBuffer())
      const wb = XLSX.read(buf, { type: "buffer", cellDates: true })
      matrix = sheetToMatrix(wb)
    }
  } catch (e) {
    return errorResponse("ファイルの読み込みに失敗しました", e, 400)
  }

  const { rows, errors } = parseMatrix(matrix)
  const allErrors: RowError[] = [...errors]

  if (rows.length === 0 && allErrors.length === 0) {
    return NextResponse.json(
      { error: "取り込める行がありませんでした（本文が入力された行がありません）。" },
      { status: 400 }
    )
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `一度に取り込める行数は ${MAX_ROWS} 件までです。` },
      { status: 400 }
    )
  }

  // 店舗の解決用マップ（locationName / 店舗名 のどちらでも引けるように）
  const storeRows = await db
    .select({ locationName: stores.locationName, title: stores.title })
    .from(stores)
  const byLocation = new Map(storeRows.map((s) => [s.locationName, s]))
  const byTitle = new Map(storeRows.map((s) => [s.title.trim(), s]))

  const toInsert: (typeof scheduledPosts.$inferInsert)[] = []
  const now = new Date()

  for (const r of rows) {
    const resolved = r.store.startsWith("locations/")
      ? byLocation.get(r.store)
      : byLocation.get(r.store) ?? byTitle.get(r.store.trim())
    if (!resolved) {
      allErrors.push({
        rowNumber: r.rowNumber,
        message: `店舗「${r.store}」が見つかりません（店舗マスタと一致しません）。`,
      })
      continue
    }

    toInsert.push({
      locationName: resolved.locationName,
      scheduledFor: r.scheduledFor ?? now,
      postType: r.postType,
      summary: r.summary,
      mediaUrls: r.mediaUrls.length > 0 ? r.mediaUrls : null,
      callToAction: r.callToAction,
      status: "pending",
    })
  }

  let created = 0
  try {
    if (toInsert.length > 0) {
      const inserted = await db
        .insert(scheduledPosts)
        .values(toInsert)
        .returning({ id: scheduledPosts.id })
      created = inserted.length
    }
  } catch (e) {
    return errorResponse("予約投稿の登録に失敗しました", e)
  }

  return NextResponse.json({
    success: true,
    created,
    skipped: allErrors.length,
    total: rows.length,
    errors: allErrors.slice(0, 50),
  })
}
