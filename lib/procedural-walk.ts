"use client"

import type { CharacterDirection } from "./game-types"
import type { ProcessedFrame } from "./sprite-sheet"

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("No se pudo leer la imagen"))
    img.src = src
  })
}

/** Bounding box of the non-transparent pixels. */
function opaqueBox(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const { data } = ctx.getImageData(0, 0, w, h)
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Horizontal center of mass of the opaque pixels inside a band (where the legs split). */
function bandCenter(ctx: CanvasRenderingContext2D, box: { x: number; w: number }, y0: number, y1: number) {
  const { data } = ctx.getImageData(box.x, y0, box.w, y1 - y0)
  let sum = 0, n = 0
  for (let y = 0; y < y1 - y0; y++)
    for (let x = 0; x < box.w; x++)
      if (data[(y * box.w + x) * 4 + 3] > 24) {
        sum += x
        n++
      }
  return box.x + (n ? Math.round(sum / n) : Math.round(box.w / 2))
}

export interface ProceduralWalkOptions {
  frames?: number
  direction?: CharacterDirection
  /** stride of each foot, as a fraction of the figure height */
  stride?: number
  /** how much the hem / lower body swings, fraction of the height */
  sway?: number
  /** vertical bob of the whole body, fraction of the height */
  bob?: number
}

/**
 * Builds a walk cycle from a single sprite, without AI: below the hips the figure is split
 * into a back and a front leg that swing in opposite directions (more the lower the row,
 * so they pivot from the hips), the foot moving forward lifts and the body bobs. Every frame is
 * the same drawing, so the animation is perfectly smooth and consistent — ideal for robed
 * or cloaked characters, where the AI keeps drawing the same standing feet.
 */
export async function proceduralWalk(spriteDataUrl: string, opts: ProceduralWalkOptions = {}): Promise<ProcessedFrame[]> {
  const n = opts.frames ?? 8
  const side = (opts.direction ?? "right") === "right" || opts.direction === "left"
  const img = await loadImage(spriteDataUrl)
  const src = document.createElement("canvas")
  src.width = img.naturalWidth
  src.height = img.naturalHeight
  const sctx = src.getContext("2d", { willReadFrequently: true })!
  sctx.drawImage(img, 0, 0)
  const box = opaqueBox(sctx, src.width, src.height)
  if (!box) throw new Error("La imagen está vacía")

  const H = box.h
  const stride = Math.max(2, Math.round(H * (opts.stride ?? (side ? 0.07 : 0))))
  const sway = Math.round(H * (opts.sway ?? (side ? 0.025 : 0.012)))
  const bob = Math.max(1, Math.round(H * (opts.bob ?? 0.018)))
  const lift = Math.max(1, Math.round(H * (side ? 0.025 : 0.035)))

  const bottom = box.y + box.h
  const legTop = box.y + Math.round(H * 0.55) // hips: from here down the legs swing
  const split = bandCenter(sctx, box, bottom - Math.round(H * 0.2), bottom)

  const pad = stride + sway + 4
  const W = box.w + pad * 2
  const outH = H + bob + lift + 2
  const ox = pad - box.x // source x → output x
  const groundY = outH - 1 // feet rest on the bottom row
  const oy = groundY - bottom // source y → output y (without bob)

  const frames: ProcessedFrame[] = []
  for (let i = 0; i < n; i++) {
    const phase = (i / n) * Math.PI * 2
    const s = Math.sin(phase)
    // Body is lowest with the legs spread (contact) and highest when they pass each other.
    const bodyDy = -Math.round(bob * (1 - Math.abs(s)))
    const out = document.createElement("canvas")
    out.width = W
    out.height = outH
    const ctx = out.getContext("2d")!
    ctx.imageSmoothingEnabled = false

    // Upper body: unchanged, only the bob.
    ctx.drawImage(src, box.x, box.y, box.w, legTop - box.y, box.x + ox, box.y + oy + bodyDy, box.w, legTop - box.y)

    // Legs (or robe) pivot from the hips: every row below the hips is split at the legs'
    // center and each half is shifted more the lower it is, in opposite directions, so the
    // stride grows towards the feet with no visible seam. The foot moving forward lifts.
    const facingLeft = opts.direction === "left"
    const front = facingLeft ? -1 : 1 // +x is "forward" when facing right
    const leftW = split - box.x
    const rightW = box.x + box.w - split
    for (let y = legTop; y < bottom; y++) {
      const t = (y - legTop) / (bottom - legTop)
      const dy = Math.round(bodyDy * (1 - t))
      const swayDx = sway * s * t
      // Right half = front leg when facing right.
      const rightStep = stride * s * t * front
      const leftStep = -rightStep
      const foot = t * t // lift concentrates at the feet
      const rightLift = Math.round(lift * foot * Math.max(0, s))
      const leftLift = Math.round(lift * foot * Math.max(0, -s))
      const lx = Math.round(box.x + ox + swayDx + leftStep)
      const rx = Math.round(split + ox + swayDx + rightStep)
      const oyRow = y + oy + dy
      // Fill the gap that opens between the halves with the split column (cloth / empty).
      if (rx > lx + leftW) ctx.drawImage(src, split, y, 1, 1, lx + leftW, oyRow, rx - (lx + leftW), 2)
      // 2 px tall so rounding never leaves a transparent line between rows.
      ctx.drawImage(src, box.x, y, leftW, 1, lx, oyRow - leftLift, leftW, 2)
      ctx.drawImage(src, split, y, rightW, 1, rx, oyRow - rightLift, rightW, 2)
    }

    frames.push({ dataUrl: out.toDataURL("image/png"), width: W, height: outH })
  }
  return frames
}
