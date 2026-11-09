"use client"

import { useEffect, useRef, type ReactNode, type RefObject } from "react"
import type { SceneObjectAnimation } from "@/lib/game-types"
import type { DepthLook } from "@/lib/depth-look"
import { CharacterSprite } from "./character-sprite"

/** Idle loops for non-playable characters, so nobody stands frozen in a scene. */
const IDLE: Record<SceneObjectAnimation, { frames: Keyframe[]; ms: number }> = {
  breathe: { frames: [{ transform: "scale(1, 1)" }, { transform: "scale(0.996, 1.022)" }, { transform: "scale(1, 1)" }], ms: 3200 },
  float: {
    frames: [{ transform: "translateY(0) rotate(0deg)" }, { transform: "translateY(-4%) rotate(0.8deg)" }, { transform: "translateY(0) rotate(0deg)" }],
    ms: 2800,
  },
  sway: { frames: [{ transform: "rotate(-1.2deg)" }, { transform: "rotate(1.2deg)" }, { transform: "rotate(-1.2deg)" }], ms: 4200 },
}
const TALK: Keyframe[] = [{ transform: "translateY(0) scaleY(1)" }, { transform: "translateY(-1.6%) scaleY(1.025)" }, { transform: "translateY(0) scaleY(1)" }]

/** Stable pseudo-random phase per object, so several characters don't move in sync. */
const phase = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 1000

/**
 * The protagonist breathes deeper than scene characters (smaller on screen, watched the most).
 * Defaults for `Character.breathDepth` / `breathMs`.
 */
export const PROTAGONIST_BREATH = 2
export const PROTAGONIST_BREATH_MS = IDLE.breathe.ms

/**
 * Plays an idle loop on `ref` (transform origin at its feet). `breathDepth` scales how much
 * "breathe" stretches (1 is the subtle default of scene characters, 0 stays still) and
 * `breathMs` is how long one breath takes.
 */
export function useIdleAnimation(
  ref: RefObject<HTMLElement | null>,
  animation: SceneObjectAnimation | null | undefined,
  id: string,
  breathDepth = 1,
  breathMs = IDLE.breathe.ms,
) {
  useEffect(() => {
    const el = ref.current
    if (!el || !animation || (animation === "breathe" && breathDepth <= 0)) return
    const { frames, ms } =
      animation === "breathe"
        ? {
            frames: [
              { transform: "scale(1, 1)" },
              { transform: `scale(${1 - 0.004 * breathDepth}, ${1 + 0.022 * breathDepth})` },
              { transform: "scale(1, 1)" },
            ],
            ms: Math.max(300, breathMs),
          }
        : IDLE[animation]
    const anim = el.animate(frames, { duration: ms, iterations: Infinity, easing: "ease-in-out", delay: -((phase(id) / 1000) * ms) })
    return () => anim.cancel()
  }, [ref, animation, id, breathDepth, breathMs])
}

/**
 * A scene character drawn from one sprite but alive: an idle loop (breathing, floating or
 * swaying, anchored at the feet) plus a bounce while it is the one talking in a dialog.
 */
export function LivingSprite({
  id,
  src,
  alt,
  animation,
  talking,
  flipX,
  look,
  breathDepth = 1,
  breathMs,
  children,
}: {
  id: string
  src: string
  alt: string
  animation?: SceneObjectAnimation | null
  talking?: boolean
  flipX?: boolean
  look?: DepthLook
  /** see useIdleAnimation */
  breathDepth?: number
  breathMs?: number
  /** drawn over the sprite and moving with it (breathing, talking): worn accessories */
  children?: ReactNode
}) {
  const idleRef = useRef<HTMLDivElement>(null)
  const talkRef = useRef<HTMLDivElement>(null)

  useIdleAnimation(idleRef, animation, id, breathDepth, breathMs)

  useEffect(() => {
    const el = talkRef.current
    if (!el || !talking) return
    const anim = el.animate(TALK, { duration: 360, iterations: Infinity, easing: "ease-in-out" })
    return () => anim.cancel()
  }, [talking])

  return (
    <div ref={talkRef} className="h-full" style={{ transformOrigin: "50% 100%" }}>
      <div ref={idleRef} className="h-full" style={{ transformOrigin: "50% 100%" }}>
        <div className="relative h-full" style={{ transform: flipX ? "scaleX(-1)" : undefined }}>
          {look ? (
            <CharacterSprite src={src} look={look} alt={alt} className="block h-full w-auto max-w-none object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt} className="block h-full w-auto max-w-none object-contain" draggable={false} />
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
