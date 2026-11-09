"use client"

import { useEffect, useRef, useState } from "react"
import type { GameProject } from "@/lib/game-types"

/**
 * The first screen of the game: the picture, the title and the menu (New game, Continue,
 * Credits). Arrows move between options, Enter picks one. Fills its parent.
 */
export function TitleScreenView({
  project,
  canContinue,
  onNew,
  onContinue,
  onCredits,
}: {
  project: GameProject
  canContinue: boolean
  onNew: () => void
  onContinue: () => void
  onCredits: () => void
}) {
  const t = project.titleScreen
  const bg = t?.backgroundAssetId ? project.assets.find((a) => a.id === t.backgroundAssetId) : undefined
  const menuRef = useRef<HTMLDivElement>(null)
  // Fade in from black: the picture slowly, the title and menu after it.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 30)
    return () => window.clearTimeout(t)
  }, [])
  const options = [
    canContinue && { id: "continue", label: "Continuar", run: onContinue },
    { id: "new", label: "Nueva partida", run: onNew },
    project.credits?.text.trim() && { id: "credits", label: "Créditos", run: onCredits },
  ].filter((o): o is { id: string; label: string; run: () => void } => !!o)

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      if (!buttons.length) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length
      buttons[next].focus()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [])

  return (
    <div className="absolute inset-0 z-[95] flex select-none flex-col items-center justify-end overflow-hidden bg-black" onClick={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()}>
      {bg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg.dataUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[2000ms] ease-out" style={{ opacity: shown ? 1 : 0, transform: shown ? "scale(1)" : "scale(1.04)" }} />
      )}
      {/* darker at the bottom, so the menu reads over any picture */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
      <div className="relative flex w-full flex-col items-center px-[6%] pb-[7%] text-center transition-opacity delay-700 duration-1000" style={{ opacity: shown ? 1 : 0 }}>
        {t?.title && (
          <h1 className="font-serif text-[clamp(1.8rem,7cqw,5.5rem)] font-bold leading-none tracking-wide text-white [text-shadow:0_4px_24px_rgba(0,0,0,.8)]">
            {t.title}
          </h1>
        )}
        {t?.subtitle && <p className="mt-[1.2cqh] font-serif text-[clamp(0.8rem,1.8cqw,1.4rem)] italic text-white/80">{t.subtitle}</p>}
        <div ref={menuRef} className="mt-[5cqh] flex flex-col items-center gap-[1.2cqh]">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                o.run()
              }}
              onMouseEnter={(e) => e.currentTarget.focus()}
              className="rounded px-4 py-1 font-serif text-[clamp(0.9rem,2.2cqw,1.6rem)] text-white/65 outline-none transition hover:text-white focus-visible:text-white focus:text-white [&:focus]:[text-shadow:0_0_18px_rgba(255,255,255,.55)]"
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
