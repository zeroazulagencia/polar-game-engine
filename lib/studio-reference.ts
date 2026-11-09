"use client"

import { createSlot } from "./persistent-slot"

/** Image the next AI generation is based on (an asset, or a piece of one). */
export interface StudioReference {
  assetId?: string
  name: string
  dataUrl: string
  /** true when it is a cropped part of the asset */
  partial?: boolean
}

/** Set from the Library ("Usar como referencia") and read by the generator; survives reloads. */
export const referenceSlot = createSlot<StudioReference>("pixelquest:studio-reference", { persist: true })

/** Crop a normalized rectangle out of an image. */
export async function cropRegion(dataUrl: string, r: { x: number; y: number; w: number; h: number }): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error("No se pudo leer la imagen"))
    i.src = dataUrl
  })
  const sx = Math.round(r.x * img.naturalWidth)
  const sy = Math.round(r.y * img.naturalHeight)
  const sw = Math.max(1, Math.round(r.w * img.naturalWidth))
  const sh = Math.max(1, Math.round(r.h * img.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = sw
  canvas.height = sh
  canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvas.toDataURL("image/png")
}
