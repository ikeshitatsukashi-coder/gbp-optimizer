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
      "/api/ext/upload": {
        post: {
          summary: "投稿用画像のアップロード（公開URLを返す）",
          description:
            "予約投稿の mediaUrls に入れる画像を置く。保存先は店舗の会社フォルダ。4MBまで・画像のみ。",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file", "locationId"],
                  properties: {
                    file: { type: "string", format: "binary" },
                    locationId: { type: "string", description: "locations/xxx の xxx" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "{ url, folder }" } },
        },
      },
      "/api/ext/upload-token": {
        post: {
          summary: "動画を直接置くための書き込み許可（10分有効）",
          description:
            "動画は大きいためサーバーを通さず、返した uploadUrl に headers を付けて PUT する。保存先は店舗の会社フォルダ（post-videos/）。mp4/mov・75MBまで。PUT の応答の url を予約（postType=VIDEO）の mediaUrls に入れる。",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["locationId", "contentType", "size"],
                  properties: {
                    locationId: { type: "string", description: "locations/xxx の xxx" },
                    filename: { type: "string" },
                    contentType: { type: "string", enum: ["video/mp4", "video/quicktime"] },
                    size: { type: "integer", description: "バイト数（75MBまで）" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "{ pathname, uploadUrl, headers, folder }" } },
        },
      },
      "/api/ext/links": {
        post: {
          summary: "計測リンクを作る（動画ごとのクリック数を数える）",
          description: "/api/public/r/<token> を開くとクリックを日別に数えて targetUrl へ転送する。同じ店舗・label・転送先なら既存を返す。",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["locationId", "label", "targetUrl"], properties: { locationId: { type: "string" }, label: { type: "string", description: "管理ID（英数字・-・_）" }, targetUrl: { type: "string", description: "https のみ" } } } } } },
          responses: { "200": { description: "{ token, url }" } },
        },
        get: {
          summary: "店舗の計測リンクとクリック数（日別）",
          parameters: [{ name: "locationId", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "{ links: [{ label, url, targetUrl, total, daily }] }" } },
        },
      },
      "/api/ext/media-stats": {
        get: {
          summary: "写真・動画の一覧と、店舗の日別表示回数（読み取り専用）",
          description: "Google は写真・動画ごとの閲覧数を返さない（viewCount は null）。店舗の表示回数は数日遅れ。",
          parameters: [
            { name: "locationId", in: "query", required: true, schema: { type: "string" } },
            { name: "since", in: "query", required: true, schema: { type: "string", format: "date" } },
          ],
          responses: { "200": { description: "{ media, impressions, range }" } },
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
                    postType: { type: "string", enum: ["STANDARD", "EVENT", "OFFER", "ALERT", "VIDEO"], description: "VIDEO は店舗の写真・動画欄に動画を載せる予約（mediaUrls に /api/ext/upload-token で置いた動画URLを1つ）" },
                    mediaUrls: { type: "array", items: { type: "string" }, maxItems: 10 },
                    draft: { type: "boolean" },
                    callToAction: { type: "object", description: "最新情報のボタン。{ actionType: LEARN_MORE|SIGN_UP, url: https }", properties: { actionType: { type: "string" }, url: { type: "string" } } },
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
