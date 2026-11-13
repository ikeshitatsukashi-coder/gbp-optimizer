import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { appSettings, scheduledPosts, stores } from "@/lib/db/schema"
import { createGmbClient } from "@/lib/gbp-client"
import { and, asc, eq, lte, sql } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { getServiceAccessToken } from "@/lib/services/cron-auth"
import { filterApprovedForExecution } from "@/lib/services/approvals"
import { acquireExecuteLock, releaseExecuteLock } from "@/lib/services/execute-lock"
import { trackedUrlForPost } from "@/lib/services/post-click-tracking"
import { MAX_POST_PHOTOS } from "@/lib/post-limits"

/** 投稿実行に時間がかかるため延長（1回最大20件） */
export const maxDuration = 60

/**
 * 1回の実行で新しい処理を始めてよい時間。
 * 関数の上限（60秒）の途中で打ち切られると「Googleには投稿済みなのに記録が無い」状態になり、
 * 次の実行で二重投稿になる。上限より十分手前で新しい投稿を始めるのをやめ、残りは次回に回す。
 */
const POST_BUDGET_MS = 38_000
const EXTRA_PHOTO_BUDGET_MS = 50_000

/** 最後の実行結果を残すキー（進捗確認の画面で表示する） */
const LAST_RUN_KEY = "execute_last_run"

/**
 * GET /api/cron/execute-scheduled
 *
 * 定期実行（GitHub Actions / Vercel Cron）が呼び出すエンドポイント。
 * 認証: Authorization: Bearer ${CRON_SECRET} / ?secret=${CRON_SECRET} / x-vercel-cron ヘッダー。
 *
 * scheduled_posts から status='pending' かつ scheduled_for <= now() を取得して
 * v4 API へ投稿し、結果を DB に記録する。
 * アクセストークンは「自動実行を有効化」で保存されたリフレッシュトークンから都度発行。
 */

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const auth = request.headers.get("authorization")
  if (auth === `Bearer ${cronSecret}`) return true
  const url = new URL(request.url)
  if (url.searchParams.get("secret") === cronSecret) return true
  // Vercel Cron は内部的に "x-vercel-cron" ヘッダーを付ける
  if (request.headers.get("x-vercel-cron")) return true
  return false
}

/**
 * Google の認証そのものが通らなかったエラーか。
 * これは投稿の中身の問題ではないので、投稿を「失敗」にしてはいけない
 * （失敗にすると編集も再実行もできず、その日の予約が丸ごと欠ける）。
 */
function isAuthError(message: string | undefined): boolean {
  if (!message) return false
  return /GMB API error: 401|UNAUTHENTICATED|invalid authentication credentials/i.test(message)
}

/** 2枚目以降の写真（店舗の「写真」欄に載せる分）の進み具合。result.extraPhotos に保存する */
interface ExtraPhotos {
  pending: string[]
  uploaded: { url: string; name?: string }[]
  failed: { url: string; error: string }[]
}

