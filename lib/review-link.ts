/**
 * クライアント/サーバー両用のURLヘルパー（Node依存なし）
 */

/**
 * 店舗のGoogleクチコミ投稿URLを解決する。
 * 優先順: metadata.newReviewUri > placeId から生成 > Googleマップ検索（フォールバック）
 */
export function googleReviewUrl(store: {
  newReviewUri?: string | null
  placeId?: string | null
  title: string
}): string {
  if (store.newReviewUri) return store.newReviewUri
  if (store.placeId) {
    return `https://search.google.com/local/writereview?placeid=${store.placeId}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.title)}`
}

/** locations/12345 → 12345（公開URLパラメータ用） */
export function locationIdOf(locationName: string): string {
  return locationName.replace(/^locations\//, "")
}

/** 12345 → locations/12345 */
export function locationNameOf(id: string): string {
  return id.startsWith("locations/") ? id : `locations/${id}`
}
