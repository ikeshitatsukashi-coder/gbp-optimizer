import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { stores } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/gbp/posts/template
 *
 * 一括投稿用の CSV テンプレートをダウンロードする。
 * 運用中の店舗を 1 行ずつ（本文は空欄）で書き出しておくので、
 * ユーザーは本文と日時を埋めるだけでインポートできる。
 *
 * Excel でそのまま開けるよう UTF-8 BOM を付与する。
 */

const HEADERS = [
  "店舗ID(locationName)",
  "店舗名",
  "投稿タイプ",
  "本文",
  "画像URL(カンマ区切りで複数可)",
  "CTAタイプ",
  "CTA_URL",
  "投稿日時(例 2026/07/10 09:00)",
]

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET() {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const rows = await db
      .select({ locationName: stores.locationName, title: stores.title })
      .from(stores)
      .where(eq(stores.status, "active"))
      .orderBy(stores.title)

    const lines: string[] = [HEADERS.map(csvEscape).join(",")]

    // 例行（コメント的に 1 行）
    lines.push(
      [
        rows[0]?.locationName ?? "locations/1234567890",
        rows[0]?.title ?? "サンプル店舗",
        "最新情報",
        "ここに投稿本文を入力してください。",
        "",
        "詳細を見る",
        "https://example.com",
        "2026/07/10 09:00",
      ]
        .map((v) => csvEscape(String(v)))
        .join(",")
    )

    // 運用中の各店舗を空欄行で用意
    for (const r of rows) {
      lines.push(
        [r.locationName, r.title, "最新情報", "", "", "", "", ""]
          .map((v) => csvEscape(String(v)))
          .join(",")
      )
    }

    const bom = "﻿"
    const csv = bom + lines.join("\r\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gbp-posts-template.csv"`,
      },
    })
  } catch (e) {
    return errorResponse("テンプレートの生成に失敗しました", e)
  }
}
