import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  serial,
  primaryKey,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

/* -------------------------------------------------------------------------- */
/*                                   ENUMS                                    */
/* -------------------------------------------------------------------------- */

/** 店舗の運用ステータス（meo-dash の「契約中/運用中」相当） */
export const storeStatusEnum = pgEnum("store_status", [
  "active", // 運用中・契約中
  "paused", // 一時停止
  "archived", // 解約済み・アーカイブ
])

/** 業種カテゴリ（返信トーンの切り替えに使用） */
export const industryEnum = pgEnum("industry", [
  "btob_logistics", // 運送・物流・倉庫・観光バス
  "bakery", // ベーカリー
  "funeral", // 葬祭
  "restaurant", // 飲食店
  "construction", // 建設・不動産・建物管理
  "staffing", // 人材派遣
  "buyback", // 買取・質屋・リサイクル
  "general_btoc", // その他BtoC
  "general_btob", // その他BtoB
])

/** 削除申請ステータス */
export const flagStatusEnum = pgEnum("flag_status", [
  "submitted", // 申請成功
  "already_reported", // 既に報告済み
  "failed", // エラー
  "approved", // Google が削除承認（後日確認）
  "rejected", // Google が却下（後日確認）
  "manual", // 手動で申請した記録（GBP管理画面/Googleフォームから人が申請）
])

/** クチコミのアーカイブ理由 */
export const archiveReasonEnum = pgEnum("archive_reason", [
  "current", // 現存（アーカイブではなく最新スナップショット）
  "deleted", // Google から消えた（投稿者削除 or Google による削除）
  "manual", // 手動アーカイブ
])

/* -------------------------------------------------------------------------- */
/*                                   TABLES                                   */
/* -------------------------------------------------------------------------- */

/**
 * 店舗マスタ
 * Google API から取得した店舗情報に、社内独自のメタ情報（運用中フラグ・業種・トーン等）を付与
 */
export const stores = pgTable(
  "stores",
  {
    /** Google location resource name (locations/12345) を主キーに */
    locationName: varchar("location_name", { length: 200 }).primaryKey(),
    /** Google account name (accounts/12345) */
    accountName: varchar("account_name", { length: 200 }).notNull(),
    /** 表示用店舗名 */
    title: text("title").notNull(),
    /** 住所（生データ JSON） */
    address: jsonb("address"),
    /** 電話番号 */
    primaryPhone: varchar("primary_phone", { length: 50 }),
    /** Google カテゴリ（生データ） */
    primaryCategory: text("primary_category"),
    /** 運用ステータス */
    status: storeStatusEnum("status").notNull().default("active"),
    /** 業種カテゴリ（返信トーン切替用） */
    industry: industryEnum("industry").notNull().default("general_btoc"),
    /** 自動返信のON/OFF */
    autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),
    /** 自動削除申請のON/OFF（星2以下＋コメント付き） */
    autoFlagEnabled: boolean("auto_flag_enabled").notNull().default(false),
    /** 親会社名（除外グループ用、例: 「丸進運輸株式会社」） */
    parentCompany: text("parent_company"),
    /** Google Maps Place ID（クチコミ投稿URL生成用） */
    placeId: varchar("place_id", { length: 120 }),
    /** Google公式のクチコミ投稿URL（metadata.newReviewUri） */
    newReviewUri: text("new_review_uri"),
    /** クチコミ投稿通知を送るメールアドレス（未設定なら通知しない） */
    notifyEmail: text("notify_email"),
    /** この語を含む新着クチコミのみ通知（空なら全件通知） */
    reviewNotifyKeywords: jsonb("review_notify_keywords").$type<string[]>(),
    /** 自由メモ */
    notes: text("notes"),
    /** 最後にGoogle APIから情報を同期した時刻 */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stores_status_idx").on(table.status),
    index("stores_industry_idx").on(table.industry),
    index("stores_parent_company_idx").on(table.parentCompany),
  ]
)

/**
 * 店舗別の返信トーン設定
 * 業種デフォルトを上書きしたい時に使う（例: 同じBtoBでも特定店舗だけ口調を変えたい）
 */
