"use client"

import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { normalizeSearchText } from "@/lib/search-normalize"
import { googleReviewUrl, locationIdOf } from "@/lib/review-link"
import { Loader2, Printer, Search, AlertCircle } from "lucide-react"

/* -------------------------------------------------------------------------- */
/*  アンケート配布 — QRコード付きポスター（A4/B5）・名刺のPDF出力              */
/*  ブラウザの印刷ダイアログから「PDFとして保存」で出力する                     */
/* -------------------------------------------------------------------------- */

interface StoreRow {
  locationName: string
  title: string
  primaryPhone: string | null
  placeId: string | null
  newReviewUri: string | null
}
interface SurveyOption {
  id: number
  token: string
  name: string
  questions: { title: string }[]
  /** このアンケートが回答を受け付ける店舗。空なら全店舗を受け付ける */
  targetStores?: string[] | null
}

/**
 * ポスターデザイン。
 * target で「どのQRの時に選べるか」を分ける。
 *   both   … アンケート / Googleクチコミ どちらでも使える
 *   google … Googleクチコミ専用（クチコミ投稿への導線に特化したデザイン）
 */
const POSTER_DESIGNS = {
  pop: { label: "ポップ（吹き出し）", swatch: "#2b46c8", target: "both" },
  minimal: { label: "ミニマル・ナチュラル", swatch: "#9fd4d4", target: "both" },
  checklist: { label: "チェックリスト", swatch: "#e8833a", target: "both" },
  info: { label: "しっかり案内", swatch: "#2f8f85", target: "both" },
  gpop: { label: "クチコミ専用・ポップ", swatch: "#ea4335", target: "google" },
  gstar: { label: "クチコミ専用・星", swatch: "#fbbc05", target: "google" },
  gchic: { label: "クチコミ専用・シック", swatch: "#16233a", target: "google" },
} as const
type PosterDesignKey = keyof typeof POSTER_DESIGNS

const CARD_COLORS = ["#e8833a", "#e35d6a", "#4a90e2", "#41a381", "#6b7280"]

const BODY_SIMPLE =
  "本日はご利用いただきありがとうございました！\nよろしければアンケートにご回答お願いいたします。"
const BODY_DETAILED =
  "本日はご利用いただき誠にありがとうございました。\nお客様の声をより良いサービスづくりに活かすため、アンケートを実施しております。\n1分ほどで完了しますので、ぜひご協力をお願いいたします。"
/** QRの遷移先がGoogleクチコミのときの案内文（アンケート用の文面のままだと内容が合わない） */
const GOOGLE_BODY_SIMPLE =
  "本日はご利用いただきありがとうございました！\nよろしければGoogleのクチコミ投稿にご協力ください。"
const GOOGLE_BODY_DETAILED =
  "本日はご利用いただき誠にありがとうございました。\nみなさまの声が、これからのサービスをより良くする力になります。\n1分ほどで投稿できますので、ぜひご協力をお願いいたします。"

/** サブタイトルの初期値（QRの遷移先で切り替える） */
const SUBTITLE_DEFAULT = {
  survey: "アンケート ご協力のお願い",
  google: "クチコミ投稿 よろしくお願いします",
} as const

const FONT_SANS =
  "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP',sans-serif"
const FONT_ROUND =
  "'Hiragino Maru Gothic ProN','Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif"

/** チェックリスト用のデフォルト設問（アンケート未選択時） */
const DEFAULT_CHECK_ITEMS = [
  "スタッフの対応はいかがでしたか？",
  "サービスの内容はいかがでしたか？",
  "また利用したいと思いますか？",
]

interface PosterProps {
  store: StoreRow
  qr: string | null
  subtitle: string
  bodyText: string
  telFallback: string
  /**
   * ポスターに載せる会社名の上書き（空ならGBPの登録名をそのまま使う）。
   * 「株式会社◯◯ 本社（◯◯グループ）」のような表記に直したい場合に使う。
   */
  companyName: string
  /** お問い合わせ先の表記（空なら会社名） */
  contactText: string
  /** 電話番号を表示するか */
  showTel: boolean
  qrLabel: string
  checkItems: string[]
}

/* ============================== 共通パーツ ============================== */

/**
 * タイトルをスペース区切りの意味単位で折り返す（「お願い」だけ次行に落ちる等を防ぐ）
 */
function TitleSegments({ text }: { text: string }) {
  const segs = text.trim().split(/\s+/)
  return (
    <>
      {segs.map((s, i) => (
        <span key={i} style={{ display: "inline-block", margin: "0 1mm" }}>
          {s}
        </span>
      ))}
    </>
  )
}

/* ---------------------- ベクターイラスト（SVG手描き） ---------------------- */

/** キラキラ（4方向スター） */
function Sparkle({
  size,
  color,
  style,
}: {
  size: number
  color: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: `${size}mm`, height: `${size}mm`, position: "absolute", ...style }}
    >
      <path d="M50 2 L60 40 L98 50 L60 60 L50 98 L40 60 L2 50 L40 40 Z" fill={color} />
    </svg>
  )
}

/** フラット人物バスト（柏市チラシ風） */
function PersonBust({
  skin,
  hair,
  shirt,
  variant = "short",
  widthMm,
  style,
}: {
  skin: string
  hair: string
  shirt: string
  variant?: "short" | "bob" | "long" | "bun" | "glasses"
  widthMm: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 100 112"
      style={{ width: `${widthMm}mm`, height: `${(widthMm * 112) / 100}mm`, ...style }}
    >
      {variant === "long" && (
        <path d="M27 40 h46 v34 q0 10 -10 10 h-26 q-10 0 -10 -10 z" fill={hair} />
      )}
      {variant === "bun" && <circle cx="50" cy="15" r="9" fill={hair} />}
      {/* 髪ベース */}
      <circle cx="50" cy={variant === "short" || variant === "glasses" ? 38 : 41} r="23" fill={hair} />
      {variant === "bob" && (
        <>
          <rect x="25" y="40" width="9" height="22" rx="4.5" fill={hair} />
          <rect x="66" y="40" width="9" height="22" rx="4.5" fill={hair} />
        </>
      )}
      {/* 耳 */}
      <circle cx="31" cy="51" r="4" fill={skin} />
      <circle cx="69" cy="51" r="4" fill={skin} />
      {/* 顔 */}
      <circle cx="50" cy="50" r="19" fill={skin} />
      {/* 体 */}
      <path d="M18 112 Q18 80 50 80 Q82 80 82 112 Z" fill={shirt} />
      {/* 目・口・ほっぺ */}
      {variant === "glasses" ? (
        <>
          <circle cx="43" cy="52" r="5.5" fill="none" stroke="#4a3b32" strokeWidth="1.8" />
          <circle cx="57" cy="52" r="5.5" fill="none" stroke="#4a3b32" strokeWidth="1.8" />
          <path d="M48.5 52 h3" stroke="#4a3b32" strokeWidth="1.8" />
          <circle cx="43" cy="52" r="1.8" fill="#4a3b32" />
          <circle cx="57" cy="52" r="1.8" fill="#4a3b32" />
        </>
      ) : (
        <>
          <circle cx="43" cy="52" r="2" fill="#4a3b32" />
          <circle cx="57" cy="52" r="2" fill="#4a3b32" />
        </>
      )}
      <path
        d="M45 60 Q50 64 55 60"
        stroke="#4a3b32"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="36" cy="57" r="3" fill="#f2a9a0" opacity="0.5" />
      <circle cx="64" cy="57" r="3" fill="#f2a9a0" opacity="0.5" />
    </svg>
  )
}

/** 指さしポーズの人物（チェックリスト用） */
function PointingPerson({ widthMm, style }: { widthMm: number; style?: React.CSSProperties }) {
  const skin = "#f7d9c4"
  const hair = "#4a3a32"
  const shirt = "#e8833a"
  return (
    <svg
      viewBox="0 0 130 130"
      style={{ width: `${widthMm}mm`, height: `${widthMm}mm`, position: "absolute", ...style }}
    >
      {/* 後ろ髪 */}
      <path d="M32 46 h46 v32 q0 10 -10 10 h-26 q-10 0 -10 -10 z" fill={hair} />
      <circle cx="55" cy="46" r="23" fill={hair} />
      <circle cx="55" cy="20" r="9" fill={hair} />
      <circle cx="36" cy="56" r="4" fill={skin} />
      <circle cx="74" cy="56" r="4" fill={skin} />
      <circle cx="55" cy="55" r="19" fill={skin} />
      {/* 体 */}
      <path d="M22 130 Q22 88 55 88 Q88 88 88 130 Z" fill={shirt} />
      {/* 腕（指さし） */}
      <path
        d="M80 100 Q100 88 108 68"
        stroke={shirt}
        strokeWidth="13"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="109" cy="64" r="7" fill={skin} />
      <path d="M110 60 L114 48" stroke={skin} strokeWidth="5" strokeLinecap="round" />
      {/* 顔 */}
      <circle cx="48" cy="57" r="2" fill="#4a3b32" />
      <circle cx="62" cy="57" r="2" fill="#4a3b32" />
      <path d="M50 65 Q55 69 60 65" stroke="#4a3b32" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="41" cy="62" r="3" fill="#f2a9a0" opacity="0.5" />
      <circle cx="69" cy="62" r="3" fill="#f2a9a0" opacity="0.5" />
    </svg>
  )
}

