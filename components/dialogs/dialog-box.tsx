"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react"
import { DEFAULT_DIALOG_STYLE, type DialogStyle } from "@/lib/game-types"

export interface DialogBoxHandle {
  /** Finish the typewriter if it is still typing; otherwise advance. */
  advance: () => void
}

const FONTS: Record<DialogStyle["font"], string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  rounded: '"Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
}

const WIDTHS: Record<DialogStyle["width"], string> = { full: "100%", wide: "80%", narrow: "56%" }

function hexToRgba(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * The in-game dialog box. Shared by the player and the editor's design preview so
 * both look exactly the same.
 */
export const DialogBox = forwardRef<
  DialogBoxHandle,
  {
    style?: DialogStyle
    speaker?: string
    text: string
    choices?: Array<{ id: string; text: string }>
    /** label under a line without choices, e.g. "Siguiente →" */
    hint?: string
    onAdvance?: () => void
    onChoose?: (id: string) => void
    /** restart the typewriter when this changes (e.g. the line id) */
    lineKey?: string
    /** key for the per-character name color (the raw speaker, e.g. "@protagonista"); defaults to `speaker` */
    colorKey?: string
    /** shows a close button (×) that ends the conversation */
    onClose?: () => void
  }
>(function DialogBox({ style: styleProp, speaker, text, choices = [], hint, onAdvance, onChoose, lineKey, colorKey, onClose }, ref) {
  const s = { ...DEFAULT_DIALOG_STYLE, ...styleProp }
  const [shown, setShown] = useState(s.typewriterSpeed > 0 ? 0 : text.length)
  const typing = shown < text.length

  // Typewriter: reveal the text progressively.
  useEffect(() => {
    if (s.typewriterSpeed <= 0) {
      setShown(text.length)
      return
    }
    setShown(0)
    const step = 1000 / s.typewriterSpeed
    const id = window.setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          window.clearInterval(id)
          return n
        }
        return n + 1
      })
    }, step)
    return () => window.clearInterval(id)
  }, [text, lineKey, s.typewriterSpeed])

  // Very quick fade-in whenever the line changes.
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    contentRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: "ease-out" })
  }, [text, lineKey, speaker])

  const advanceRef = useRef(() => {})
  // A menu waits for a pick: a click elsewhere just points at the options (underlined, a nudge).
  const choicesRef = useRef<HTMLOListElement>(null)
  const [nudged, setNudged] = useState(false)
  useEffect(() => {
    if (!nudged) return
    const id = window.setTimeout(() => setNudged(false), 900)
    return () => window.clearTimeout(id)
  }, [nudged])
  advanceRef.current = () => {
    if (typing) setShown(text.length)
    else if (choices.length > 0) {
      setNudged(true)
      choicesRef.current?.animate?.(
        [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }],
        { duration: 260, easing: "ease-in-out" },
      )
    } else onAdvance?.()
  }
  useImperativeHandle(ref, () => ({ advance: () => advanceRef.current() }), [])

  const m = s.margin ?? 0
  const pad = s.padding ?? 14
  const placement: CSSProperties =
    s.position === "top"
      ? { top: m }
      : s.position === "center"
        ? { top: "50%", transform: "translate(-50%, -50%)" }
        : { bottom: m }
  // Detached from the scene edges: draw a full border (and shadow) instead of a single edge line.
  const floating = s.width !== "full" || s.position === "center" || m > 0
  const box: CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    ...placement,
    width: s.width === "full" ? `calc(100% - ${2 * m}px)` : WIDTHS[s.width],
    maxHeight: "45%",
    overflowY: "auto",
    background: hexToRgba(speakerBackground(s, colorKey ?? speaker ?? ""), s.backgroundOpacity),
    color: s.text,
    fontFamily: FONTS[s.font],
    fontSize: s.fontSize,
    lineHeight: 1.5,
    borderRadius: s.radius,
    // Floating box: full border. Edge-to-edge bar: only the side facing the scene.
    ...(floating
      ? { border: `1px solid ${s.border}` }
      : s.position === "top"
        ? { borderBottom: `1px solid ${s.border}` }
        : { borderTop: `1px solid ${s.border}` }),
    padding: `${pad}px ${Math.round(pad * 1.55)}px`,
    cursor: choices.length === 0 || typing ? "pointer" : "default",
    zIndex: 99999,
    boxShadow: floating ? "0 10px 30px rgba(0,0,0,0.45)" : undefined,
  }

  return (
    <div
      style={box}
      onClick={(e) => {
        // Click anywhere in the box: finish typing, or advance (choices handle their own clicks).
        e.stopPropagation()
        advanceRef.current()
      }}
    >
      {onClose && (
        <button
          type="button"
          aria-label="Cerrar diálogo"
          title="Cerrar diálogo"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          style={{
            position: "absolute",
            top: Math.max(4, pad / 2.5),
            right: Math.max(6, pad / 2),
            width: 26,
            height: 26,
            display: "grid",
            placeItems: "center",
            border: 0,
            borderRadius: 999,
            background: "transparent",
            color: s.text,
            opacity: 0.55,
            fontSize: 20,
            lineHeight: 1,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
        >
          ×
        </button>
      )}
      <div ref={contentRef} style={onClose ? { paddingRight: 24 } : undefined}>
      {speaker && (
        <p style={{ margin: "0 0 4px", fontWeight: 700, color: speakerColor(s, colorKey ?? speaker) }}>{speaker}</p>
      )}
      {text && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{text.slice(0, shown)}</p>}
      {/* Choices only; lines without choices advance with a click anywhere (no hint shown). */}
      {!typing && choices.length > 0 && (
          <ol ref={choicesRef} style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
            {choices.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChoose?.(c.id)
                  }}
                  className="inline-block max-w-full rounded px-2 py-1 text-left hover:bg-white/10"
                  style={{
                    color: s.choice,
                    font: "inherit",
                    background: nudged ? "rgba(255,255,255,0.12)" : "transparent",
                    textDecoration: nudged ? "underline" : undefined,
                    textUnderlineOffset: 3,
                    transition: "background 0.2s",
                    border: 0,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ opacity: 0.45, marginRight: 8 }}>{i + 1}.</span>
                  {c.text || "…"}
                </button>
              </li>
            ))}
          </ol>
      )}
      </div>
    </div>
  )
})

/**
 * Box color for whoever talks: the style's background, a shade lighter or darker per
 * character. The narrator keeps it as is, the protagonist is always one step darker and
 * everyone else gets one of five fixed shades picked by name.
 */
const SHADES = [1, -2, 2, -3, 3]
export function speakerBackground(style: DialogStyle, speaker: string) {
  const key = speaker.trim().toLowerCase()
  if (style.speakerShades === false || !key || key === "narrador") return style.background
  let step = -1
  if (key !== "@protagonista") {
    let h = 1
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    step = SHADES[h % SHADES.length]
  }
  const m = /^#?([0-9a-f]{6})$/i.exec(style.background.trim())
  if (!m) return style.background
  const n = parseInt(m[1], 16)
  // each step mixes 7% of white (lighter) or black (darker) into the background
  const t = Math.min(0.3, 0.07 * Math.abs(step))
  const to = step > 0 ? 255 : 0
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * t))
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

/** Name color of a character in a style: its own color if it has one, else the style's. */
export function speakerColor(style: DialogStyle, speaker: string) {
  return style.speakerColors?.[speaker.trim().toLowerCase()] ?? style.speaker
}
