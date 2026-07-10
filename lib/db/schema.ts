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
