import { NextResponse } from "next/server"

/**
 * GET /api/ext/openapi
 * 外部 API の OpenAPI 3.1 定義。認証不要（仕様書のみ・データは含まない）。
 * AI エージェント（Claude / GPTs / Gemini 拡張）にこの URL を渡すと
 * 使い方を自動理解してツールを操作できる。
 */
export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "GBP Optimizer External API",
      version: "1.0.0",
      description:
        "社内 GBP 管理ツールの外部連携 API。読み取り系と予約投稿の作成のみ。Google への実投稿・返信送信はこの API からは行えません（ツール内の実行ボタンから人間が実行）。",
    },
    servers: [{ url: "https://gbp-optimizer-phi.vercel.app" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "設定 > API連携 で発行した gbp_live_... 形式のキーを Authorization: Bearer ヘッダーで送信",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/ext/stores": {
        get: {
          summary: "店舗一覧",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["active", "paused", "archived"] } },
            { name: "industry", in: "query", schema: { type: "string" } },
            { name: "q", in: "query", description: "店舗名・電話・親会社の部分一致", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 1000 } },
          ],
          responses: { "200": { description: "店舗リスト" } },
        },
      },
      "/api/ext/diagnosis": {
        get: {
          summary: "全店舗の GBP 最適化診断スコア",
          description:
            "電話/住所/カテゴリ設定・クチコミ返信率・未対応低評価から 100 点満点でスコア化。issues に主な課題が入る。",
          responses: { "200": { description: "スコアとサマリー" } },
        },
      },
      "/api/ext/reviews": {
        get: {
          summary: "クチコミ検索",
          parameters: [
            { name: "storeFilter", in: "query", description: "店舗名部分一致", schema: { type: "string" } },
            { name: "maxRating", in: "query", description: "星いくつ以下", schema: { type: "integer" } },
            { name: "unrepliedOnly", in: "query", schema: { type: "boolean" } },
            { name: "days", in: "query", description: "直近N日", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 500 } },
          ],
          responses: { "200": { description: "クチコミリスト" } },
        },
      },
      "/api/ext/scheduled-posts": {
        get: {
          summary: "予約投稿の一覧",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["pending", "draft", "posted", "failed"] } },
          ],
          responses: { "200": { description: "予約リスト" } },
        },
        post: {
          summary: "予約投稿の作成（実投稿はしない）",
          description:
            "DB に予約を登録するだけ。Google への実投稿はツール内の実行ボタンから人間が行う。draft: true で下書き。",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["scheduledFor", "summary"],
                  properties: {
                    locationName: { type: "string", description: "locations/xxx 形式" },
                    storeName: { type: "string", description: "店舗名の完全一致（locationName の代わり）" },
                    scheduledFor: { type: "string", format: "date-time" },
                    summary: { type: "string", maxLength: 1500 },
                    postType: { type: "string", enum: ["STANDARD", "EVENT", "OFFER", "ALERT"] },
                    mediaUrls: { type: "array", items: { type: "string" }, maxItems: 10 },
                    draft: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "作成結果" } },
        },
      },
    },
  }

  return NextResponse.json(spec)
}
