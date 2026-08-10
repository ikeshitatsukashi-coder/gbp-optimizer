import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { imageOwners, scheduledPosts, stores } from "@/lib/db/schema"
import { eq, inArray, isNotNull, sql } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { safeSegment } from "@/lib/services/image-scope"

/**
 * 画像の持ち主（どの店舗・会社の画像か）の登録。
 *
 * POST   選んだ画像を指定の店舗の画像として登録する
 * DELETE ?url= で登録を解除して共通に戻す
 *
 * ファイル自体は移動しない。移動するとURLが変わり、既存の投稿から
 * 画像が参照できなくなるため。
 */

interface Body {
  locationId?: string
  urls?: string[]
  /** true の場合、投稿履歴から持ち主を推定して一括登録する */
  derive?: boolean
}

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = await getSessionEmail()

  try {
    /* --- 投稿履歴からの一括推定 --- */
    if (body.derive) {
      // 予約投稿が参照している画像URLと、その投稿の店舗を取り出す
      const rows = await db
        .select({
          locationName: scheduledPosts.locationName,
          url: sql<string>`jsonb_array_elements_text(${scheduledPosts.mediaUrls}::jsonb)`,
        })
        .from(scheduledPosts)
        .where(isNotNull(scheduledPosts.mediaUrls))

      // 同じ画像が複数の店舗で使われている場合は持ち主を決められないので共通のままにする
      const byUrl = new Map<string, Set<string>>()
      for (const r of rows) {
        if (!r.url?.includes("blob.vercel-storage.com")) continue
        const set = byUrl.get(r.url) ?? new Set<string>()
        set.add(r.locationName)
        byUrl.set(r.url, set)
      }

      const existing = await db.select({ url: imageOwners.url }).from(imageOwners)
      const already = new Set(existing.map((e) => e.url))

      const toInsert: { url: string; locationName: string; source: string; assignedBy: string | null }[] = []
      let skippedMultiStore = 0
      for (const [url, locs] of byUrl) {
        if (already.has(url)) continue
        if (locs.size > 1) {
          skippedMultiStore++
          continue
        }
        toInsert.push({
          url,
          locationName: [...locs][0],
          source: "derived",
          assignedBy: email,
        })
      }

      if (toInsert.length > 0) {
        // 500件ずつに分けて登録
        for (let i = 0; i < toInsert.length; i += 500) {
          await db.insert(imageOwners).values(toInsert.slice(i, i + 500)).onConflictDoNothing()
        }
      }

      return NextResponse.json({
        success: true,
        assigned: toInsert.length,
        /** 複数店舗で使われていて持ち主を決められなかった画像 */
        skippedMultiStore,
        alreadyAssigned: already.size,
      })
    }

    /* --- 手動での登録 --- */
    const bare = safeSegment(body.locationId ?? null)
    if (!bare) {
      return NextResponse.json({ error: "店舗を指定してください" }, { status: 400 })
    }
    const locationName = `locations/${bare}`

    const [store] = await db
      .select({ locationName: stores.locationName })
      .from(stores)
      .where(eq(stores.locationName, locationName))
    if (!store) {
      return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })
    }

    const urls = (body.urls ?? []).filter(
      (u) => typeof u === "string" && u.includes("blob.vercel-storage.com")
    )
    if (urls.length === 0) {
      return NextResponse.json({ error: "対象の画像を選択してください" }, { status: 400 })
    }
    if (urls.length > 1000) {
      return NextResponse.json({ error: "一度に指定できるのは1000件までです" }, { status: 400 })
    }

    for (let i = 0; i < urls.length; i += 500) {
      await db
        .insert(imageOwners)
        .values(
          urls.slice(i, i + 500).map((url) => ({
            url,
            locationName,
            source: "manual",
            assignedBy: email,
          }))
        )
        .onConflictDoUpdate({
          target: imageOwners.url,
          set: { locationName, source: "manual", assignedBy: email },
        })
    }

    return NextResponse.json({ success: true, assigned: urls.length })
  } catch (e) {
    return errorResponse("Failed to assign image owner", e)
  }
}

export async function DELETE(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const url = new URL(request.url).searchParams.get("url")
  if (!url) return NextResponse.json({ error: "url が必要です" }, { status: 400 })

  try {
    const removed = await db
      .delete(imageOwners)
      .where(inArray(imageOwners.url, [url]))
      .returning({ url: imageOwners.url })
    return NextResponse.json({ success: true, removed: removed.length })
  } catch (e) {
    return errorResponse("Failed to remove image owner", e)
  }
}