/** QRの上からひょっこり覗く顔（ポップ用・線画） */
function PeekingFace({ widthMm, style }: { widthMm: number; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 60"
      style={{
        width: `${widthMm}mm`,
        height: `${(widthMm * 60) / 100}mm`,
        position: "absolute",
        ...style,
      }}
    >
      <circle cx="50" cy="34" r="21" fill="white" stroke={POP_BLUE} strokeWidth="3" />
      <path
        d="M31 28 Q34 12 50 11 Q66 12 69 28"
        fill="white"
        stroke={POP_BLUE}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M42 13 L41 22 M50 11 L50 20 M58 13 L59 22" stroke={POP_BLUE} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="43" cy="36" r="2.4" fill={POP_BLUE} />
      <circle cx="57" cy="36" r="2.4" fill={POP_BLUE} />
      <path d="M46 44 Q50 47.5 54 44" stroke={POP_BLUE} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <rect x="21" y="49" width="14" height="8.5" rx="4" fill="white" stroke={POP_BLUE} strokeWidth="2.6" />
      <rect x="65" y="49" width="14" height="8.5" rx="4" fill="white" stroke={POP_BLUE} strokeWidth="2.6" />
    </svg>
  )
}

/** プレゼントボックス（ミニマル用） */
function GiftBox({ size, color, style }: { size: number; color: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" style={{ width: `${size}mm`, height: `${size}mm`, ...style }}>
      <rect x="16" y="42" width="68" height="48" rx="5" fill={color} />
      <rect x="10" y="30" width="80" height="16" rx="4" fill={color} opacity="0.75" />
      <rect x="44" y="30" width="12" height="60" fill="white" opacity="0.85" />
      <path
        d="M50 30 q-16 -14 -20 -3 q-2 9 20 3 q16 -14 20 -3 q2 9 -20 3 z"
        fill={color}
        opacity="0.9"
      />
    </svg>
  )
}

/** スマホでQR読み取りアイコン（線画） */
function PhoneQrIcon({ widthMm, color, style }: { widthMm: number; color: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: `${widthMm}mm`, height: `${widthMm}mm`, ...style }}
    >
      <rect x="28" y="6" width="44" height="88" rx="9" fill="white" stroke={color} strokeWidth="4" />
      <path d="M44 14 h12" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      {/* QR */}
      <rect x="38" y="30" width="11" height="11" fill={color} />
      <rect x="53" y="30" width="11" height="11" fill={color} />
      <rect x="38" y="45" width="11" height="11" fill={color} />
      <rect x="53" y="47" width="5" height="5" fill={color} />
      <rect x="59" y="52" width="5" height="5" fill={color} />
      {/* 電波 */}
      <path d="M80 30 q8 20 0 40 M88 24 q11 26 0 52" stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** 鉛筆（チェックリスト用・斜め置き） */
function PencilIcon({ widthMm, style }: { widthMm: number; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 30"
      style={{
        width: `${widthMm}mm`,
        height: `${(widthMm * 30) / 120}mm`,
        position: "absolute",
        ...style,
      }}
    >
      <rect x="4" y="8" width="14" height="14" rx="3" fill="#e88a9a" />
      <rect x="16" y="6" width="6" height="18" fill="#c8ccd4" />
      <rect x="22" y="5" width="70" height="20" rx="2" fill="#f3b64c" />
      <path d="M92 5 L112 15 L92 25 Z" fill="#f7d9c4" />
      <path d="M104 11 L112 15 L104 19 Z" fill="#4a3a32" />
    </svg>
  )
}

function QrBox({
  qr,
  sizeMm,
  border,
}: {
  qr: string | null
  sizeMm: number
  border?: string
}) {
  return (
    <div
      style={{
        width: `${sizeMm}mm`,
        height: `${sizeMm}mm`,
        backgroundColor: "white",
        padding: "2.5mm",
        border: border ?? "none",
        borderRadius: "2mm",
      }}
    >
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR" style={{ width: "100%", height: "100%" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", backgroundColor: "#eee" }} />
      )}
    </div>
  )
}

/* ============================ ① ポップ（吹き出し） ============================ */

const POP_BLUE = "#2b46c8"
const POP_YELLOW = "#ffe94a"

function Bubble({
  x,
  y,
  w,
  rotate,
  children,
  tail = "br",
  yellow = false,
}: {
  x: number
  y: number
  w: number
  rotate: number
  children: React.ReactNode
  tail?: "br" | "bl" | "tr" | "tl"
  yellow?: boolean
}) {
  const tailPos: Record<string, React.CSSProperties> = {
    br: { right: "8mm", bottom: "-2.2mm", borderWidth: "0 1mm 1mm 0" },
    bl: { left: "8mm", bottom: "-2.2mm", borderWidth: "0 0 1mm 1mm" },
    tr: { right: "8mm", top: "-2.2mm", borderWidth: "1mm 1mm 0 0" },
    tl: { left: "8mm", top: "-2.2mm", borderWidth: "1mm 0 0 1mm" },
  }
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}mm`,
        top: `${y}mm`,
        width: `${w}mm`,
        transform: `rotate(${rotate}deg)`,
      }}
    >
      {yellow && (
        <div
          style={{
            position: "absolute",
            left: "2mm",
            top: "2.5mm",
            width: "100%",
            height: "100%",
            backgroundColor: POP_YELLOW,
            borderRadius: "3mm",
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          border: `1.1mm solid ${POP_BLUE}`,
          backgroundColor: "white",
          borderRadius: "3mm",
          padding: "4mm 5mm",
          fontSize: "5mm",
          fontWeight: 700,
          color: POP_BLUE,
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            width: "4mm",
            height: "4mm",
            backgroundColor: "white",
            borderColor: POP_BLUE,
            borderStyle: "solid",
            transform: "rotate(45deg)",
            ...tailPos[tail],
          }}
        />
      </div>
    </div>
  )
}

function PosterPop({ store, qr, subtitle, bodyText, telFallback, companyName, contactText, showTel, qrLabel }: PosterProps) {
  return (
    <div
      style={{
        width: "210mm",
        height: "296mm",
        position: "relative",
        backgroundColor: "white",
        overflow: "hidden",
        fontFamily: FONT_SANS,
      }}
    >
      {/* 黄色のアクセント片 */}
      {[
        { x: 96, y: 8, w: 30, r: -12 },
        { x: 4, y: 120, w: 24, r: 50 },
        { x: 182, y: 128, w: 26, r: -40 },
        { x: 100, y: 262, w: 30, r: 10 },
      ].map((a, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${a.x}mm`,
            top: `${a.y}mm`,
            width: `${a.w}mm`,
            height: "6mm",
            backgroundColor: POP_YELLOW,
            transform: `rotate(${a.r}deg)`,
            borderRadius: "1mm",
          }}
        />
      ))}

      {/* キラキラ */}
      <Sparkle size={8} color={POP_YELLOW} style={{ left: "28mm", top: "56mm" }} />
      <Sparkle size={5} color={POP_BLUE} style={{ left: "176mm", top: "62mm" }} />
      <Sparkle size={7} color={POP_YELLOW} style={{ left: "186mm", top: "168mm" }} />
      <Sparkle size={5} color={POP_BLUE} style={{ left: "18mm", top: "176mm" }} />

      {/* 吹き出し */}
      <Bubble x={12} y={16} w={62} rotate={-3} tail="br" yellow>
        ご来店
        <br />
        ありがとうございます！
      </Bubble>
      {/* 吹き出しの上から覗く顔 */}
      <PeekingFace widthMm={21} style={{ left: "32mm", top: "5.5mm", transform: "rotate(-3deg)", zIndex: 2 }} />
      <Bubble x={140} y={22} w={56} rotate={2.5} tail="bl">
        回答は
        <br />
        約1分！
      </Bubble>
      <Bubble x={6} y={196} w={68} rotate={-2} tail="tr">
        よかった点も
        <br />
        気になった点も、ぜひ！
      </Bubble>
      <Bubble x={144} y={200} w={54} rotate={2} tail="tl" yellow>
        スタッフの
        <br />
        励みになります！
      </Bubble>

      {/* 中央タイトル */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "72mm",
          textAlign: "center",
          padding: "0 20mm",
        }}
      >
        <p style={{ fontSize: "5.5mm", fontWeight: 700, color: "#333", marginBottom: "6mm" }}>
          {companyName || store.title}
        </p>
        <p
          style={{
            fontSize: "15mm",
            fontWeight: 900,
            color: POP_BLUE,
            lineHeight: 1.3,
            marginBottom: "3mm",
          }}
        >
          <span
            style={{
              background: `linear-gradient(transparent 68%, ${POP_YELLOW} 68%)`,
              padding: "0 1mm",
            }}
          >
            <TitleSegments text={subtitle || "アンケート ご協力のお願い"} />
          </span>
        </p>
        <p
          style={{
            fontSize: "4.8mm",
            color: "#333",
            lineHeight: 1.9,
            whiteSpace: "pre-wrap",
            marginTop: "6mm",
          }}
        >
          {bodyText}
        </p>
      </div>

      {/* QR */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "170mm",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            backgroundColor: POP_BLUE,
            color: "white",
            fontWeight: 800,
            fontSize: "5.5mm",
            padding: "2.5mm 9mm",
            borderRadius: "10mm",
            marginBottom: "13mm",
          }}
        >
          {qrLabel}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div style={{ position: "relative", display: "inline-block" }}>
            {/* QRの上から覗く顔 */}
            <PeekingFace
              widthMm={24}
              style={{ left: "50%", top: "-12.8mm", transform: "translateX(-50%)", zIndex: 2 }}
            />
            <QrBox qr={qr} sizeMm={58} border={`1.1mm solid ${POP_BLUE}`} />
          </div>
        </div>
        <p style={{ fontSize: "4mm", color: "#555", marginTop: "4mm", fontWeight: 600 }}>
          スマートフォンのカメラで読み取ってください
        </p>
      </div>

      {/* フッター */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: POP_BLUE,
          color: "white",
          padding: "4.5mm 14mm",
          fontSize: "4mm",
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>お問い合わせ　{contactText || companyName || store.title}</span>
        {showTel && <span>TEL {store.primaryPhone || telFallback || "—"}</span>}
      </div>
    </div>
  )
}

