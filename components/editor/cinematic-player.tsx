"use client"

import { useEffect, useRef, useState } from "react"
import type { Cinematic, GameProject } from "@/lib/game-types"

/**
 * Story slides over black, like the intro of an old console game: a picture with its text under
 * it, or a video in the middle. Click, Space or Enter moves on; Escape or «Saltar» skips the rest.
 * Fills its parent (position it over the stage).
 */
export function CinematicPlayer({ cinematic, project, onDone }: { cinematic: Cinematic; project: GameProject; onDone: () => void }) {
  const [idx, setIdx] = useState(0)
  const [shown, setShown] = useState(false)
  const slide = cinematic.slides[idx]
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  // A key or click already on its way when the cinematic starts (the one that passed the dialog line)
  // must not skip its first slide: input counts only after a moment.
  const readyRef = useRef(false)
  useEffect(() => {
    const t = window.setTimeout(() => (readyRef.current = true), 600)
    return () => window.clearTimeout(t)
  }, [])
  const next = () => {
    if (!readyRef.current) return
    if (idx + 1 < cinematic.slides.length) setIdx(idx + 1)
    else doneRef.current()
  }
  const nextRef = useRef(next)
  nextRef.current = next

  const asset = (id: string | null | undefined) => (id ? project.assets.find((a) => a.id === id) : undefined)
  const video = asset(slide?.videoAssetId)
  const image = video ? undefined : asset(slide?.imageAssetId)

  // Fade each slide in.
  useEffect(() => {
    setShown(false)
    const t = window.setTimeout(() => setShown(true), 30)
    return () => window.clearTimeout(t)
  }, [idx])

  // Slides with a duration move on by themselves (videos wait for their end).
  useEffect(() => {
    if (!slide) return void doneRef.current()
    if (video || !slide.seconds) return
    const t = window.setTimeout(() => (idx + 1 < cinematic.slides.length ? setIdx(idx + 1) : doneRef.current()), slide.seconds * 1000)
    return () => window.clearTimeout(t)
  }, [slide, video])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault()
        e.stopImmediatePropagation()
        nextRef.current()
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (readyRef.current) doneRef.current()
      }
    }
    // capture: the game's own keys (dialogs, inventory) must not see these
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [])

  if (!slide) return null
  return (
    <div
      className="absolute inset-0 z-[90] flex cursor-pointer select-none flex-col items-center justify-center bg-black"
      onClick={(e) => {
        e.stopPropagation()
        next()
      }}
      onMouseMove={(e) => e.stopPropagation()}
    >
      <div className="flex h-full w-full flex-col items-center justify-center px-[6%] transition-opacity duration-700" style={{ opacity: shown ? 1 : 0 }}>
        {video ? (
          <video
            key={slide.id}
            src={video.dataUrl}
            autoPlay
            playsInline
            onEnded={() => (idx + 1 < cinematic.slides.length ? setIdx(idx + 1) : doneRef.current())}
            className="max-h-[86%] max-w-full"
          />
        ) : (
          <>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.dataUrl} alt="" draggable={false} className="max-h-[62%] max-w-full object-contain" />
            )}
            {slide.text && (
              <p className="mt-[3%] max-w-[86%] whitespace-pre-line text-center font-serif text-base leading-relaxed text-white/90 md:text-xl">
                {slide.text}
              </p>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          doneRef.current()
        }}
        className="absolute right-3 top-3 rounded px-2 py-1 text-xs text-white/50 hover:bg-white/10 hover:text-white"
      >
        Saltar ›
      </button>
      {cinematic.slides.length > 1 && (
        <span className="absolute bottom-3 right-4 text-[11px] text-white/30">
          {idx + 1} / {cinematic.slides.length}
        </span>
      )}
    </div>
  )
}
