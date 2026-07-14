import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { surveys } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { generatePublicToken } from "@/lib/public-link"

/** アンケートの複製（回答済みで編集できないアンケートの改訂用） */
export async function POST(request: Request) {
  const token = await getAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  let body: { id?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })

  try {
    const [src] = await db.select().from(surveys).where(eq(surveys.id, body.id))
    if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const email = await getSessionEmail()
    const [created] = await db
      .insert(surveys)
      .values({
        token: generatePublicToken(),
        name: `${src.name}（コピー）`,
        description: src.description,
        urlMode: src.urlMode,
        storeSelectMode: src.storeSelectMode,
        targetStores: src.targetStores,
        questions: src.questions,
        collectRespondent: src.collectRespondent,
        status: "active",
        createdBy: email,
      })
      .returning({ id: surveys.id })
    return NextResponse.json({ success: true, id: created.id })
  } catch (e) {
    return errorResponse("Failed to duplicate survey", e)
  }
}
