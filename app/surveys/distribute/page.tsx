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
}

/** ポスターデザイン（参考デザイン準拠の4方向） */
const POSTER_DESIGNS = {
  pop: { label: "ポップ（吹き出し）", swatch: "#2b46c8" },
  minimal: { label: "ミニマル・ナチュラル", swatch: "#9fd4d4" },
  checklist: { label: "チェックリスト", swatch: "#e8833a" },
  info: { label: "しっかり案内", swatch: "#2f8f85" },
} as const
type PosterDesignKey = keyof typeof POSTER_DESIGNS

const CARD_COLORS = ["#e8833a", "#e35d6a", "#4a90e2", "#41a381", "#6b7280"]

const BODY_SIMPLE =
  "本日はご利用いただきありがとうございました！\nよろしければアンケートにご回答お願いいたします。"
const BODY_DETAILED =
  "本日はご利用いただき誠にありがとうございました。\nお客様の声をより良いサービスづくりに活かすため、アンケートを実施しております。\n1分ほどで完了しますので、ぜひご協力をお願いいたします。"

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

function PosterPop({ store, qr, subtitle, bodyText, telFallback, qrLabel }: PosterProps) {
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

      {/* 吹き出し */}
      <Bubble x={12} y={16} w={62} rotate={-3} tail="br" yellow>
        ご来店
        <br />
        ありがとうございます！
      </Bubble>
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
          {store.title}
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
            marginBottom: "5mm",
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
          <QrBox qr={qr} sizeMm={58} border={`1.1mm solid ${POP_BLUE}`} />
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
        <span>お問い合わせ　{store.title}</span>
        <span>TEL {store.primaryPhone || telFallback || "—"}</span>
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

function PosterMinimal({ store, qr, subtitle, bodyText, telFallback, qrLabel }: PosterProps) {
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
          {store.title}
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

        {/* 本文 */}
        <p
          style={{
            fontSize: "4.4mm",
            lineHeight: 2.1,
            marginTop: "8mm",
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
          {store.title}　　TEL {store.primaryPhone || telFallback || "—"}
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
      {/* ヘッダー */}
      <div style={{ textAlign: "center", paddingTop: "14mm" }}>
        <p style={{ fontSize: "5mm", color: "#6b5a46", fontWeight: 600 }}>
          {store.title} をご利用のみなさまへ
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
        <span>お問い合わせ　{store.title}</span>
        <span>TEL {store.primaryPhone || telFallback || "—"}</span>
      </div>
    </div>
  )
}

/* ============================== ④ しっかり案内 ============================== */

const INFO_BG = "#d8ece8"
const INFO_TEAL = "#2f8f85"
const INFO_DARK = "#1f4844"

function PosterInfo({ store, qr, subtitle, bodyText, telFallback, qrLabel }: PosterProps) {
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
          {store.title} をご利用のみなさまへ
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

      <p
        style={{
          textAlign: "center",
          fontSize: "4.4mm",
          lineHeight: 1.9,
          marginTop: "6mm",
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
          <li>
            ・スマートフォン、タブレットなどから下記の{qrLabel}
            にアクセスし、ご回答ください。
          </li>
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
        <span>お問い合わせ　{store.title}</span>
        <span>TEL {store.primaryPhone || telFallback || "—"}</span>
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
  const [subtitle, setSubtitle] = useState("アンケート ご協力のお願い")
  const [body, setBody] = useState("")
  const [telFallback, setTelFallback] = useState("")

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
    fetch("/api/stores?status=active&limit=2000")
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
            }) => ({
              id: s.id,
              token: s.token,
              name: s.name,
              questions: s.questions ?? [],
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

  const bodyText = body.trim() || (textType === "simple" ? BODY_SIMPLE : BODY_DETAILED)
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

          {tab === "poster" ? (
            <>
              <div>
                <p className="text-sm font-bold mb-2">デザイン選択</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(POSTER_DESIGNS) as PosterDesignKey[]).map((k) => (
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
                <p className="text-sm font-bold mb-2">アンケートのご案内文タイプ</p>
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
                  サブタイトル（最大文字数：全角16文字）
                </label>
                <input
                  type="text"
                  value={subtitle}
                  maxLength={16}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full h-10 px-3 text-sm border rounded"
                />
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
                  placeholder={textType === "simple" ? BODY_SIMPLE : BODY_DETAILED}
                  className="w-full px-3 py-2 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  お問い合わせTEL（店舗に電話番号が未登録の場合に使用）
                </label>
                <input
                  type="text"
                  value={telFallback}
                  onChange={(e) => setTelFallback(e.target.value)}
                  className="w-full h-10 px-3 text-sm border rounded max-w-60"
                />
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