/* ========================== ② ミニマル・ナチュラル ========================== */

const MIN_BG = "#e3f2f2"
const MIN_INK = "#3f5658"
const MIN_ACCENT = "#8fcfcf"

function CornerBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: "9mm",
    height: "9mm",
    borderColor: MIN_INK,
    borderStyle: "solid",
    borderWidth: 0,
  }
  const map: Record<string, React.CSSProperties> = {
    tl: { left: "-5mm", top: "-5mm", borderLeftWidth: "1mm", borderTopWidth: "1mm" },
    tr: { right: "-5mm", top: "-5mm", borderRightWidth: "1mm", borderTopWidth: "1mm" },
    bl: { left: "-5mm", bottom: "-5mm", borderLeftWidth: "1mm", borderBottomWidth: "1mm" },
    br: { right: "-5mm", bottom: "-5mm", borderRightWidth: "1mm", borderBottomWidth: "1mm" },
  }
  return <div style={{ ...base, ...map[pos] }} />
}

function PosterMinimal({ store, qr, subtitle, bodyText, telFallback, companyName, contactText, showTel, qrLabel }: PosterProps) {
  return (
    <div
      style={{
        width: "210mm",
        height: "296mm",
        backgroundColor: MIN_BG,
        padding: "9mm",
        fontFamily: FONT_ROUND,
        color: MIN_INK,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "white",
          borderRadius: "5mm",
          border: `0.4mm solid ${MIN_ACCENT}`,
          position: "relative",
          padding: "16mm 14mm",
          textAlign: "center",
        }}
      >
        {/* キラキラ */}
        <Sparkle size={6} color={MIN_ACCENT} style={{ left: "16mm", top: "42mm" }} />
        <Sparkle size={4.5} color={MIN_ACCENT} style={{ right: "18mm", top: "34mm" }} />

        {/* 店名 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5mm",
            fontSize: "4.5mm",
            fontWeight: 700,
            letterSpacing: "0.8mm",
          }}
        >
          <span style={{ display: "inline-block", width: "22mm", height: "0.4mm", backgroundColor: MIN_INK }} />
          {companyName || store.title}
          <span style={{ display: "inline-block", width: "22mm", height: "0.4mm", backgroundColor: MIN_INK }} />
        </div>

        {/* タイトル */}
        <p
          style={{
            fontSize: "13mm",
            fontWeight: 800,
            marginTop: "18mm",
            transform: "rotate(-1.5deg)",
            letterSpacing: "1mm",
          }}
        >
          <span style={{ fontSize: "6mm", verticalAlign: "middle", margin: "0 3mm" }}>・</span>
          <TitleSegments text={subtitle || "アンケート実施中"} />
          <span style={{ fontSize: "6mm", verticalAlign: "middle", margin: "0 3mm" }}>・</span>
        </p>
        <p style={{ fontSize: "5.5mm", fontWeight: 700, marginTop: "8mm", lineHeight: 1.8 }}>
          下のQRコードを
          <br />
          読み取ってください。
        </p>

        {/* QR + ブラケット */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: "16mm" }}>
          <div style={{ position: "relative" }}>
            <CornerBracket pos="tl" />
            <CornerBracket pos="tr" />
            <CornerBracket pos="bl" />
            <CornerBracket pos="br" />
            <QrBox qr={qr} sizeMm={60} />
            {/* ふきだし */}
            <div
              style={{
                position: "absolute",
                right: "-36mm",
                top: "-14mm",
                width: "27mm",
                height: "27mm",
                borderRadius: "50%",
                backgroundColor: MIN_ACCENT,
                color: "white",
                fontSize: "3.4mm",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1.6,
                padding: "3mm",
              }}
            >
              ご協力
              <br />
              ありがとう
              <br />
              ございます
            </div>
          </div>
        </div>
        <p style={{ fontSize: "3.8mm", marginTop: "6mm", color: "#7a9a9a" }}>{qrLabel}</p>

        {/* 区切り */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "3mm",
            marginTop: "14mm",
          }}
        >
          <span style={{ display: "inline-block", width: "34mm", height: "0.3mm", backgroundColor: MIN_ACCENT }} />
          <span
            style={{
              display: "inline-block",
              width: "2.4mm",
              height: "2.4mm",
              backgroundColor: MIN_ACCENT,
              transform: "rotate(45deg)",
            }}
          />
          <span style={{ display: "inline-block", width: "34mm", height: "0.3mm", backgroundColor: MIN_ACCENT }} />
        </div>

        {/* プレゼント */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            gap: "5mm",
            marginTop: "7mm",
          }}
        >
          <GiftBox size={10} color={MIN_ACCENT} />
          <GiftBox size={8} color="#c9dfa8" />
        </div>

        {/* 本文 */}
        <p
          style={{
            fontSize: "4.4mm",
            lineHeight: 2.1,
            marginTop: "5mm",
            whiteSpace: "pre-wrap",
            fontWeight: 600,
          }}
        >
          {bodyText}
        </p>

        {/* フッター */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "10mm",
            fontSize: "3.8mm",
            fontWeight: 700,
            letterSpacing: "0.4mm",
          }}
        >
          {contactText || companyName || store.title}
          {showTel && `　　TEL ${store.primaryPhone || telFallback || "—"}`}
        </div>
      </div>
    </div>
  )
}

/* ============================ ③ チェックリスト ============================ */

const CHK_BG = "#fbf3e9"
const CHK_ACCENT = "#e8833a"
const CHK_BOARD = "#d9a05b"

function CheckRow({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4mm",
        padding: "4.5mm 2mm",
        borderBottom: "0.3mm solid #f0e2d0",
      }}
    >
      <div
        style={{
          width: "6.5mm",
          height: "6.5mm",
          border: `0.6mm solid ${CHK_ACCENT}`,
          borderRadius: "1mm",
          position: "relative",
          flexShrink: 0,
          backgroundColor: "white",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "1.6mm",
            top: "0.4mm",
            width: "2.6mm",
            height: "4.4mm",
            borderRight: `0.8mm solid ${CHK_ACCENT}`,
            borderBottom: `0.8mm solid ${CHK_ACCENT}`,
            transform: "rotate(40deg)",
          }}
        />
      </div>
      <span style={{ fontSize: "5.2mm", fontWeight: 700, color: "#3a2e22" }}>{text}</span>
    </div>
  )
}

function PosterChecklist({
  store,
  qr,
  subtitle,
  bodyText,
  telFallback,
  companyName,
  contactText,
  showTel,
  qrLabel,
  checkItems,
}: PosterProps) {
  return (
    <div
      style={{
        width: "210mm",
        height: "296mm",
        backgroundColor: CHK_BG,
        position: "relative",
        fontFamily: FONT_SANS,
        overflow: "hidden",
      }}
    >
      {/* 指さし人物 */}
      <PointingPerson widthMm={30} style={{ right: "8mm", top: "30mm" }} />

      {/* ヘッダー */}
      <div style={{ textAlign: "center", paddingTop: "14mm" }}>
        <p style={{ fontSize: "5mm", color: "#6b5a46", fontWeight: 600 }}>
          {companyName || store.title} をご利用のみなさまへ
        </p>
        <p
          style={{
            fontSize: "11.5mm",
            fontWeight: 900,
            color: CHK_ACCENT,
            marginTop: "5mm",
            display: "inline-block",
            borderBottom: `1mm dotted ${CHK_ACCENT}`,
            paddingBottom: "2mm",
          }}
        >
          {subtitle || "アンケート ご協力のお願い"}
        </p>
        <p
          style={{
            fontSize: "4.4mm",
            color: "#5c4d3c",
            lineHeight: 1.9,
            marginTop: "5mm",
            whiteSpace: "pre-wrap",
            padding: "0 24mm",
          }}
        >
          {bodyText}
        </p>
      </div>

      {/* クリップボード */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "88mm",
          transform: "translateX(-50%)",
          width: "150mm",
        }}
      >
        {/* クリップ */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "-6mm",
            transform: "translateX(-50%)",
            width: "38mm",
            height: "11mm",
            background: "linear-gradient(180deg,#c9cdd2,#9aa0a8)",
            borderRadius: "2.5mm",
            zIndex: 2,
            border: "0.3mm solid #8a9097",
          }}
        />
        <div
          style={{
            backgroundColor: CHK_BOARD,
            borderRadius: "4mm",
            padding: "8mm 6mm 6mm",
            boxShadow: "0 1mm 3mm rgba(0,0,0,0.15)",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "1.5mm",
              padding: "7mm 8mm",
            }}
          >
            <div
              style={{
                border: `0.6mm solid ${CHK_ACCENT}`,
                color: CHK_ACCENT,
                fontWeight: 800,
                fontSize: "5.8mm",
                textAlign: "center",
                padding: "2.5mm",
                marginBottom: "3mm",
                backgroundColor: "#fdf3ec",
              }}
            >
              こんなことをお伺いします
            </div>
            {checkItems.slice(0, 4).map((t, i) => (
              <CheckRow key={i} text={t} />
            ))}
          </div>
        </div>
        {/* 鉛筆 */}
        <PencilIcon widthMm={34} style={{ right: "-9mm", bottom: "-5mm", transform: "rotate(32deg)", zIndex: 3 }} />
      </div>

      {/* QR行 */}
      <div
        style={{
          position: "absolute",
          left: "30mm",
          right: "30mm",
          bottom: "24mm",
          display: "flex",
          alignItems: "center",
          gap: "10mm",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              backgroundColor: CHK_ACCENT,
              color: "white",
              fontSize: "4.2mm",
              fontWeight: 700,
              padding: "1.8mm 5mm",
              borderRadius: "6mm",
              marginBottom: "3mm",
              display: "inline-block",
            }}
          >
            {qrLabel}
          </div>
          <QrBox qr={qr} sizeMm={46} border={`0.6mm solid ${CHK_ACCENT}`} />
        </div>
        <div style={{ fontSize: "4.6mm", color: "#5c4d3c", lineHeight: 2, fontWeight: 600 }}>
          回答は約1分で完了します。
          <br />
          スマートフォンのカメラで
          <br />
          QRコードを読み取ってください。
        </div>
      </div>

      {/* フッター */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: CHK_ACCENT,
          color: "white",
          padding: "4mm 14mm",
          fontSize: "4mm",
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>お問い合わせ　{contactText || companyName || store.title}</span>
        {showTel && <span>TEL {store.primaryPhone || telFallback || "—"}</span>}
      </div>
    </div>
  )
}

