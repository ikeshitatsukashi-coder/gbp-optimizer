import { randomBytes } from "crypto"

/** 公開URL用のランダムトークン（40文字hex）※サーバー専用 */
export function generatePublicToken(): string {
  return randomBytes(20).toString("hex")
}

export { googleReviewUrl, locationIdOf, locationNameOf } from "@/lib/review-link"