async function executeOne(
  accessToken: string,
  post: {
    id: number
    locationName: string
    accountName: string
    postType: string
    summary: string
    mediaUrls: string[] | null
    callToAction: { actionType?: string; url?: string } | null
  }
): Promise<{
  ok: boolean
  error?: string
  result?: unknown
  extraPhotoUrls?: string[]
  /** on = 計測用URLで投稿した / fallback = 計測用URLが通らず元のURLで投稿した */
  clickTracking?: "on" | "fallback"
}> {
  const client = createGmbClient(accessToken)
  // 動画は「最新情報」には付けられないため、店舗の「写真・動画」欄に載せる
  if (post.postType === "VIDEO") {
    const url = post.mediaUrls?.[0]
    if (!url) return { ok: false, error: "動画URLがありません" }
    try {
      const result = await client.createMedia(post.accountName, post.locationName, {
        mediaFormat: "VIDEO",
        sourceUrl: url,
        description: post.summary.slice(0, 1000),
      })
      return { ok: true, result }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  const body: Record<string, unknown> = {
    languageCode: "ja",
    summary: post.summary,
    topicType: post.postType,
  }
  // ボタンのクリック数の計測（店舗でONにしている場合だけ。それ以外は null が返り、何も変わらない）。
  // 計測用URLを用意できなくても投稿は止めず、元のURLのまま出す。
  let trackedUrl: string | null = null
  if (post.callToAction?.actionType) {
    body.callToAction = post.callToAction
    trackedUrl = await trackedUrlForPost(post).catch(() => null)
    if (trackedUrl) body.callToAction = { ...post.callToAction, url: trackedUrl }
  }
  // Google の投稿APIは1投稿につき写真1枚しか受け付けない（複数送ると投稿ごと拒否される。
  // 2026-11-05 に5枚・11-09 に7枚で実測）。投稿には1枚目だけを付け、
  // 2枚目以降はこのあと店舗の「写真」欄に載せる。
  const photos = (post.mediaUrls ?? []).slice(0, MAX_POST_PHOTOS)
  if (photos.length > 0) {
    body.media = [{ mediaFormat: "PHOTO", sourceUrl: photos[0] }]
  }
  try {
    const result = await client.createPost(post.accountName, post.locationName, body)
    return {
      ok: true,
      result,
      extraPhotoUrls: photos.slice(1),
      ...(trackedUrl ? { clickTracking: "on" as const } : {}),
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // 計測用URLで出して Google に内容を断られた（400）場合だけ、元のURLで1回出し直す。
    // 400 は「投稿が作られていない」ことが確かなので、二重投稿にはならない。
    // 通信の途切れなど、作られたかどうか分からない失敗では出し直さない。
    if (trackedUrl && /GMB API error: 400\b/.test(message)) {
      try {
        body.callToAction = post.callToAction
        const result = await client.createPost(post.accountName, post.locationName, body)
        return {
          ok: true,
          result,
          extraPhotoUrls: photos.slice(1),
          clickTracking: "fallback" as const,
        }
      } catch (e2) {
        return { ok: false, error: e2 instanceof Error ? e2.message : String(e2) }
      }
    }
    return { ok: false, error: message }
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 保存済みリフレッシュトークンからアクセストークンを発行
  const svc = await getServiceAccessToken()
  if (!svc.accessToken) {
    return NextResponse.json({ ok: true, skipped: true, reason: svc.reason }, { status: 200 })
  }

  return runExecution(svc.accessToken, "定時実行")
}

/**
 * POST /api/cron/execute-scheduled
 * 画面の「今すぐ実行」ボタン、および画面を開いた時の自動実行から呼ばれる。
 *
 * 定時実行と同じ「保存済みの認証」で投稿する。以前は画面を開いた人のログインで
 * 投稿していたため、その人のGoogleログインが切れていると、期日の来ていた予約が
 * すべて認証エラーで失敗になっていた。
 * 自動実行が未設定のときだけ、従来どおり本人のログインで実行する。
 */
export async function POST(request: Request) {
  const sessionToken = await getAccessToken()
  if (!sessionToken && !isAuthorized(request)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const svc = await getServiceAccessToken()
  if (svc.accessToken) return runExecution(svc.accessToken, "画面からの実行")
  if (sessionToken) return runExecution(sessionToken, "画面からの実行（本人のログイン）")
  return NextResponse.json({ error: svc.reason }, { status: 500 })
}

async function runExecution(accessToken: string, trigger: string) {
  // 開発環境（自分のPCでの動作確認）では絶対に実行しない。
  // 開発環境は本番と同じデータベースを見ているため、ここを通すと
  // 本番の予約が、確認用の偽の認証で実行されて失敗になる（2026-10-27 に実際に起きた）。
  if (process.env.NODE_ENV === "development" || accessToken === "dev-bypass-token") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "開発環境では予約投稿を実行しません（本番の予約を誤って動かさないため）",
    })
  }

  // 実行が重ならないよう鍵を取る（取れなければ、別の実行が進行中なので何もしない）
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  if (!(await acquireExecuteLock(owner))) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "別の実行が進行中のため、今回は見送りました",
    })
  }

  const startedAt = Date.now()
  try {
    const now = new Date()
    // 期日到来 + pending のものを古い順に最大 20 件取得
    const rows = await db
      .select({
        id: scheduledPosts.id,
        locationName: scheduledPosts.locationName,
        accountName: stores.accountName,
        postType: scheduledPosts.postType,
        summary: scheduledPosts.summary,
        mediaUrls: scheduledPosts.mediaUrls,
        callToAction: scheduledPosts.callToAction,
      })
      .from(scheduledPosts)
      .innerJoin(stores, eq(stores.locationName, scheduledPosts.locationName))
      .where(and(eq(scheduledPosts.status, "pending"), lte(scheduledPosts.scheduledFor, now)))
      .orderBy(asc(scheduledPosts.scheduledFor), asc(scheduledPosts.id))
      .limit(20) // 60秒制限内に収める（残りは次回実行で処理）

    // ワークフロー承認がONの場合、未承認の投稿は実行せず pending のまま残す
    const { allowed, blocked } = await filterApprovedForExecution(rows)

    const results: Array<{
      id: number
      status: "posted" | "failed"
      error?: string
    }> = []
    /** Googleの認証が通らなかった場合の文面（投稿は失敗にせず予約のまま残す） */
    let authError: string | null = null
    /** 時間切れで次回に回した件数 */
    let deferred = 0

    for (const post of allowed) {
      if (Date.now() - startedAt > POST_BUDGET_MS) {
        deferred = allowed.length - results.length
        break
      }
      const r = await executeOne(accessToken, {
        id: post.id,
        locationName: post.locationName,
        accountName: post.accountName,
        postType: post.postType,
        summary: post.summary,
        mediaUrls: post.mediaUrls,
        callToAction: post.callToAction as { actionType?: string; url?: string } | null,
      })

      if (r.ok) {
        const extra = r.extraPhotoUrls ?? []
        const base = {
          ...((r.result ?? {}) as Record<string, unknown>),
          ...(r.clickTracking ? { clickTracking: r.clickTracking } : {}),
        }
        const saved: Record<string, unknown> =
          extra.length > 0
            ? {
                ...base,
                extraPhotos: { pending: extra, uploaded: [], failed: [] } satisfies ExtraPhotos,
              }
            : base
        await db
          .update(scheduledPosts)
          .set({
            status: "posted",
            executedAt: new Date(),
            result: saved,
            errorMessage: null,
            updatedAt: sql`now()`,
          })
          .where(eq(scheduledPosts.id, post.id))
        results.push({ id: post.id, status: "posted" })
      } else if (isAuthError(r.error)) {
        // 認証の問題は投稿のせいではない。失敗にせず予約のまま残し、この回はここで止める
        // （残りも同じ理由で通らないため）。認証が直れば次の実行でそのまま投稿される。
        authError =
          "Googleの認証が通らなかったため、投稿を見送りました（予約はそのまま残っています）。" +
          "投稿スケジューラ画面で「自動実行を有効化」をやり直してください。"
        break
      } else {
        await db
          .update(scheduledPosts)
          .set({
            status: "failed",
            executedAt: new Date(),
            errorMessage: r.error?.slice(0, 500),
            updatedAt: sql`now()`,
          })
          .where(eq(scheduledPosts.id, post.id))
        results.push({ id: post.id, status: "failed", error: r.error })
      }
    }

    // 2枚目以降の写真を、店舗の「写真」欄に載せる（投稿とは別枠。時間内にできる分だけ進め、残りは次回）
    const extraPhotos = authError
      ? { uploaded: 0, failed: 0, remaining: 0 }
      : await uploadExtraPhotos(accessToken, startedAt)

    const posted = results.filter((r) => r.status === "posted").length
    const failed = results.filter((r) => r.status === "failed").length

    await saveLastRun({
      at: new Date().toISOString(),
      trigger,
      posted,
      failed,
      deferred,
      awaitingApproval: blocked.length,
      authError,
      extraPhotos,
    })

    return NextResponse.json({
      ok: !authError,
      processed: results.length,
      posted,
      failed,
      /** 承認待ちのため実行しなかった件数 */
      awaitingApproval: blocked.length,
      /** 時間切れで次回の実行に回した件数 */
      deferred,
      /** Googleの認証が通らず見送った場合の説明（投稿は予約のまま） */
      authError,
      /** 店舗の「写真」欄に追加した写真 */
      extraPhotos,
      results,
    })
  } finally {
    await releaseExecuteLock(owner).catch(() => {})
  }
}

