import type { Point } from "./game-types"

/** Same height formula the stage and the player use for scene objects: stageHeight × 0.18 × scale. */
const OBJECT_BASE_HEIGHT = 0.18

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("No se pudo leer el fondo"))
    img.src = src
  })
}

export interface ForegroundCut {
  /** PNG of exactly those background pixels, transparent outside the outline */
  dataUrl: string
  /** placement as a scene object (anchored bottom-center) so it lands on the same pixels */
  x: number
  y: number
  scale: number
}

/**
 * Cut a piece of the background (a column, a tree, a table…) so it can be placed over the
 * character: the character then walks *behind* it. Uses the background's own pixels, so the
 * piece matches perfectly. `points` are normalized stage coordinates (the stage is 16:9 and
 * the background is drawn with object-cover).
 */
export async function cutForeground(backgroundDataUrl: string, points: Point[], stageAspect = 16 / 9): Promise<ForegroundCut> {
  if (points.length < 3) throw new Error("El contorno necesita al menos 3 puntos")
  const img = await loadImage(backgroundDataUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight

  // object-cover: the part of the image visible on the stage.
  let visW = w
  let visH = h
  if (w / h > stageAspect) visW = h * stageAspect
  else visH = w / stageAspect
  const offX = (w - visW) / 2
  const offY = (h - visH) / 2
  const toImg = (p: Point) => ({ x: offX + p.x * visW, y: offY + p.y * visH })

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const nx0 = Math.max(0, Math.min(...xs))
  const nx1 = Math.min(1, Math.max(...xs))
  const ny0 = Math.max(0, Math.min(...ys))
  const ny1 = Math.min(1, Math.max(...ys))
  if (nx1 - nx0 < 0.005 || ny1 - ny0 < 0.005) throw new Error("El recorte es demasiado pequeño")

  const a = toImg({ x: nx0, y: ny0 })
  const b = toImg({ x: nx1, y: ny1 })
  const cw = Math.max(1, Math.round(b.x - a.x))
  const ch = Math.max(1, Math.round(b.y - a.y))

  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext("2d")!
  ctx.beginPath()
  points.forEach((p, i) => {
    const q = toImg(p)
    const x = q.x - a.x
    const y = q.y - a.y
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(img, -a.x, -a.y)

  return {
    dataUrl: canvas.toDataURL("image/png"),
    x: (nx0 + nx1) / 2,
    y: ny1,
    scale: (ny1 - ny0) / OBJECT_BASE_HEIGHT,
  }
}
