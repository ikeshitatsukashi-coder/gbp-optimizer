import crypto from "node:crypto"

/**
 * 外部サービスのアクセストークンをDBに保存するための暗号化。
 *
 * LINEのチャネルアクセストークンなど、他社から預かる資格情報を平文で持つと
 * DBのダンプが流出した時点で相手のアカウントを操作できてしまうため、
 * 保存時に AES-256-GCM で暗号化する。
 *
 * 鍵は環境変数 TOKEN_ENCRYPTION_KEY（32バイトのhexまたはbase64）から読む。
 * 形式: v1.<iv(base64)>.<authTag(base64)>.<ciphertext(base64)>
 * 先頭にバージョンを付けているので、将来鍵を回す場合も判別できる。
 */

const PREFIX = "v1"

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY が未設定です。トークンを保存する前に環境変数を設定してください。"
    )
  }
  // hex(64文字) と base64 の両方を受け付ける
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY は32バイトである必要があります（現在 ${key.length} バイト）`
    )
  }
  return key
}

/** 鍵が設定されているか（画面側で事前に警告を出すため） */
export function hasEncryptionKey(): boolean {
  try {
    getKey()
    return true
  } catch {
    return false
  }
}

export function encryptToken(plain: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(
    "."
  )
}

/**
 * 復号する。
 * 暗号化前に保存された平文のトークンはそのまま返す（移行期間のため）。
 */
export function decryptToken(stored: string | null): string | null {
  if (!stored) return null
  if (!stored.startsWith(`${PREFIX}.`)) return stored

  const [, ivB64, tagB64, dataB64] = stored.split(".")
  if (!ivB64 || !tagB64 || !dataB64) return null

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64")
  )
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

/** 画面表示用に末尾4文字だけ見せる */
export function maskToken(plain: string | null): string | null {
  if (!plain) return null
  if (plain.length <= 8) return "••••"
  return `••••••••${plain.slice(-4)}`
}