/**
 * 投稿済みの予約に残っている「2枚目以降の写真」を、店舗の写真欄に1枚ずつ載せる。
 * 1枚ごとに進み具合を保存するので、途中で時間切れになっても次の実行が続きから進める。
 * Google が受け付けなかった写真は理由を残して終わりにする（同じ写真を送り続けない）。
 */
async function uploadExtraPhotos(
  accessToken: string,
  startedAt: number
): Promise<{ uploaded: number; failed: number; remaining: number }> {
  const summary = { uploaded: 0, failed: 0, remaining: 0 }
  const targets = await db
    .select({
      id: scheduledPosts.id,
      locationName: scheduledPosts.locationName,
      accountName: stores.accountName,
      result: scheduledPosts.result,
    })
    .from(scheduledPosts)
    .innerJoin(stores, eq(stores.locationName, scheduledPosts.locationName))
    .where(
      and(
        eq(scheduledPosts.status, "posted"),
        sql`jsonb_array_length(coalesce(${scheduledPosts.result}->'extraPhotos'->'pending', '[]'::jsonb)) > 0`
      )
    )
    .orderBy(asc(scheduledPosts.executedAt))
    .limit(10)

  const client = createGmbClient(accessToken)
  let stop = false

  for (const t of targets) {
    const base = (t.result ?? {}) as Record<string, unknown>
    const cur = (base.extraPhotos ?? {}) as Partial<ExtraPhotos>
    const state: ExtraPhotos = {
      pending: Array.isArray(cur.pending) ? [...cur.pending] : [],
      uploaded: Array.isArray(cur.uploaded) ? [...cur.uploaded] : [],
      failed: Array.isArray(cur.failed) ? [...cur.failed] : [],
    }

    while (state.pending.length > 0 && !stop) {
      if (Date.now() - startedAt > EXTRA_PHOTO_BUDGET_MS) {
        stop = true
        break
      }
      const url = state.pending[0]
      try {
        const res = (await client.createMedia(t.accountName, t.locationName, {
          mediaFormat: "PHOTO",
          sourceUrl: url,
        })) as { name?: string } | null
        state.uploaded.push({ url, name: res?.name })
        summary.uploaded++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isAuthError(msg)) {
          // 認証の問題なら写真のせいではないので、残したまま次回に回す
          stop = true
          break
        }
        state.failed.push({ url, error: msg.slice(0, 300) })
        summary.failed++
      }
      state.pending.shift()
      await db
        .update(scheduledPosts)
        .set({ result: { ...base, extraPhotos: state }, updatedAt: sql`now()` })
        .where(eq(scheduledPosts.id, t.id))
    }
    summary.remaining += state.pending.length
    if (stop) break
  }
  return summary
}

/** 最後の実行結果を1行だけ残す（進捗確認の画面用。失敗しても投稿処理には影響させない） */
async function saveLastRun(run: Record<string, unknown>): Promise<void> {
  try {
    const value = JSON.stringify(run)
    await db
      .insert(appSettings)
      .values({ key: LAST_RUN_KEY, value, updatedBy: "system" })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedBy: "system", updatedAt: sql`now()` },
      })
  } catch {
    // 記録できなくても実行結果は返す
  }
}
