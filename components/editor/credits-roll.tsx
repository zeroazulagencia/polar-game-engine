"use client"

import { useEffect, useRef } from "react"
import type { GameProject } from "@/lib/game-types"

/**
 * The credits rolling up over black. Lines starting with "# " are headings, empty lines gaps.
 * Click, Enter or Escape ends them; so does reaching the end. Fills its parent.
 */
export function CreditsRoll({ project, onDone }: { project: GameProject; onDone: () => void }) {
  const lines = (project.credits?.text ?? "").split("\n")
  // about a line and a half per second of reading, never rushed
  const seconds = Math.max(18, lines.length * 1.4)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  // the click or key that opened them must not close them
  const readyRef = useRef(false)
  useEffect(() => {
    const t = window.setTimeout(() => (readyRef.current = true), 600)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter" && e.key !== " ") return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (readyRef.current) doneRef.current()
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [])

  return (
    <div
      className="absolute inset-0 z-[96] cursor-pointer select-none overflow-hidden bg-black [container-type:size]"
      onClick={(e) => {
        e.stopPropagation()
        if (readyRef.current) onDone()
      }}
      onMouseMove={(e) => e.stopPropagation()}
    >
      <style>{`@keyframes pq-credits{from{transform:translateY(100cqh)}to{transform:translateY(-100%)}}`}</style>
      <div
        className="flex flex-col items-center px-[8%] text-center font-serif"
        style={{ animation: `pq-credits ${seconds}s linear forwards` }}
        onAnimationEnd={() => doneRef.current()}
      >
        {lines.map((line, i) =>
          line.startsWith("# ") ? (
            <p key={i} className="mt-[3cqh] text-[clamp(0.7rem,1.5cqw,1.1rem)] uppercase tracking-[0.25em] text-white/45">
              {line.slice(2)}
            </p>
          ) : line.trim() ? (
            <p key={i} className="text-[clamp(0.9rem,2.2cqw,1.6rem)] leading-snug text-white/90">
              {line}
            </p>
          ) : (
            <div key={i} className="h-[4cqh]" />
          ),
        )}
      </div>
      <span className="absolute right-3 top-3 text-xs text-white/40">Clic para salir</span>
    </div>
  )
}