/* ============================== ④ しっかり案内 ============================== */

const INFO_BG = "#d8ece8"
const INFO_TEAL = "#2f8f85"
const INFO_DARK = "#1f4844"

function PosterInfo({ store, qr, subtitle, bodyText, telFallback, companyName, contactText, showTel, qrLabel }: PosterProps) {
  return (
    <div
      style={{
        width: "210mm",
        height: "296mm",
        backgroundColor: INFO_BG,
        position: "relative",
        fontFamily: FONT_SANS,
        color: INFO_DARK,
        overflow: "hidden",
      }}
    >
      <div style={{ textAlign: "center", paddingTop: "13mm" }}>
        <p style={{ fontSize: "6mm", fontWeight: 800, color: INFO_TEAL }}>
          ＼ みなさまの声をお聞かせください！ ／
        </p>
        <p style={{ fontSize: "4.6mm", fontWeight: 600, marginTop: "3mm" }}>
          {companyName || store.title} をご利用のみなさまへ
        </p>
      </div>

      {/* タイトル帯 */}
      <div
        style={{
          margin: "8mm 16mm 0",
          backgroundColor: "white",
          borderTop: `1mm solid ${INFO_TEAL}`,
          borderBottom: `1mm solid ${INFO_TEAL}`,
          padding: "8mm 6mm",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "13mm", fontWeight: 900, color: INFO_TEAL, lineHeight: 1.35 }}>
          {subtitle || "アンケート ご協力のお願い"}
        </p>
      </div>

      {/* 人々のイラスト（柏市チラシ風） */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: "3.5mm",
          marginTop: "6mm",
        }}
      >
        <PersonBust variant="bob" skin="#f7d9c4" hair="#6e4b38" shirt="#e8a04b" widthMm={17} />
        <PersonBust variant="short" skin="#f2c9ac" hair="#2f2a28" shirt="#4a6fa5" widthMm={19} />
        <PersonBust variant="long" skin="#f7d9c4" hair="#453a34" shirt="#b56576" widthMm={18} />
        <PersonBust variant="glasses" skin="#f2c9ac" hair="#8d939c" shirt="#5b8c5a" widthMm={19} />
        <PersonBust variant="bun" skin="#f7d9c4" hair="#5a4632" shirt={INFO_TEAL} widthMm={17} />
        <PersonBust variant="short" skin="#f7d9c4" hair="#6e4b38" shirt="#d9a545" widthMm={18} />
      </div>

      <p
        style={{
          textAlign: "center",
          fontSize: "4.4mm",
          lineHeight: 1.9,
          marginTop: "5mm",
          whiteSpace: "pre-wrap",
          padding: "0 24mm",
          fontWeight: 600,
        }}
      >
        {bodyText}
      </p>

      {/* ご回答に当たって */}
      <div
        style={{
          margin: "8mm 22mm 0",
          backgroundColor: "white",
          border: `0.5mm dashed ${INFO_TEAL}`,
          borderRadius: "2mm",
          padding: "6mm 9mm",
        }}
      >
        <p
          style={{
            textAlign: "center",
            fontSize: "5.4mm",
            fontWeight: 800,
            color: INFO_TEAL,
            marginBottom: "3.5mm",
          }}
        >
          ー ご回答に当たって ー
        </p>
        <ul style={{ fontSize: "4.1mm", lineHeight: 2.1, fontWeight: 500 }}>
          {/* QRの遷移先で文が壊れないよう、遷移先名を文中に差し込まない */}
          <li>・スマートフォン、タブレットなどから下記のQRコードを読み取ってください。</li>
          <li>・所要時間は1〜2分です。</li>
          <li>・いただいたご回答は、サービス向上の目的にのみ利用いたします。</li>
        </ul>
      </div>

      {/* 回答先 */}
      <div
        style={{
          position: "absolute",
          left: "22mm",
          right: "22mm",
          bottom: "26mm",
          backgroundColor: "white",
          borderRadius: "2mm",
          padding: "6mm 8mm",
          display: "flex",
          alignItems: "center",
          gap: "8mm",
        }}
      >
        <div
          style={{
            backgroundColor: INFO_DARK,
            color: "white",
            fontSize: "4.6mm",
            fontWeight: 800,
            padding: "3mm 5mm",
            borderRadius: "1.5mm",
            writingMode: "horizontal-tb",
            whiteSpace: "nowrap",
          }}
        >
          {qrLabel}
        </div>
        <QrBox qr={qr} sizeMm={40} border={`0.5mm solid ${INFO_TEAL}`} />
        <div style={{ fontSize: "4mm", lineHeight: 1.9, fontWeight: 600, flex: 1, minWidth: 0 }}>
          左のQRコードを読み取り、アクセスしてください。所要時間は1〜2分です。
        </div>
      </div>

      {/* フッター */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: INFO_TEAL,
          color: "white",
          padding: "4mm 14mm",
          fontSize: "4mm",
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>お問い合わせ　{contactText || companyName || store.title}</span>
        {showTel && <span>TEL {store.primaryPhone || telFallback || "—"}</span>}
      </div>
    </div>
  )
}

/* ==================== Googleクチコミ専用デザイン（3種） ====================
 *
 * アンケートを挟まず、Googleのクチコミ投稿画面へ直接飛ばすためのポップ。
 * クチコミの「例文」は載せない。実際には投稿されていない感想を掲示物に印刷すると
 * 作り物のクチコミを見せていると受け取られかねないため、書き方の案内にとどめる。
 */

const G_BLUE = "#4285f4"
const G_RED = "#ea4335"
const G_YELLOW = "#fbbc05"
const G_GREEN = "#34a853"
const G_STRIPE = [G_BLUE, G_RED, G_YELLOW, G_BLUE, G_GREEN, G_RED]
const G_INK = "#1f2430"
const STAR_PATH =
  "M12 2 L14.47 8.6 L21.51 8.91 L15.99 13.3 L17.88 20.09 L12 16.2 L6.12 20.09 L8.01 13.3 L2.49 8.91 L9.53 8.6 Z"

