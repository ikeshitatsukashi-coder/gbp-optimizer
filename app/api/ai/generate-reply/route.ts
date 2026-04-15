import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    )
  }

  try {
    const { review } = await request.json()

    if (!review || !review.text || !review.rating || !review.author) {
      return NextResponse.json(
        { error: "review with text, rating, and author is required" },
        { status: 400 }
      )
    }

    const storeName = review.storeName || "当店"

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `あなたは「${storeName}」のオーナーとして、Googleビジネスプロフィールに投稿されたクチコミに返信してください。

## 返信のルール
- 丁寧でビジネスにふさわしいトーンで返信すること
- お客様への感謝の気持ちを必ず伝えること
- クチコミの内容に具体的に触れること（テンプレート的にならないこと）
- 低評価（1〜3星）の場合は、お詫びと改善への姿勢を示すこと
- 高評価（4〜5星）の場合は、感謝と今後もご期待に沿えるよう努めるメッセージにすること
- 返信は3〜5文程度の適切な長さにすること
- 「またのお越しをお待ちしております」のような再来店を促す表現で締めること
- 絵文字は使わないこと
- 返信本文のみを出力すること（タイトルや説明は不要）

## クチコミ情報
- 投稿者: ${review.author}
- 評価: ${review.rating}星（5段階中）
- クチコミ内容: ${review.text}

返信を生成してください。`,
        },
      ],
    })

    const reply =
      message.content[0].type === "text" ? message.content[0].text : ""

    return NextResponse.json({ reply })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Failed to generate reply:", msg)
    return NextResponse.json(
      { error: "Failed to generate reply", detail: msg },
      { status: 500 }
    )
  }
}
