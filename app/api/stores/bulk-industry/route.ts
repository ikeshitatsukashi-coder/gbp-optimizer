import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { stores } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { eq, ilike, or, and, sql, type SQL } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

const VALID_INDUSTRY = new Set([
  "btob_logistics",
  "bakery",
  "funeral",
  "restaurant",
  "construction",
  "staffing",
  "buyback",
  "general_btoc",
  "general_btob",
])

type Field = "title" | "primaryCategory" | "parentCompany" | "address"

interface MapRule {
  field: Field
  /** Substring match (case-insensitive). Multiple keywords OR-joined. */
  patterns: string[]
  /** Target industry */
  industry: string
  /** Optional toggle: also set autoReplyEnabled / autoFlagEnabled in the same operation */
  autoReplyEnabled?: boolean
  autoFlagEnabled?: boolean
  /** Optional: set parentCompany to this value as well */
  parentCompany?: string
  /** Skip stores whose industry has already been changed away from default */
  onlyDefault?: boolean
}

function fieldExpr(field: Field): SQL<unknown> {
  switch (field) {
    case "title":
      return sql`${stores.title}`
    case "primaryCategory":
      return sql`coalesce(${stores.primaryCategory}, '')`
    case "parentCompany":
      return sql`coalesce(${stores.parentCompany}, '')`
    case "address":
      // jsonb address as text for substring match
      return sql`coalesce((${stores.address})::text, '')`
  }
}

function buildWhere(rule: MapRule): SQL<unknown> | undefined {
  const patterns = rule.patterns.map((p) => p.trim()).filter(Boolean)
  if (patterns.length === 0) return undefined
  const expr = fieldExpr(rule.field)
  const orParts = patterns.map((p) => sql`${expr} ILIKE ${"%" + p + "%"}`)
  let combined: SQL<unknown>
  if (orParts.length === 1) {
    combined = orParts[0]
  } else {
    combined = or(...orParts) as SQL<unknown>
  }
  if (rule.onlyDefault) {
    combined = and(combined, eq(stores.industry, "general_btoc" as const)) as SQL<unknown>
  }
  return combined
}

/**
 * POST /api/stores/bulk-industry
 *
 * Body:
 *   { mode: "preview" | "apply", rules: MapRule[] }
 *
 * preview: マッチする店舗一覧を返す（実際の更新はしない）
 * apply:   ルール順に UPDATE を適用（後勝ち：後のルールが上書き）
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`bulk-industry:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 30,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    )
  }

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: { mode?: string; rules?: MapRule[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const mode = body.mode === "apply" ? "apply" : "preview"
  const rules = Array.isArray(body.rules) ? body.rules : []
  if (rules.length === 0) {
    return NextResponse.json({ error: "rules array is required" }, { status: 400 })
  }

  // バリデーション
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]
    if (!r.field || !["title", "primaryCategory", "parentCompany", "address"].includes(r.field)) {
      return NextResponse.json({ error: `rule[${i}].field invalid` }, { status: 400 })
    }
    if (!Array.isArray(r.patterns) || r.patterns.filter((p) => p.trim()).length === 0) {
      return NextResponse.json({ error: `rule[${i}].patterns is empty` }, { status: 400 })
    }
    if (!VALID_INDUSTRY.has(r.industry)) {
      return NextResponse.json({ error: `rule[${i}].industry invalid` }, { status: 400 })
    }
  }

  try {
    if (mode === "preview") {
      const previews: Array<{
        ruleIndex: number
        industry: string
        matchedCount: number
        sample: Array<{ locationName: string; title: string; current: string }>
      }> = []

      for (let i = 0; i < rules.length; i++) {
        const where = buildWhere(rules[i])
        if (!where) continue
        const rows = await db
          .select({
            locationName: stores.locationName,
            title: stores.title,
            current: stores.industry,
          })
          .from(stores)
          .where(where)
          .limit(2000)
        previews.push({
          ruleIndex: i,
          industry: rules[i].industry,
          matchedCount: rows.length,
          sample: rows.slice(0, 30).map((r) => ({
            locationName: r.locationName,
            title: r.title,
            current: r.current as string,
          })),
        })
      }

      return NextResponse.json({ mode, previews })
    }

    // apply
    const applied: Array<{ ruleIndex: number; industry: string; updatedCount: number }> = []
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      const where = buildWhere(rule)
      if (!where) continue

      const patch: Record<string, unknown> = {
        industry: rule.industry,
        updatedAt: new Date(),
      }
      if (typeof rule.autoReplyEnabled === "boolean") {
        patch.autoReplyEnabled = rule.autoReplyEnabled
      }
      if (typeof rule.autoFlagEnabled === "boolean") {
        patch.autoFlagEnabled = rule.autoFlagEnabled
      }
      if (typeof rule.parentCompany === "string" && rule.parentCompany.trim()) {
        patch.parentCompany = rule.parentCompany.trim()
      }

      const result = await db
        .update(stores)
        .set(patch)
        .where(where)
        .returning({ locationName: stores.locationName })

      applied.push({
        ruleIndex: i,
        industry: rule.industry,
        updatedCount: result.length,
      })
    }

    return NextResponse.json({ mode, applied })
  } catch (e) {
    return errorResponse("Bulk industry mapping failed", e)
  }
}
