/**
 * 投稿（ローカル投稿）の上限値。
 *
 * 写真は1投稿につき10枚まで。Google の API リファレンスには明記がないが、
 * Googleビジネスプロフィールの投稿画面が10枚までのため、それに合わせている。
 * 実行時に Google が複数枚を受け付けなかった場合は、1枚だけで投稿し直す
 * （app/api/cron/execute-scheduled/route.ts のフォールバック）。
 */
export const MAX_POST_PHOTOS = 10