export const toneConfigs = pgTable("tone_configs", {
  id: serial("id").primaryKey(),
  locationName: varchar("location_name", { length: 200 })
    .notNull()
    .references(() => stores.locationName, { onDelete: "cascade" })
    .unique(),
  /** ◯◯様/◯◯さん 等 投稿者への呼称テンプレ */
  addresseePattern: text("addressee_pattern"),
  /** 絵文字使用OK/NG */
  allowEmoji: boolean("allow_emoji").notNull().default(false),
  /** 「お客様」表現NG (BtoB等) */
  banKundCustomer: boolean("ban_kund_customer").notNull().default(false),
  /** 文体メモ（自由記述） */
  styleNotes: text("style_notes"),
  /** 冒頭フレーズのバリエーション (JSONB array) */
  openings: jsonb("openings").$type<string[]>(),
  /** 結びフレーズのバリエーション (JSONB array) */
  closings: jsonb("closings").$type<string[]>(),
  /** 言及すべき固有名詞（看板商品等） */
  signatureKeywords: jsonb("signature_keywords").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * クチコミアーカイブ
 * GoogleのAPIから取得したクチコミを保存。削除されたクチコミも履歴として残せる。
 */
export const reviewsArchive = pgTable(
  "reviews_archive",
  {
    /** Google review resource name (locations/12345/reviews/abc) */
    reviewName: varchar("review_name", { length: 300 }).primaryKey(),
    locationName: varchar("location_name", { length: 200 })
      .notNull()
      .references(() => stores.locationName, { onDelete: "cascade" }),
    reviewer: text("reviewer"),
    reviewerProfilePhotoUrl: text("reviewer_profile_photo_url"),
    /** 1-5 */
    starRating: integer("star_rating"),
    comment: text("comment"),
    /** Googleでのクチコミ作成日時 */
    createTime: timestamp("create_time", { withTimezone: true }),
    updateTime: timestamp("update_time", { withTimezone: true }),
    /** 既存返信の本文 */
    replyComment: text("reply_comment"),
    replyUpdateTime: timestamp("reply_update_time", { withTimezone: true }),
    /** アーカイブ理由 */
    archiveReason: archiveReasonEnum("archive_reason").notNull().default("current"),
    /** 削除確認時刻（archiveReason=deleted の場合） */
    deletedDetectedAt: timestamp("deleted_detected_at", { withTimezone: true }),
    /** 生データ (Google API レスポンスそのまま) */
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reviews_archive_location_idx").on(table.locationName),
    index("reviews_archive_create_time_idx").on(table.createTime),
    index("reviews_archive_star_rating_idx").on(table.starRating),
    index("reviews_archive_archive_reason_idx").on(table.archiveReason),
  ]
)

/**
 * 削除申請履歴
 * いつどのクチコミに削除申請を出したか・結果がどうだったかを記録
 */
export const flagHistory = pgTable(
  "flag_history",
  {
    id: serial("id").primaryKey(),
    reviewName: varchar("review_name", { length: 300 }).notNull(),
    locationName: varchar("location_name", { length: 200 })
      .notNull()
      .references(() => stores.locationName, { onDelete: "cascade" }),
    /** スナップショット: 申請時のレビュー内容 */
    reviewerSnapshot: text("reviewer_snapshot"),
    starRatingSnapshot: integer("star_rating_snapshot"),
    commentSnapshot: text("comment_snapshot"),
    /** 申請ステータス */
    status: flagStatusEnum("status").notNull(),
    /** API レスポンス (raw) */
    apiResponse: jsonb("api_response"),
    /** エラーメッセージ（status=failed の場合） */
    errorMessage: text("error_message"),
    /** 申請日時 */
    flaggedAt: timestamp("flagged_at", { withTimezone: true }).notNull().defaultNow(),
    /** Google から削除確認できた日時（後日UPDATE） */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /**
     * 申請方法。Google に API 経由の削除申請は存在しないため、
     * 実務ではGBP管理画面やGoogleのフォームから人が申請する。その記録用。
     * api | gbp_ui | google_form | other
     */
    requestMethod: varchar("request_method", { length: 20 }).notNull().default("api"),
    /** 申請した担当者 */
    requestedBy: text("requested_by"),
    /** 申請理由・クライアント報告用メモ */
    note: text("note"),
  },
  (table) => [
    index("flag_history_review_idx").on(table.reviewName),
    index("flag_history_location_idx").on(table.locationName),
    index("flag_history_flagged_at_idx").on(table.flaggedAt),
    index("flag_history_status_idx").on(table.status),
  ]
)

/**
 * 個別レビュー除外リスト
 * 「このレビューには触らない」という指定（自動返信・自動削除申請の両方からスキップ）
 */
export const reviewExclusions = pgTable(
  "review_exclusions",
  {
    id: serial("id").primaryKey(),
    locationName: varchar("location_name", { length: 200 })
      .notNull()
      .references(() => stores.locationName, { onDelete: "cascade" }),
    /** Google review resource name または reviewer + createTime の複合 */
    reviewName: varchar("review_name", { length: 300 }),
    reviewerName: text("reviewer_name"),
    /** 元のクチコミ作成時刻（reviewName が変わっても照合できるように） */
    createTime: timestamp("create_time", { withTimezone: true }),
    /** 自動返信からの除外 */
    excludeAutoReply: boolean("exclude_auto_reply").notNull().default(true),
    /** 自動削除申請からの除外 */
    excludeAutoFlag: boolean("exclude_auto_flag").notNull().default(true),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("review_exclusions_location_idx").on(table.locationName),
    uniqueIndex("review_exclusions_review_name_uniq").on(table.reviewName),
  ]
)

/**
 * 自動投稿スケジュール
 * 「年間予約投稿」用 — 投稿予定の本文・画像・公開日を貯めておく
 */
export const scheduledPosts = pgTable(
  "scheduled_posts",
  {
    id: serial("id").primaryKey(),
    locationName: varchar("location_name", { length: 200 })
      .notNull()
      .references(() => stores.locationName, { onDelete: "cascade" }),
    /** 投稿予定日時 (UTC) */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    /** post type: STANDARD | EVENT | OFFER | ALERT */
    postType: varchar("post_type", { length: 30 }).notNull().default("STANDARD"),
    /** 投稿本文 */
    summary: text("summary").notNull(),
    /** メディアURL一覧 */
    mediaUrls: jsonb("media_urls").$type<string[]>(),
    /** CTA設定 */
    callToAction: jsonb("call_to_action"),
    /** イベント情報 (postType=EVENT の場合) */
    event: jsonb("event"),
    /** ステータス */
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | posted | failed
    /** 実行日時 */
    executedAt: timestamp("executed_at", { withTimezone: true }),
    /** 実行結果 (postName 等) */
    result: jsonb("result"),
    /** Google側の投稿状態: PROCESSING / LIVE / NOT_FOUND など（反映確認用） */
    gbpState: varchar("gbp_state", { length: 30 }),
    gbpStateCheckedAt: timestamp("gbp_state_checked_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    /** スプシ起源の場合の参照 */
    sourceSheetId: varchar("source_sheet_id", { length: 100 }),
    sourceRow: integer("source_row"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("scheduled_posts_location_idx").on(table.locationName),
    index("scheduled_posts_scheduled_for_idx").on(table.scheduledFor),
    index("scheduled_posts_status_idx").on(table.status),
  ]
)

/**
 * 業種別のデフォルトトーン設定
 * stores.industry → 既定のトーン設定を引き当てるための参照テーブル
 */
export const industryDefaults = pgTable("industry_defaults", {
  industry: industryEnum("industry").primaryKey(),
  allowEmoji: boolean("allow_emoji").notNull().default(false),
  banKundCustomer: boolean("ban_kund_customer").notNull().default(false),
  styleNotes: text("style_notes").notNull(),
  openings: jsonb("openings").$type<string[]>().notNull(),
  closings: jsonb("closings").$type<string[]>().notNull(),
  /** 1-2★コメントなしのテンプレ集 */
  templatesLowNoComment: jsonb("templates_low_no_comment").$type<string[]>(),
  /** 4-5★コメントなしのテンプレ集 */
  templatesHighNoComment: jsonb("templates_high_no_comment").$type<string[]>(),
})

/**
 * 外部連携用 API キー
 * キー本体は保存せず SHA-256 ハッシュのみ保持（発行時に一度だけ表示）。
 * 対象は読み取り系 + 予約作成のみ（/api/ext/*）。Google への直接書き込みは対象外。
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    /** 用途がわかる名前（例: "山田さん Chrome連携"） */
    name: text("name").notNull(),
    /** SHA-256 hex */
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    /** 表示用プレフィックス（gbp_live_xxxx） */
    prefix: varchar("prefix", { length: 16 }).notNull(),
    /** 発行者のメールアドレス */
    createdBy: text("created_by"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("api_keys_key_hash_uniq").on(table.keyHash)]
)

export type ApiKey = typeof apiKeys.$inferSelect

/**
 * アプリ全体の設定（key-value）
 * 例: gbp_refresh_token … 予約投稿の自動実行に使う Google リフレッシュトークン
 */
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/* -------------------------------------------------------------------------- */
/*                     ユーザー権限 / ワークフロー承認                           */
/* -------------------------------------------------------------------------- */

/** 権限ロール */
export const userRoleEnum = pgEnum("user_role", [
  "admin", // 全権（ユーザー管理・ワークフロー設定・APIキー・削除申請）
  "editor", // 投稿・返信などの通常運用
  "viewer", // 閲覧のみ
])

/**
 * 利用者マスタ
 * ログインは従来どおり li-go.jp ドメインで許可し、ここで役割を管理する。
 * 未登録ユーザーは既定ロール（editor）として扱い、初回ログイン時に登録される。
 */
export const appUsers = pgTable("app_users", {
  email: varchar("email", { length: 200 }).primaryKey(),
  displayName: text("display_name"),
  role: userRoleEnum("role").notNull().default("editor"),
  /** 無効化するとログインしても操作できない */
  disabled: boolean("disabled").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type AppUser = typeof appUsers.$inferSelect

/** 承認ステータス */
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending", // 申請中
  "approved", // 承認済み
  "rejected", // 差し戻し
])

/**
 * ワークフロー承認申請
 * 現状の対象は予約投稿（scheduled_post）。承認されるまで自動実行の対象外になる。
 */
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: serial("id").primaryKey(),
    /** 対象種別: scheduled_post */
    targetType: varchar("target_type", { length: 30 }).notNull(),
    targetId: integer("target_id").notNull(),
    /** 一覧表示用のスナップショット */
    summary: text("summary"),
    locationName: varchar("location_name", { length: 200 }),
    status: approvalStatusEnum("status").notNull().default("pending"),
    requestedBy: text("requested_by"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    comment: text("comment"),
  },
  (table) => [
    index("approval_requests_status_idx").on(table.status),
    index("approval_requests_target_idx").on(table.targetType, table.targetId),
  ]
)

export type ApprovalRequest = typeof approvalRequests.$inferSelect

/**
 * 外部サービス連携（SNS等）
 * provider ごとに1店舗あたり複数アカウントを持てる。
 * アクセストークンは表示しない前提で保管し、UIには接続状態のみ返す。
 */
export const socialConnections = pgTable(
  "social_connections",
  {
    id: serial("id").primaryKey(),
    locationName: varchar("location_name", { length: 200 })
      .notNull()
      .references(() => stores.locationName, { onDelete: "cascade" }),
    /** instagram | facebook | line | x | ga4 */
    provider: varchar("provider", { length: 20 }).notNull(),
    /** 表示用のアカウント名（@handle / ページ名 等） */
    accountName: text("account_name"),
    /** 外部サービス側のID（IGビジネスID / FBページID / LINEチャネルID 等） */
    externalId: text("external_id"),
    /** 長期アクセストークン等（画面には返さない） */
    accessToken: text("access_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    /** connected | expired | error | pending */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    /** 連携ごとの設定（GBPへ転載する/ハッシュタグ除去/電話番号を含む投稿を除外 等） */
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("social_connections_location_idx").on(table.locationName),
    index("social_connections_provider_idx").on(table.provider),
  ]
)

export type SocialConnection = typeof socialConnections.$inferSelect

/* -------------------------------------------------------------------------- */
/*                       アンケート（クチコミ促進）                              */
/* -------------------------------------------------------------------------- */

/** アンケートの質問構造（jsonb） */
export interface SurveyChoice {
  label: string
  /** アンケート回答後の遷移先: google=Googleレビューへ誘導 / tool=ツール内レビュー */
  redirect: "google" | "tool"
}
export interface SurveyQuestion {
  title: string
  /** single=単一選択 / multiple=複数選択 */
  type: "single" | "multiple"
  choices: SurveyChoice[]
}

/**
 * アンケート定義
 * 公開URL /s/{token} で回答を受け付ける。回答が1件でも付くと編集不可（複製で対応）。
 */
export const surveys = pgTable(
  "surveys",
  {
    id: serial("id").primaryKey(),
    /** 公開URL用トークン */
    token: varchar("token", { length: 64 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** group=グループ共通URL（フォーム内で店舗選択） / per_store=店舗ごとのURL */
    urlMode: varchar("url_mode", { length: 20 }).notNull().default("group"),
    /** pulldown=店舗名プルダウン / buttons=店舗一覧ボタン */
    storeSelectMode: varchar("store_select_mode", { length: 20 })
      .notNull()
      .default("pulldown"),
    /** 対象店舗（null = 全 active 店舗） */
    targetStores: jsonb("target_stores").$type<string[]>(),
    questions: jsonb("questions").$type<SurveyQuestion[]>().notNull(),
    /** 回答者情報フォーム（氏名・連絡先）を付けるか */
    collectRespondent: boolean("collect_respondent").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active | closed
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("surveys_token_uniq").on(table.token)]
)

/** アンケート回答 */
export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: serial("id").primaryKey(),
    surveyId: integer("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    locationName: varchar("location_name", { length: 200 })
      .notNull()
      .references(() => stores.locationName, { onDelete: "cascade" }),
    /** [{ title, selected: ["非常に満足"] }] */
    answers: jsonb("answers").$type<{ title: string; selected: string[] }[]>().notNull(),
    respondentName: text("respondent_name"),
    respondentContact: text("respondent_contact"),
    /** 回答後の遷移先: google | tool */
    redirectedTo: varchar("redirected_to", { length: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("survey_responses_survey_idx").on(table.surveyId),
    index("survey_responses_location_idx").on(table.locationName),
    index("survey_responses_created_idx").on(table.createdAt),
  ]
)

/**
 * ツール内ユーザーレビュー（Googleレビュー以外の評価）
 * 不満系の回答者をここに誘導し、社内だけで閲覧する
 */
export const surveyReviews = pgTable(
  "survey_reviews",
  {
    id: serial("id").primaryKey(),
    surveyId: integer("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    responseId: integer("response_id").references(() => surveyResponses.id, {
      onDelete: "set null",
    }),
    locationName: varchar("location_name", { length: 200 })
      .notNull()
      .references(() => stores.locationName, { onDelete: "cascade" }),
    /** 1-5 */
    rating: integer("rating"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("survey_reviews_survey_idx").on(table.surveyId),
    index("survey_reviews_location_idx").on(table.locationName),
  ]
)

/**
 * クチコミ依頼メールの送信履歴
 * 来店したお客様にアンケート/クチコミURLをメールで案内する機能のログ
 */
export const reviewRequests = pgTable(
  "review_requests",
  {
    id: serial("id").primaryKey(),
    locationName: varchar("location_name", { length: 200 })
      .notNull()
      .references(() => stores.locationName, { onDelete: "cascade" }),
    /** survey=アンケートURL / google=Googleクチコミ画面 / none=URLなし */
    urlType: varchar("url_type", { length: 20 }).notNull().default("survey"),
    surveyId: integer("survey_id").references(() => surveys.id, {
      onDelete: "set null",
    }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    recipients: jsonb("recipients")
      .$type<{ name: string; email: string }[]>()
      .notNull(),
    sentCount: integer("sent_count").notNull().default(0),
    failCount: integer("fail_count").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("done"), // done | partial | failed
    /** 宛先ごとの送信結果 */
    results: jsonb("results"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("review_requests_location_idx").on(table.locationName)]
)

/* -------------------------------------------------------------------------- */
/*                    お客様共有リンク（閲覧専用ページ）                          */
/* -------------------------------------------------------------------------- */

/**
 * お客様向け閲覧専用ページの共有リンク
 * /share/{token} で認証なし閲覧。インサイトは発行/更新時のスナップショット。
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: serial("id").primaryKey(),
    token: varchar("token", { length: 64 }).notNull(),
    /** 表示名（例: 辻水産様向けレポート） */
    name: text("name").notNull(),
    /** store=単店舗 / company=親会社グループ */
    scopeType: varchar("scope_type", { length: 20 }).notNull(),
    locationName: varchar("location_name", { length: 200 }),
    parentCompany: text("parent_company"),
    /** 表示セクション: ["diagnosis","reviews","insights"] */
    sections: jsonb("sections").$type<string[]>().notNull(),
    /** インサイトのスナップショット（発行・更新時に取得） */
    insightsSnapshot: jsonb("insights_snapshot"),
    revoked: boolean("revoked").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("share_links_token_uniq").on(table.token)]
)

/* -------------------------------------------------------------------------- */
/*                                 RELATIONS                                  */
/* -------------------------------------------------------------------------- */

export const storesRelations = relations(stores, ({ many, one }) => ({
  reviews: many(reviewsArchive),
  flagHistory: many(flagHistory),
  exclusions: many(reviewExclusions),
  scheduledPosts: many(scheduledPosts),
  toneConfig: one(toneConfigs, {
    fields: [stores.locationName],
    references: [toneConfigs.locationName],
  }),
}))

export const reviewsArchiveRelations = relations(reviewsArchive, ({ one, many }) => ({
  store: one(stores, {
    fields: [reviewsArchive.locationName],
    references: [stores.locationName],
  }),
  flagHistory: many(flagHistory),
}))

export const flagHistoryRelations = relations(flagHistory, ({ one }) => ({
  store: one(stores, {
    fields: [flagHistory.locationName],
    references: [stores.locationName],
  }),
  review: one(reviewsArchive, {
    fields: [flagHistory.reviewName],
    references: [reviewsArchive.reviewName],
  }),
}))

export const reviewExclusionsRelations = relations(reviewExclusions, ({ one }) => ({
  store: one(stores, {
    fields: [reviewExclusions.locationName],
    references: [stores.locationName],
  }),
}))

export const scheduledPostsRelations = relations(scheduledPosts, ({ one }) => ({
  store: one(stores, {
    fields: [scheduledPosts.locationName],
    references: [stores.locationName],
  }),
}))

export const toneConfigsRelations = relations(toneConfigs, ({ one }) => ({
  store: one(stores, {
    fields: [toneConfigs.locationName],
    references: [stores.locationName],
  }),
}))

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type Store = typeof stores.$inferSelect
export type NewStore = typeof stores.$inferInsert
export type ReviewArchive = typeof reviewsArchive.$inferSelect
export type NewReviewArchive = typeof reviewsArchive.$inferInsert
export type FlagHistory = typeof flagHistory.$inferSelect
export type NewFlagHistory = typeof flagHistory.$inferInsert
export type ReviewExclusion = typeof reviewExclusions.$inferSelect
export type NewReviewExclusion = typeof reviewExclusions.$inferInsert
export type ScheduledPost = typeof scheduledPosts.$inferSelect
export type NewScheduledPost = typeof scheduledPosts.$inferInsert
export type ToneConfig = typeof toneConfigs.$inferSelect
export type IndustryDefault = typeof industryDefaults.$inferSelect
export type Survey = typeof surveys.$inferSelect
export type NewSurvey = typeof surveys.$inferInsert
export type SurveyResponse = typeof surveyResponses.$inferSelect
export type SurveyReview = typeof surveyReviews.$inferSelect
export type ShareLink = typeof shareLinks.$inferSelect
export type ReviewRequest = typeof reviewRequests.$inferSelect