/** Googleカラーの帯 */
function GoogleStripe({ heightMm, style }: { heightMm: number; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", width: "100%", height: `${heightMm}mm`, ...style }}>
      {G_STRIPE.map((c, i) => (
        <div key={i} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </div>
  )
}

/** 星を横並びで表示 */
function StarRow({
  sizeMm,
  gapMm = 1.5,
  filled = 5,
  color = G_YELLOW,
  emptyColor = "#d7dbe2",
  style,
}: {
  sizeMm: number
  gapMm?: number
  filled?: number
  color?: string
  emptyColor?: string
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: "flex", gap: `${gapMm}mm`, ...style }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm`, display: "block" }}
        >
          <path d={STAR_PATH} fill={i < filled ? color : emptyColor} />
        </svg>
      ))}
    </div>
  )
}

/** スマホに星が並んだ線画（投稿ステップ用） */
function PhoneStarsIcon({
  widthMm,
  color,
  style,
}: {
  widthMm: number
  color: string
  style?: React.CSSProperties
}) {
  return (
    <svg viewBox="0 0 100 100" style={{ width: `${widthMm}mm`, height: `${widthMm}mm`, ...style }}>
      <rect x="26" y="5" width="48" height="90" rx="9" fill="white" stroke={color} strokeWidth="4" />
      <path d="M42 13 h16" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      <rect x="33" y="26" width="34" height="6" rx="3" fill="#dfe3ea" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          transform={`translate(${32 + i * 7.6} 40) scale(0.31)`}
          d={STAR_PATH}
          fill={G_YELLOW}
        />
      ))}
      <rect x="33" y="56" width="34" height="4.5" rx="2.2" fill="#e6e9ef" />
      <rect x="33" y="64" width="26" height="4.5" rx="2.2" fill="#e6e9ef" />
      <rect x="33" y="76" width="34" height="9" rx="4.5" fill={G_BLUE} />
    </svg>
  )
}

/** 地図ピン＋星（クチコミの見出し用） */
function PinStarIcon({ widthMm, style }: { widthMm: number; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: `${widthMm}mm`, height: `${widthMm}mm`, ...style }}
    >
      <path
        d="M50 8 q20 0 20 21 q0 17 -20 40 q-20 -23 -20 -40 q0 -21 20 -21 z"
        fill={G_RED}
      />
      <circle cx="50" cy="29" r="8.5" fill="white" />
      <path transform="translate(60 56) scale(1.5)" d={STAR_PATH} fill={G_YELLOW} />
      <path transform="translate(20 60) scale(1.1)" d={STAR_PATH} fill={G_YELLOW} />
    </svg>
  )
}

/** ステップ番号の丸 */
function StepNumber({
  n,
  color,
  sizeMm,
  textColor = "white",
}: {
  n: number
  color: string
  sizeMm: number
  textColor?: string
}) {
  return (
    <div
      style={{
        width: `${sizeMm}mm`,
        height: `${sizeMm}mm`,
        borderRadius: "50%",
        backgroundColor: color,
        color: textColor,
        fontSize: `${sizeMm * 0.58}mm`,
        fontWeight: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {n}
    </div>
  )
}

/** 書き方の案内（クチコミ例文ではない） */
const G_TIPS: { text: string; variant: "short" | "bob" | "glasses"; hair: string; shirt: string }[] =
  [
    { text: "星を選ぶだけでも投稿できます", variant: "short", hair: "#2f2a28", shirt: G_BLUE },
    { text: "よかった点をひとことでOKです", variant: "bob", hair: "#6e4b38", shirt: G_GREEN },
    { text: "お写真の投稿も歓迎しています", variant: "glasses", hair: "#8d939c", shirt: G_RED },
  ]

/* ---------------------- ⑤ クチコミ専用・ポップ ---------------------- */

function PosterGooglePop({
  store,
  qr,
  subtitle,
  bodyText,
  telFallback,
  companyName,
  contactText,
  showTel,
}: PosterProps) {
  return (
    <div
      style={{
        width: "210mm",
        height: "296mm",
        position: "relative",
        backgroundColor: "white",
        overflow: "hidden",
        fontFamily: FONT_SANS,
        color: G_INK,
        backgroundImage: "radial-gradient(#dfe4ec 0.5mm, transparent 0.5mm)",
        backgroundSize: "7mm 7mm",
      }}
    >
      <GoogleStripe heightMm={7} style={{ position: "absolute", left: 0, top: 0 }} />
      <GoogleStripe heightMm={7} style={{ position: "absolute", left: 0, bottom: 0 }} />

      <PinStarIcon widthMm={30} style={{ position: "absolute", right: "10mm", top: "12mm" }} />

      <p
        style={{
          position: "absolute",
          left: "14mm",
          top: "14mm",
          fontSize: "4.6mm",
          fontWeight: 700,
          color: "#5a6270",
        }}
      >
        {companyName || store.title}
      </p>

      {/* タイトル */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "38mm",
          textAlign: "center",
          padding: "0 12mm",
          fontSize: "15.5mm",
          fontWeight: 900,
          lineHeight: 1.32,
        }}
      >
        <TitleSegments text={subtitle || SUBTITLE_DEFAULT.google} />
      </div>

      <p
        style={{
          position: "absolute",
          left: "20mm",
          right: "20mm",
          top: "86mm",
          textAlign: "center",
          fontSize: "4.3mm",
          lineHeight: 1.85,
          fontWeight: 600,
          color: "#3d4450",
          whiteSpace: "pre-wrap",
        }}
      >
        {bodyText}
      </p>

      {/* QR ＋ 2ステップ */}
      <div style={{ position: "absolute", left: "14mm", top: "112mm" }}>
        <div
          style={{
            width: "68mm",
            backgroundColor: "white",
            border: `0.8mm solid ${G_INK}`,
            borderRadius: "3mm",
            padding: "4mm",
            textAlign: "center",
          }}
        >
          <QrBox qr={qr} sizeMm={60} />
          <p style={{ fontSize: "3.6mm", fontWeight: 800, marginTop: "1mm" }}>
            Googleクチコミ投稿ページ
          </p>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "88mm",
          right: "14mm",
          top: "116mm",
          backgroundColor: "#fdf6d8",
          border: `0.7mm solid ${G_INK}`,
          borderRadius: "4mm",
          padding: "10mm 6mm 6mm",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "-5mm",
            transform: "translateX(-50%)",
            backgroundColor: "white",
            border: `0.7mm solid ${G_INK}`,
            borderRadius: "5mm",
            padding: "1.6mm 6mm",
            fontSize: "4.4mm",
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          かんたん2ステップ！
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <PhoneQrIcon widthMm={26} color={G_INK} style={{ margin: "0 auto" }} />
            <p style={{ fontSize: "3.5mm", fontWeight: 800, marginTop: "2mm" }}>
              ①QRコードを読み取る
            </p>
          </div>
          <svg viewBox="0 0 40 24" style={{ width: "14mm", height: "8.4mm", flexShrink: 0 }}>
            <path
              d="M2 12 h26"
              stroke={G_RED}
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <path d="M26 4 L38 12 L26 20 Z" fill={G_RED} />
          </svg>
          <div style={{ textAlign: "center", flex: 1 }}>
            <PhoneStarsIcon widthMm={26} color={G_INK} style={{ margin: "0 auto" }} />
            <p style={{ fontSize: "3.5mm", fontWeight: 800, marginTop: "2mm" }}>
              ②星を選んで投稿
            </p>
          </div>
        </div>
      </div>

      {/* 書き方の案内（吹き出し） */}
      <div
        style={{
          position: "absolute",
          left: "14mm",
          right: "14mm",
          top: "190mm",
          display: "flex",
          flexDirection: "column",
          gap: "5mm",
        }}
      >
        {G_TIPS.map((t, i) => (
          <div
            key={t.text}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4mm",
              flexDirection: i % 2 === 1 ? "row-reverse" : "row",
            }}
          >
            <PersonBust
              variant={t.variant}
              skin="#f7d9c4"
              hair={t.hair}
              shirt={t.shirt}
              widthMm={19}
            />
            <div
              style={{
                flex: 1,
                border: `0.7mm solid ${G_INK}`,
                borderRadius: "4mm",
                backgroundColor: "white",
                padding: "4mm 6mm",
                display: "flex",
                alignItems: "center",
                gap: "4mm",
              }}
            >
              <StarRow sizeMm={5.4} gapMm={1} />
              <span style={{ fontSize: "5mm", fontWeight: 800, letterSpacing: "0.2mm" }}>
                {t.text}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: "14mm",
          right: "14mm",
          bottom: "11mm",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "3.6mm",
          fontWeight: 600,
          color: "#5a6270",
        }}
      >
        <span>お問い合わせ　{contactText || companyName || store.title}</span>
        {showTel && <span>TEL {store.primaryPhone || telFallback || "—"}</span>}
      </div>
    </div>
  )
}

/* ---------------------- ⑥ クチコミ専用・星 ---------------------- */

function PosterGoogleStar({
  store,
  qr,
  subtitle,
  bodyText,
  telFallback,
  companyName,
  contactText,
  showTel,
}: PosterProps) {
  const steps = [
    { n: 1, color: G_BLUE, title: "QRコードを読み取る", desc: "スマホのカメラをかざすだけ" },
    { n: 2, color: G_YELLOW, title: "星の数を選ぶ", desc: "5段階で評価をお選びください" },
    { n: 3, color: G_GREEN, title: "ひとこと添えて投稿", desc: "空欄のままでも投稿できます" },
  ]
  return (
    <div
      style={{
        width: "210mm",
        height: "296mm",
        position: "relative",
        backgroundColor: "white",
        overflow: "hidden",
        fontFamily: FONT_SANS,
        color: G_INK,
      }}
    >
      <GoogleStripe heightMm={4} style={{ position: "absolute", left: 0, top: 0 }} />
      <GoogleStripe heightMm={4} style={{ position: "absolute", left: 0, bottom: 0 }} />

      <p
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "18mm",
          textAlign: "center",
          fontSize: "4.8mm",
          fontWeight: 700,
          color: "#5a6270",
        }}
      >
        {companyName || store.title}
      </p>

      <StarRow
        sizeMm={24}
        gapMm={3}
        style={{ position: "absolute", left: "50%", top: "30mm", transform: "translateX(-50%)" }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "64mm",
          textAlign: "center",
          padding: "0 14mm",
          fontSize: "14mm",
          fontWeight: 900,
          lineHeight: 1.34,
        }}
      >
        <TitleSegments text={subtitle || SUBTITLE_DEFAULT.google} />
      </div>

      <p
        style={{
          position: "absolute",
          left: "24mm",
          right: "24mm",
          top: "106mm",
          textAlign: "center",
          fontSize: "4.2mm",
          lineHeight: 1.9,
          fontWeight: 600,
          color: "#3d4450",
          whiteSpace: "pre-wrap",
        }}
      >
        {bodyText}
      </p>

      {/* QR */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "132mm",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            border: "0.6mm solid #d7dbe2",
            borderRadius: "4mm",
            padding: "5mm",
            backgroundColor: "white",
          }}
        >
          <QrBox qr={qr} sizeMm={64} />
        </div>
        <p style={{ fontSize: "4.2mm", fontWeight: 800, marginTop: "3mm" }}>
          Googleのクチコミ投稿ページが開きます
        </p>
      </div>

      {/* 3ステップ */}
      <div
        style={{
          position: "absolute",
          left: "14mm",
          right: "14mm",
          top: "222mm",
          display: "flex",
          gap: "4mm",
        }}
      >
        {steps.map((s) => (
          <div
            key={s.n}
            style={{
              flex: 1,
              border: "0.5mm solid #e1e5ec",
              borderRadius: "3mm",
              padding: "5mm 4mm",
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "2.5mm" }}>
              <StepNumber n={s.n} color={s.color} sizeMm={9} />
            </div>
            <p style={{ fontSize: "4mm", fontWeight: 800, lineHeight: 1.4 }}>{s.title}</p>
            <p
              style={{
                fontSize: "3.2mm",
                lineHeight: 1.6,
                color: "#5a6270",
                marginTop: "1.5mm",
              }}
            >
              {s.desc}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: "14mm",
          right: "14mm",
          bottom: "10mm",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "3.6mm",
          fontWeight: 600,
          color: "#5a6270",
        }}
      >
        <span>お問い合わせ　{contactText || companyName || store.title}</span>
        {showTel && <span>TEL {store.primaryPhone || telFallback || "—"}</span>}
      </div>
    </div>
  )
}

/* ---------------------- ⑦ クチコミ専用・シック ---------------------- */

const CHIC_BG = "#16233a"
const CHIC_GOLD = "#d9b370"

function PosterGoogleChic({
  store,
  qr,
  subtitle,
  bodyText,
  telFallback,
  companyName,
  contactText,
  showTel,
}: PosterProps) {
  const steps = [
    "スマートフォンのカメラでQRコードを読み取ってください",
    "Googleのクチコミ投稿画面が開きます（アプリ不要）",
    "星の数をお選びいただき、ひとことお寄せください",
  ]
  return (
    <div
      style={{
        width: "210mm",
        height: "296mm",
        position: "relative",
        backgroundColor: CHIC_BG,
        overflow: "hidden",
        fontFamily: FONT_SANS,
        color: "white",
      }}
    >
      {/* 細い金の枠 */}
      <div
        style={{
          position: "absolute",
          left: "8mm",
          top: "8mm",
          right: "8mm",
          bottom: "8mm",
          border: `0.4mm solid ${CHIC_GOLD}`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "22mm",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", gap: "2mm", marginBottom: "5mm" }}>
          {[G_BLUE, G_RED, G_YELLOW, G_GREEN].map((c) => (
            <span
              key={c}
              style={{
                width: "3mm",
                height: "3mm",
                borderRadius: "50%",
                backgroundColor: c,
                display: "inline-block",
              }}
            />
          ))}
        </div>
        <p
          style={{
            fontSize: "4mm",
            letterSpacing: "1.5mm",
            fontWeight: 700,
            color: CHIC_GOLD,
          }}
        >
          GOOGLE クチコミ
        </p>
        <p style={{ fontSize: "5mm", fontWeight: 700, marginTop: "6mm" }}>
          {companyName || store.title}
        </p>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "62mm",
          textAlign: "center",
          padding: "0 18mm",
          fontSize: "13mm",
          fontWeight: 900,
          lineHeight: 1.4,
        }}
      >
        <TitleSegments text={subtitle || SUBTITLE_DEFAULT.google} />
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "104mm",
          transform: "translateX(-50%)",
        }}
      >
        <StarRow sizeMm={11} gapMm={2.5} color={CHIC_GOLD} />
      </div>

      <p
        style={{
          position: "absolute",
          left: "26mm",
          right: "26mm",
          top: "122mm",
          textAlign: "center",
          fontSize: "4.2mm",
          lineHeight: 2,
          color: "#d5dae4",
          whiteSpace: "pre-wrap",
        }}
      >
        {bodyText}
      </p>

      {/* QR（白カード） */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "152mm",
          transform: "translateX(-50%)",
          backgroundColor: "white",
          borderRadius: "3mm",
          padding: "6mm",
          textAlign: "center",
        }}
      >
        <QrBox qr={qr} sizeMm={58} />
        <p style={{ fontSize: "3.6mm", fontWeight: 800, color: G_INK, marginTop: "2mm" }}>
          クチコミ投稿ページ
        </p>
      </div>

      {/* 手順 */}
      <div
        style={{
          position: "absolute",
          left: "26mm",
          right: "26mm",
          top: "232mm",
          display: "flex",
          flexDirection: "column",
          gap: "3.5mm",
        }}
      >
        {steps.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
            <StepNumber n={i + 1} color={CHIC_GOLD} sizeMm={7.5} textColor={CHIC_BG} />
            <span style={{ fontSize: "3.9mm", lineHeight: 1.6, color: "#e7ebf2" }}>{s}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: "18mm",
          right: "18mm",
          bottom: "14mm",
          borderTop: `0.3mm solid ${CHIC_GOLD}`,
          paddingTop: "3mm",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "3.5mm",
          color: "#c9d1de",
        }}
      >
        <span>お問い合わせ　{contactText || companyName || store.title}</span>
        {showTel && <span>TEL {store.primaryPhone || telFallback || "—"}</span>}
      </div>
    </div>
  )
}

/* ============================== ページ本体 ============================== */

export default function DistributePage() {
  const [tab, setTab] = useState<"poster" | "card">("poster")

  // 共通設定
  const [stores, setStores] = useState<StoreRow[]>([])
  const [surveys, setSurveys] = useState<SurveyOption[]>([])
  const [storeMode, setStoreMode] = useState<"all" | "select">("select")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [storeSearch, setStoreSearch] = useState("")
  const [qrTarget, setQrTarget] = useState<"survey" | "google">("survey")
  const [surveyId, setSurveyId] = useState<number | null>(null)

  // ポスター設定
  const [design, setDesign] = useState<PosterDesignKey>("pop")
  const [size, setSize] = useState<"A4" | "B5">("A4")
  const [textType, setTextType] = useState<"simple" | "detailed">("simple")
  const [subtitle, setSubtitle] = useState<string>(SUBTITLE_DEFAULT.survey)
  /** サブタイトルを手で直したか（直していなければQRの遷移先に応じて初期値を入れ替える） */
  const [subtitleEdited, setSubtitleEdited] = useState(false)
  const [body, setBody] = useState("")
  const [telFallback, setTelFallback] = useState("")
  /** ポスターに載せる会社名（初期値はGBPの登録名。手で直したときだけ上書きとして使う） */
  const [companyName, setCompanyName] = useState("")
  const [companyNameEdited, setCompanyNameEdited] = useState(false)
  /** お問い合わせ先の表記（空なら店舗名をそのまま使う） */
  const [contactText, setContactText] = useState("")
  /** フッターに電話番号を載せるか */
  const [showTel, setShowTel] = useState(true)

  // 名刺設定
  const [cardColor, setCardColor] = useState(CARD_COLORS[0])
  const [cardTitle, setCardTitle] = useState("アンケートご協力のお願い")
  const [cardBody, setCardBody] = useState(
    "ご来店いただきありがとうございます。QRコードからアンケートにご協力ください。"
  )

  const [qrMap, setQrMap] = useState<Map<string, string>>(new Map())
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/stores?status=active&scope=operational&limit=2000")
      .then((r) => r.json())
      .then((j) =>
        setStores(
          (j.stores ?? []).map((s: StoreRow) => ({
            locationName: s.locationName,
            title: s.title,
            primaryPhone: s.primaryPhone,
            placeId: s.placeId,
            newReviewUri: s.newReviewUri,
          }))
        )
      )
      .catch(() => {})
    fetch("/api/surveys")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.surveys ?? [])
          .filter((s: { status: string }) => s.status === "active")
          .map(
            (s: {
              id: number
              token: string
              name: string
              questions: { title: string }[]
              targetStores?: string[] | null
            }) => ({
              id: s.id,
              token: s.token,
              name: s.name,
              questions: s.questions ?? [],
              targetStores: s.targetStores ?? null,
            })
          )
        setSurveys(list)
        if (list.length > 0) setSurveyId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const targetStores = useMemo(
    () =>
      storeMode === "all"
        ? stores
        : stores.filter((s) => selected.has(s.locationName)),
    [storeMode, stores, selected]
  )

  /**
   * アンケートQRの場合、選んだ店舗がそのアンケートの対象になっているかを確認する。
   * 対象外の店舗のQRを配ると、読み取っても別の店舗名が表示され、回答も保存できない。
   */
  const currentSurvey = surveys.find((sv) => sv.id === surveyId) ?? null
  const outOfScopeStores = useMemo(() => {
    if (qrTarget !== "survey" || !currentSurvey) return []
    const target = currentSurvey.targetStores
    // 対象店舗が未設定のアンケートは全店舗を受け付ける
    if (!target || target.length === 0) return []
    return targetStores.filter((st) => !target.includes(st.locationName))
  }, [qrTarget, currentSurvey, targetStores])

  /**
   * 会社名欄の初期値。店舗を1つだけ選んでいるときは、その店舗のGBP登録名を入れる。
   * 複数店舗のときは空欄（各店舗の登録名がそのまま入る）。
   */
  const gbpDefaultName = targetStores.length === 1 ? targetStores[0].title : ""
  useEffect(() => {
    if (!companyNameEdited) setCompanyName(gbpDefaultName)
  }, [gbpDefaultName, companyNameEdited])

  /** QRの遷移先を変えたら、手を加えていないサブタイトルは既定文に入れ替える */
  useEffect(() => {
    if (!subtitleEdited) setSubtitle(SUBTITLE_DEFAULT[qrTarget])
  }, [qrTarget, subtitleEdited])

  /** クチコミ専用デザインを選んだままアンケートQRに戻したときは、共通デザインに戻す */
  useEffect(() => {
    if (POSTER_DESIGNS[design].target !== "both" && POSTER_DESIGNS[design].target !== qrTarget) {
      setDesign("pop")
    }
  }, [qrTarget, design])

  /**
   * Googleクチコミへ飛ばす場合、クチコミ投稿用のリンクが未登録の店舗は
   * Googleマップの検索結果に飛んでしまう（投稿画面が直接開かない）。
   */
  const noReviewLinkStores = useMemo(
    () =>
      qrTarget === "google"
        ? targetStores.filter((st) => !st.newReviewUri && !st.placeId)
        : [],
    [qrTarget, targetStores]
  )

  /** 対象外の店舗を、このアンケートの対象に追加する */
  const [addingScope, setAddingScope] = useState(false)
  const addOutOfScopeToSurvey = async () => {
    if (!currentSurvey || outOfScopeStores.length === 0) return
    setAddingScope(true)
    setError(null)
    try {
      const merged = [
        ...(currentSurvey.targetStores ?? []),
        ...outOfScopeStores.map((st) => st.locationName),
      ]
      const res = await fetch(`/api/surveys?id=${currentSurvey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStores: merged }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || "対象店舗の追加に失敗しました")
      setSurveys((prev) =>
        prev.map((sv) =>
          sv.id === currentSurvey.id ? { ...sv, targetStores: merged } : sv
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAddingScope(false)
    }
  }

  const qrUrlFor = (store: StoreRow): string | null => {
    if (qrTarget === "google") return googleReviewUrl(store)
    const survey = surveys.find((s) => s.id === surveyId)
    if (!survey) return null
    return `${window.location.origin}/s/${survey.token}?store=${locationIdOf(store.locationName)}`
  }

  /** 対象店舗全部のQRを生成してから印刷ダイアログを開く */
  const printAll = async () => {
    setError(null)
    if (targetStores.length === 0) {
      setError("店舗を選択してください")
      return
    }
    if (qrTarget === "survey" && !surveyId) {
      setError("対象アンケートを選択してください（まず「アンケート一覧」から作成）")
      return
    }
    if (outOfScopeStores.length > 0) {
      setError(
        `選択した店舗のうち${outOfScopeStores.length}店舗が、このアンケートの対象になっていません。` +
          `このまま出力するとQRを読み取っても別の店舗名が表示され、回答も保存できません。` +
          `上の警告から対象に追加してください。`
      )
      return
    }
    setPreparing(true)
    try {
      const map = new Map<string, string>()
      for (const store of targetStores) {
        const url = qrUrlFor(store)
        if (!url) continue
        map.set(store.locationName, await QRCode.toDataURL(url, { width: 400, margin: 1 }))
      }
      setQrMap(map)
      setTimeout(() => {
        window.print()
        setPreparing(false)
      }, 500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPreparing(false)
    }
  }

  // プレビュー用: 先頭店舗のQR（未選択時は見本店舗でプレビュー表示）
  const PLACEHOLDER_STORE: StoreRow = {
    locationName: "__placeholder__",
    title: "こちらに各店舗名が記載されます",
    primaryPhone: "00-0000-0000",
    placeId: null,
    newReviewUri: null,
  }
  const [previewQr, setPreviewQr] = useState<string | null>(null)
  const selectedPreviewStore = targetStores[0] ?? null
  const previewStore = selectedPreviewStore ?? PLACEHOLDER_STORE
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!previewStore) {
        setPreviewQr(null)
        return
      }
      const url = qrUrlFor(previewStore)
      if (!url) {
        setPreviewQr(null)
        return
      }
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 })
      if (!cancelled) setPreviewQr(dataUrl)
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStore?.locationName, qrTarget, surveyId, surveys.length])

  const filteredStores = storeSearch
    ? stores.filter((s) =>
        normalizeSearchText(s.title).includes(normalizeSearchText(storeSearch))
      )
    : stores

  /** 定型文はQRの遷移先に合わせる（クチコミなのに「アンケートにご回答」とは書かない） */
  const defaultBody =
    qrTarget === "google"
      ? textType === "simple"
        ? GOOGLE_BODY_SIMPLE
        : GOOGLE_BODY_DETAILED
      : textType === "simple"
        ? BODY_SIMPLE
        : BODY_DETAILED
  const bodyText = body.trim() || defaultBody
  const qrLabel = qrTarget === "google" ? "クチコミ投稿はこちら" : "アンケート回答先"
  const checkItems = (() => {
    let items: string[] = []
    if (qrTarget === "survey") {
      const survey = surveys.find((s) => s.id === surveyId)
      items = (survey?.questions ?? []).map((q) => q.title).filter(Boolean)
    }
    // 3件未満ならデフォルト項目で補完（クリップボードが寂しくならないように）
    for (const d of DEFAULT_CHECK_ITEMS) {
      if (items.length >= 3) break
      if (!items.includes(d)) items.push(d)
    }
    return items
  })()

  /* -------- ポスター（デザイン切替 + B5はA4レイアウトを縮小） -------- */
  const Poster = ({ store, qr }: { store: StoreRow; qr: string | null }) => {
    const props: PosterProps = {
      store,
      qr,
      subtitle,
      bodyText,
      telFallback,
      // 手で直したときだけ上書きする（そのままなら各店舗のGBP登録名を使う）
      companyName: companyNameEdited ? companyName.trim() : "",
      contactText,
      showTel,
      qrLabel,
      checkItems,
    }
    const inner =
      design === "pop" ? (
        <PosterPop {...props} />
      ) : design === "minimal" ? (
        <PosterMinimal {...props} />
      ) : design === "checklist" ? (
        <PosterChecklist {...props} />
      ) : design === "gpop" ? (
        <PosterGooglePop {...props} />
      ) : design === "gstar" ? (
        <PosterGoogleStar {...props} />
      ) : design === "gchic" ? (
        <PosterGoogleChic {...props} />
      ) : (
        <PosterInfo {...props} />
      )
    return (
      <div
        className="poster-page"
        style={{
          width: size === "A4" ? "210mm" : "182mm",
          height: size === "A4" ? "296mm" : "256.5mm",
          overflow: "hidden",
          backgroundColor: "white",
        }}
      >
        <div
          style={{
            transform: size === "B5" ? "scale(0.8667)" : undefined,
            transformOrigin: "top left",
          }}
        >
          {inner}
        </div>
      </div>
    )
  }

  /* ------------------------------ 名刺（10面付け） ------------------------------ */
  const CardSheet = ({ store, qr }: { store: StoreRow; qr: string | null }) => (
    <div
      className="poster-page bg-white"
      style={{
        width: "210mm",
        height: "296mm",
        padding: "14mm",
        display: "grid",
        gridTemplateColumns: "91mm 91mm",
        gridAutoRows: "55mm",
        gap: "0",
        justifyContent: "center",
        alignContent: "start",
      }}
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: "91mm",
            height: "55mm",
            border: "0.2mm dashed #bbb",
            position: "relative",
            overflow: "hidden",
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: "-14mm",
              top: "-14mm",
              width: "42mm",
              height: "84mm",
              backgroundColor: cardColor,
              transform: "rotate(18deg)",
            }}
          />
          <div style={{ position: "relative", padding: "5mm", width: "62mm" }}>
            <p style={{ fontSize: "4.2mm", fontWeight: 800, marginBottom: "2.5mm" }}>
              {cardTitle}
            </p>
            <p style={{ fontSize: "2.8mm", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {cardBody}
            </p>
            <p style={{ fontSize: "2.6mm", marginTop: "2.5mm", color: "#555" }}>{store.title}</p>
          </div>
          <div
            style={{
              position: "absolute",
              right: "3.5mm",
              bottom: "3.5mm",
              width: "20mm",
              height: "20mm",
              backgroundColor: "white",
              padding: "1mm",
              borderRadius: "1mm",
            }}
          >
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR" style={{ width: "100%", height: "100%" }} />
            ) : (
              <div className="w-full h-full bg-gray-100" />
            )}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <style>{`
        .print-area { display: none; }
        .poster-page, .poster-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          @page { size: ${tab === "card" || size === "A4" ? "A4" : "B5"}; margin: 0; }
          aside, header, .no-print { display: none !important; }
          html, body { height: auto !important; overflow: visible !important; display: block !important; background: white !important; }
          body > div, main { overflow: visible !important; height: auto !important; display: block !important; }
          main { padding: 0 !important; }
          .print-area { display: block; margin: 0 !important; }
          .poster-page { page-break-after: always; break-inside: avoid; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="text-2xl font-bold">アンケート配布</h1>
        <p className="text-sm text-muted-foreground mt-1">
          店舗に掲示するQRコード付きポスター・名刺サイズカードを出力します。「PDF出力」を押すと印刷ダイアログが開くので「PDFとして保存」を選んでください。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2 no-print">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <div className="flex gap-6 no-print flex-wrap">
        {/* 設定 */}
        <Card className="p-5 space-y-5 flex-1 min-w-96">
          {/* タブ */}
          <div className="flex border-b">
            <button
              onClick={() => setTab("poster")}
              className={`px-5 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === "poster"
                  ? "border-[#4a90e2] text-[#4a90e2]"
                  : "border-transparent text-gray-500"
              }`}
            >
              パンフレット形式
            </button>
            <button
              onClick={() => setTab("card")}
              className={`px-5 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === "card"
                  ? "border-[#4a90e2] text-[#4a90e2]"
                  : "border-transparent text-gray-500"
              }`}
            >
              名刺形式
            </button>
          </div>

          {/* 店舗選択 */}
          <div>
            <p className="text-sm font-bold mb-2">店舗を選択</p>
            <div className="flex gap-6 mb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={storeMode === "all"}
                  onChange={() => setStoreMode("all")}
                />
                全店舗（{stores.length}件）
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={storeMode === "select"}
                  onChange={() => setStoreMode("select")}
                />
                店舗を選択
              </label>
            </div>
            {storeMode === "select" && (
              <div className="border rounded p-3">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    placeholder="店舗名で検索（あいまい検索対応）"
                    className="w-full h-9 pl-8 pr-3 text-sm border rounded"
                  />
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  選択中: {selected.size} 店舗（1店舗ごとに1ページ出力されます）
                </p>
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {filteredStores.map((s) => (
                    <label
                      key={s.locationName}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(s.locationName)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(s.locationName)
                            else next.delete(s.locationName)
                            return next
                          })
                        }}
                      />
                      {s.title}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* QRの中身 */}
          <div>
            <p className="text-sm font-bold mb-2">二次元バーコード</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={qrTarget === "survey"}
                  onChange={() => setQrTarget("survey")}
                />
                アンケート画面
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={qrTarget === "google"}
                  onChange={() => setQrTarget("google")}
                />
                Googleクチコミ画面
              </label>
            </div>
            {qrTarget === "survey" && (
              <div className="mt-2">
                <label className="block text-xs text-muted-foreground mb-1">
                  対象アンケート名
                </label>
                <select
                  value={surveyId ?? ""}
                  onChange={(e) => setSurveyId(Number(e.target.value))}
                  className="h-9 px-2 text-sm border rounded min-w-64"
                >
                  {surveys.length === 0 && <option value="">公開中のアンケートがありません</option>}
                  {surveys.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 選んだ店舗がアンケートの対象外だと、QRを読んでも別の店舗名が出て回答も保存できない */}
          {outOfScopeStores.length > 0 && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 p-3">
              <p className="text-sm text-red-800 font-bold">
                選択中の{outOfScopeStores.length}店舗は、このアンケートの対象になっていません
              </p>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                このまま出力すると、QRを読み取っても
                <b>「{currentSurvey?.targetStores?.length === 1 ? "別の店舗名" : "対象店舗名"}」</b>
                が表示され、回答も保存できません。
              </p>
              <ul className="text-xs text-red-700 mt-2 list-disc pl-5 space-y-0.5">
                {outOfScopeStores.slice(0, 8).map((st) => (
                  <li key={st.locationName}>{st.title}</li>
                ))}
                {outOfScopeStores.length > 8 && (
                  <li>ほか {outOfScopeStores.length - 8} 店舗</li>
                )}
              </ul>
              <button
                onClick={addOutOfScopeToSurvey}
                disabled={addingScope}
                className="mt-2 text-xs px-3 py-1.5 rounded bg-white border border-red-300 text-red-800 hover:bg-red-100 disabled:opacity-50"
              >
                {addingScope
                  ? "追加中…"
                  : `この${outOfScopeStores.length}店舗を「${currentSurvey?.name}」の対象に追加する`}
              </button>
            </div>
          )}

          {/* クチコミ投稿用リンクが無い店舗は、QRが投稿画面ではなく検索結果に飛ぶ */}
          {noReviewLinkStores.length > 0 && (
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm text-amber-900 font-bold">
                選択中の{noReviewLinkStores.length}
                店舗は、クチコミ投稿用のリンクが登録されていません
              </p>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                この店舗のQRは、クチコミの投稿画面ではなく
                <b>Googleマップの検索結果</b>
                に飛びます。店舗マスタの同期でプレイスIDが入ると、自動的に投稿画面へ直接飛ぶようになります。
              </p>
              <ul className="text-xs text-amber-800 mt-2 list-disc pl-5 space-y-0.5">
                {noReviewLinkStores.slice(0, 8).map((st) => (
                  <li key={st.locationName}>{st.title}</li>
                ))}
                {noReviewLinkStores.length > 8 && (
                  <li>ほか {noReviewLinkStores.length - 8} 店舗</li>
                )}
              </ul>
            </div>
          )}

          {tab === "poster" ? (
            <>
              <div>
                <p className="text-sm font-bold mb-2">デザイン選択</p>
                {qrTarget === "google" && (
                  <p className="text-xs text-gray-500 mb-2">
                    「クチコミ専用」はGoogleのクチコミ投稿だけに絞ったデザインです（アンケートの案内は入りません）。
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(POSTER_DESIGNS) as PosterDesignKey[])
                    .filter(
                      (k) =>
                        POSTER_DESIGNS[k].target === "both" ||
                        POSTER_DESIGNS[k].target === qrTarget
                    )
                    .map((k) => (
                      <label
                        key={k}
                        className={`flex items-center gap-2 text-sm cursor-pointer border rounded px-3 py-2 ${
                          design === k ? "border-[#4a90e2] bg-blue-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          checked={design === k}
                          onChange={() => setDesign(k)}
                        />
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ backgroundColor: POSTER_DESIGNS[k].swatch }}
                        />
                        {POSTER_DESIGNS[k].label}
                      </label>
                    ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold mb-2">サイズを選択</p>
                <div className="flex gap-6">
                  {(["A4", "B5"] as const).map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" checked={size === s} onChange={() => setSize(s)} />
                      {s}サイズ
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold mb-2">
                  {qrTarget === "google" ? "クチコミのご案内文タイプ" : "アンケートのご案内文タイプ"}
                </p>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={textType === "simple"}
                      onChange={() => setTextType("simple")}
                    />
                    簡潔タイプ（短めのご案内）
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={textType === "detailed"}
                      onChange={() => setTextType("detailed")}
                    />
                    しっかり説明タイプ（文章多め）
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  会社名（ポスターに載る表記）
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value)
                      setCompanyNameEdited(true)
                    }}
                    placeholder={
                      targetStores.length === 0
                        ? "店舗を選ぶとGBPの登録名が入ります"
                        : "各店舗のGBP登録名が入ります"
                    }
                    className="w-full h-10 px-3 text-sm border rounded"
                  />
                  {companyNameEdited && (
                    <button
                      type="button"
                      onClick={() => {
                        setCompanyNameEdited(false)
                        setCompanyName(gbpDefaultName)
                      }}
                      className="h-10 px-3 text-xs border rounded whitespace-nowrap hover:bg-gray-50"
                    >
                      登録名に戻す
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  初期値はGBP（Googleビジネスプロフィール）の登録名です。「本社」「◯◯グループ」など、掲示物用の表記に直したい場合はこちらを書き換えてください。
                </p>
                {companyNameEdited && companyName.trim() && targetStores.length > 1 && (
                  <p className="text-xs text-amber-700 mt-1">
                    この表記は出力する{targetStores.length}
                    店舗すべてに入ります。店舗ごとに名前を変えたい場合は、1店舗ずつ出力してください。
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  サブタイトル（最大文字数：全角20文字）
                </label>
                <input
                  type="text"
                  value={subtitle}
                  maxLength={20}
                  onChange={(e) => {
                    setSubtitle(e.target.value)
                    setSubtitleEdited(true)
                  }}
                  className="w-full h-10 px-3 text-sm border rounded"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ポスターの大見出しです。スペースで区切ると、その位置で改行されます。
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  本文（全角100文字以内、4行以内。空欄なら案内文タイプの定型文）
                </label>
                <textarea
                  value={body}
                  maxLength={100}
                  rows={4}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={defaultBody}
                  className="w-full px-3 py-2 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">お問い合わせ先の表記</label>
                <input
                  type="text"
                  value={contactText}
                  onChange={(e) => setContactText(e.target.value)}
                  placeholder="空欄の場合は上の会社名がそのまま入ります"
                  className="w-full h-10 px-3 text-sm border rounded"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ポスター下部の「お問い合わせ」欄に入る文字です。部署名や担当者名を入れる場合はこちらに入力してください。
                </p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-bold mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTel}
                    onChange={(e) => setShowTel(e.target.checked)}
                  />
                  電話番号を記載する
                </label>
                {showTel && (
                  <>
                    <input
                      type="text"
                      value={telFallback}
                      onChange={(e) => setTelFallback(e.target.value)}
                      placeholder="店舗に電話番号が未登録の場合に使用"
                      className="w-full h-10 px-3 text-sm border rounded max-w-60 mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      店舗に登録された電話番号が優先されます。空欄の店舗にはここの番号が入ります。
                    </p>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-bold mb-2">カラーを選択</p>
                <div className="flex gap-3">
                  {CARD_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCardColor(c)}
                      className={`w-8 h-8 rounded-full border-2 ${
                        cardColor === c ? "border-gray-800" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">タイトル名</label>
                <input
                  type="text"
                  value={cardTitle}
                  maxLength={20}
                  onChange={(e) => setCardTitle(e.target.value)}
                  className="w-full h-10 px-3 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  本文（70文字推奨、最大104文字）
                </label>
                <textarea
                  value={cardBody}
                  maxLength={104}
                  rows={3}
                  onChange={(e) => setCardBody(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  名刺サイズ（91×55mm）を1店舗につきA4に10面付けで出力します。
                </p>
              </div>
            </>
          )}

          <div className="pt-2">
            <Button onClick={printAll} disabled={preparing} className="min-w-44">
              {preparing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> QR生成中…
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" /> PDF出力（{targetStores.length}店舗分）
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* プレビュー */}
        <div className="w-[380px] shrink-0">
          <p className="text-xs text-muted-foreground mb-2">
            プレビュー
            {selectedPreviewStore
              ? `（${selectedPreviewStore.title}）`
              : "（見本 — 出力時は各店舗の名前・電話番号・QRが入ります）"}
          </p>
          <div className="border rounded-lg bg-gray-100 p-3 overflow-hidden">
            <div
              style={{
                transform: "scale(0.42)",
                transformOrigin: "top left",
                width: tab === "poster" ? (size === "A4" ? "210mm" : "182mm") : "210mm",
                height: "0",
                paddingBottom: tab === "poster" ? (size === "A4" ? "125mm" : "108mm") : "125mm",
              }}
            >
              {tab === "poster" ? (
                <Poster store={previewStore} qr={previewQr} />
              ) : (
                <CardSheet store={previewStore} qr={previewQr} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 印刷領域（全対象店舗分） */}
      <div className="print-area">
        {targetStores.map((store) =>
          tab === "poster" ? (
            <Poster
              key={store.locationName}
              store={store}
              qr={qrMap.get(store.locationName) ?? null}
            />
          ) : (
            <CardSheet
              key={store.locationName}
              store={store}
              qr={qrMap.get(store.locationName) ?? null}
            />
          )
        )}
      </div>
    </div>
  )
}
