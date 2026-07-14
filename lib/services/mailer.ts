import nodemailer, { type Transporter } from "nodemailer"

/**
 * メール送信（クチコミ依頼用）
 *
 * 本番: お名前.com 等の SMTP を環境変数で設定
 *   SMTP_HOST   … 例: mailXX.onamae.ne.jp / smtp.li-go.jp（コントロールパネルのサーバー情報を確認）
 *   SMTP_PORT   … 465（SSL）または 587（STARTTLS）
 *   SMTP_USER   … メールアドレス全体（例: meo-support@li-go.jp）
 *   SMTP_PASS   … メールパスワード
 *   MAIL_FROM_NAME … 送信者表示名（例: 株式会社LIGO MEOサポート）
 *
 * 開発: SMTP 未設定なら Ethereal（実際には届かないテスト用SMTP）に自動フォールバックし、
 *       プレビューURLを返す。
 */

export function isMailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

let cachedTransporter: Transporter | null = null
let cachedIsEthereal = false

async function getTransporter(): Promise<{ transporter: Transporter; isEthereal: boolean }> {
  if (cachedTransporter) {
    return { transporter: cachedTransporter, isEthereal: cachedIsEthereal }
  }

  if (isMailConfigured()) {
    const port = parseInt(process.env.SMTP_PORT ?? "465", 10)
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465=SSL / 587=STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
    cachedIsEthereal = false
    return { transporter: cachedTransporter, isEthereal: false }
  }

  if (process.env.NODE_ENV === "development") {
    // 開発用: Ethereal のテストアカウント（実際には配信されない）
    const testAccount = await nodemailer.createTestAccount()
    cachedTransporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    })
    cachedIsEthereal = true
    return { transporter: cachedTransporter, isEthereal: true }
  }

  throw new Error(
    "SMTP が未設定です。Vercel の環境変数に SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS を設定してください。"
  )
}

export interface SendResult {
  email: string
  ok: boolean
  error?: string
  /** Ethereal使用時のみ: メールプレビューURL */
  previewUrl?: string
}

export async function sendReviewRequestMail(params: {
  to: string
  toName?: string
  subject: string
  text: string
}): Promise<SendResult> {
  try {
    const { transporter, isEthereal } = await getTransporter()
    const fromAddress = isEthereal
      ? "test@ethereal.email"
      : (process.env.SMTP_USER as string)
    const fromName = process.env.MAIL_FROM_NAME ?? "GBP Optimizer"

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: params.toName ? `"${params.toName}" <${params.to}>` : params.to,
      subject: params.subject,
      text: params.text,
    })

    const previewUrl = isEthereal
      ? (nodemailer.getTestMessageUrl(info) as string | false)
      : false
    return {
      email: params.to,
      ok: true,
      ...(previewUrl ? { previewUrl } : {}),
    }
  } catch (e) {
    return {
      email: params.to,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
