"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { resizeImageForGbp } from "@/lib/image-resize"
import "@/components/reports/photo-intake.css"

/**
 * お客様用の写真受付ページ（ログイン不要・URLが鍵）。
 * スマホで写真を選んで送ると、その店舗の画像アーカイブに入る。Google には何も送らない。
 */

type Status = "wait" | "convert" | "send" | "done" | "error"
interface Item {
  id: string
  file: File
  preview: string
  previewFailed: boolean
  status: Status
  error?: string
}

/** 1回に選べる枚数（多すぎると途中で通信が切れやすいので、続きは「続けて送る」で） */
const MAX_PER_BATCH = 30

const STATUS_LABEL: Record<Status, string> = {
  wait: "これから送ります",
  convert: "形式を変換しています",
  send: "送っています",
  done: "受け取りました",
  error: "送れませんでした",
}

const HINTS = [
  "現場や作業の様子（手元や後ろ姿でも十分です）",
  "車両・設備・商品などの実物",
  "季節の行事や、社内のできごと",
  "お客様に喜ばれた、仕事の仕上がり",
]

export default function PhotoIntakePage() {
  const params = useParams<{ token: string }>()
  const [storeTitle, setStoreTitle] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [senderName, setSenderName] = useState("")
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /** この画面を開いてから受け取った合計 */
  const [received, setReceived] = useState(0)
  const [showDone, setShowDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!params.token) return
    fetch(`/api/public/photo-intake/${params.token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        setStoreTitle((await r.json()).storeTitle)
      })
      .catch(() => setNotFound(true))
  }, [params.token])

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return
    // 選択欄を空に戻すと list の中身も消えるので、先に配列へ写しておく
    const chosen = Array.from(list)
    if (inputRef.current) inputRef.current.value = ""

    const room = Math.max(0, MAX_PER_BATCH - items.length)
    const picked = chosen.slice(0, room)
    setShowDone(false)
    setMessage(
      chosen.length > picked.length
        ? `1回に送れるのは${MAX_PER_BATCH}枚までです。残りは、送り終えたあとに「続けて送る」からお送りください。`
        : null
    )
    if (picked.length === 0) return
    setItems((prev) => [
      ...prev,
      ...picked.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
        previewFailed: false,
        status: "wait" as Status,
      })),
    ])
  }

  const patch = (id: string, p: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)))

  const remove = (id: string) =>
    setItems((prev) => {
      const target = prev.find((it) => it.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return prev.filter((it) => it.id !== id)
    })

  const sendAll = async () => {
    const targets = items.filter((it) => it.status === "wait" || it.status === "error")
    if (targets.length === 0 || sending) return
    setSending(true)
    setMessage(null)
    let ok = 0
    for (const it of targets) {
      try {
        patch(it.id, { status: "send", error: undefined })
        const resized = await resizeImageForGbp(it.file, () => patch(it.id, { status: "convert" }))
        patch(it.id, { status: "send" })
        const form = new FormData()
        form.append("file", new File([resized.blob], resized.fileName, { type: "image/jpeg" }))
        if (senderName.trim()) form.append("senderName", senderName.trim())
        if (note.trim()) form.append("note", note.trim())
        const res = await fetch(`/api/public/photo-intake/${params.token}`, {
          method: "POST",
          body: form,
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || "送れませんでした。もう一度お試しください。")
        patch(it.id, { status: "done" })
        ok++
      } catch (e) {
        patch(it.id, {
          status: "error",
          error: e instanceof Error ? e.message : "送れませんでした。もう一度お試しください。",
        })
      }
    }
    setSending(false)
    if (ok > 0) {
      setReceived((n) => n + ok)
      setShowDone(true)
      // 受け取れた写真は一覧から外し、送れなかったものだけ残す
      setItems((prev) => {
        for (const it of prev) if (it.status === "done") URL.revokeObjectURL(it.preview)
        return prev.filter((it) => it.status !== "done")
      })
    }
  }

  if (notFound) {
    return (
      <div className="pi">
        <p className="pi-state">
          このページでは、いま写真を受け付けていません。
          <small>URLが変わった可能性があります。担当者までお問い合わせください。</small>
        </p>
      </div>
    )
  }
  if (!storeTitle) {
    return (
      <div className="pi">
        <p className="pi-state">読み込んでいます…</p>
      </div>
    )
  }

  const pending = items.filter((it) => it.status === "wait" || it.status === "error").length
  const failed = items.filter((it) => it.status === "error")

  return (
    <main className="pi">
      <div className="pi-body">
        <header className="pi-hero">
          <p className="pi-eyebrow">
            <b>PHOTO DESK</b>
            <span>写真の受付</span>
          </p>
          <p className="pi-vert" aria-hidden="true">
            Send your photos
          </p>
          <div className="pi-wm" aria-hidden="true">
            PHOTO
          </div>
          <p className="pi-store">{storeTitle} 様</p>
          <h1 className="pi-title">
            <span>写真を、</span>
            <span>ここから</span>
            <span>送れます。</span>
          </h1>
          <p className="pi-lead">
            Googleの投稿や
            <wbr />
            写真欄で
            <wbr />
            ご紹介するための
            <wbr />
            写真を
            <wbr />
            受け付けています。
            <wbr />
            スマートフォンに
            <wbr />
            入っている写真を
            <wbr />
            選んで、
            <wbr />
            そのまま送れます。
          </p>
        </header>

        <section className="pi-form">
          <div className="pi-form-inner">
            {showDone && (
              <div className="pi-done" role="status">
                <p className="num">
                  {received}
                  <small>枚</small>
                </p>
                <h2>受け取りました。</h2>
                <p>
                  ありがとうございます。
                  <wbr />
                  担当が確認して、
                  <wbr />
                  ご紹介に使わせていただきます。
                </p>
                {failed.length === 0 && (
                  <button
                    type="button"
                    className="pi-btn is-line"
                    onClick={() => {
                      setShowDone(false)
                      inputRef.current?.click()
                    }}
                  >
                    続けて送る
                  </button>
                )}
              </div>
            )}

            {(!showDone || failed.length > 0) && (
              <>
                <p className="pi-step">STEP 1</p>
                <button
                  type="button"
                  className={`pi-btn${items.length > 0 ? " is-line" : ""}`}
                  onClick={() => inputRef.current?.click()}
                  disabled={sending || items.length >= MAX_PER_BATCH}
                >
                  {items.length > 0 ? "写真を追加する" : "写真をえらぶ"}
                  <small>{items.length > 0 ? `${items.length}` : ""}</small>
                </button>

                {items.length > 0 && (
                  <ul className="pi-thumbs">
                    {items.map((it) => (
                      <li key={it.id}>
                        <div>
                          {it.previewFailed ? (
                            <span className="name">{it.file.name}</span>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={it.preview}
                              alt=""
                              onError={() => patch(it.id, { previewFailed: true })}
                            />
                          )}
                        </div>
                        <p
                          className={`state${it.status === "done" ? " is-done" : ""}${
                            it.status === "error" ? " is-error" : ""
                          }`}
                        >
                          <span>{it.error ?? STATUS_LABEL[it.status]}</span>
                          {!sending && (
                            <button type="button" onClick={() => remove(it.id)}>
                              外す
                            </button>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                {items.length > 0 && (
                  <>
                    <label className="pi-field">
                      <span>お名前（書かなくても送れます）</span>
                      <input
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        maxLength={60}
                        autoComplete="name"
                      />
                    </label>
                    <label className="pi-field">
                      <span>ひとこと（何の写真か。書かなくても送れます）</span>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={300}
                        rows={2}
                        placeholder="例：先週の現場の様子です"
                      />
                    </label>

                    <div className="pi-send">
                      <p className="pi-step">STEP 2</p>
                      <button
                        type="button"
                        className="pi-btn"
                        onClick={sendAll}
                        disabled={sending || pending === 0}
                      >
                        {sending ? "送っています…" : "この写真を送る"}
                        <small>{pending > 0 ? `${pending}` : ""}</small>
                      </button>
                    </div>
                  </>
                )}

                {message && <p className="pi-msg">{message}</p>}
              </>
            )}

            <input
              ref={inputRef}
              className="pi-file"
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              tabIndex={-1}
              aria-hidden="true"
            />

            <div className="pi-hints">
              <h2>こんな写真をお待ちしています</h2>
              <ul>
                {HINTS.map((h, i) => (
                  <li key={h}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <p>
                人が写っている写真は、
                <wbr />
                ご本人の了承を
                <wbr />
                いただいたものを
                <wbr />
                お送りください。
                <br />
                送っていただいた写真は、
                <wbr />
                担当が確認してから
                <wbr />
                使わせていただきます。
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
