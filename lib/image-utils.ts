import type { Asset, AssetKind } from "./game-types"

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error("Could not read image"))
    img.src = dataUrl
  })
}

export async function dataUrlToAsset(dataUrl: string, kind: AssetKind, name: string): Promise<Asset> {
  const { width, height } = await getImageSize(dataUrl)
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    dataUrl,
    width,
    height,
  }
}

export async function fileToAsset(file: File, kind: AssetKind): Promise<Asset> {
  const dataUrl = await readFileAsDataUrl(file)
  return dataUrlToAsset(dataUrl, kind, file.name.replace(/\.[^.]+$/, ""))
}

/** The game stage is 16:9: backgrounds are stored in that ratio so nothing is cropped in play. */
export const GAME_ASPECT = 16 / 9

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not read image"))
    img.src = src
  })
}

export function isGameAspect(width: number, height: number) {
  return Math.abs(width / Math.max(1, height) - GAME_ASPECT) < 0.02
}

/** Center-crop an image to the given aspect ratio (no scaling). */
export async function cropToAspect(dataUrl: string, aspect = GAME_ASPECT): Promise<string> {
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight
  let cw = w
  let ch = Math.round(w / aspect)
  if (ch > h) {
    ch = h
    cw = Math.round(h * aspect)
  }
  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  canvas.getContext("2d")!.drawImage(img, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch)
  return canvas.toDataURL("image/png")
}

/**
 * Place an image centered (fit to height) on a wider transparent canvas, plus the matching
 * mask (transparent = area the AI must paint), so an image edit can extend the sides.
 */
export async function prepareOutpaint(
  dataUrl: string,
  width = 1536,
  height = 1024,
): Promise<{ image: Blob; mask: Blob }> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(height / img.naturalHeight, width / img.naturalWidth)
  const dw = Math.round(img.naturalWidth * scale)
  const dh = Math.round(img.naturalHeight * scale)
  const dx = Math.round((width - dw) / 2)
  const dy = Math.round((height - dh) / 2)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")!.drawImage(img, dx, dy, dw, dh)

  const mask = document.createElement("canvas")
  mask.width = width
  mask.height = height
  const m = mask.getContext("2d")!
  m.fillStyle = "#000"
  m.fillRect(dx, dy, dw, dh) // opaque = keep; the rest stays transparent = paint

  const toBlob = (c: HTMLCanvasElement) =>
    new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/png"))
  return { image: await toBlob(canvas), mask: await toBlob(mask) }
}

/** Horizontally mirrored copy of an image. */
export async function flipHorizontal(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")!
  ctx.translate(canvas.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL("image/png")
}

function canvasOf(img: HTMLImageElement, w = img.naturalWidth, h = img.naturalHeight) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  return { c, ctx }
}

/** Copy of a canvas cropped to the pixels that are not (almost) transparent. */
function cropToContent(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D): string {
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (data[(y * c.width + x) * 4 + 3] > 20) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return c.toDataURL("image/png")
  const out = document.createElement("canvas")
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL("image/png")
}

/**
 * Removes a flat green-screen background (as the image generators are asked to draw behind
 * characters): transparent where green clearly dominates, the green spill pulled out of the
 * edges, and cropped to what is left.
 */
export async function removeGreenScreen(dataUrl: string): Promise<string> {
  const { c, ctx } = canvasOf(await loadImage(dataUrl))
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const px = img.data
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2]
    const greener = g - Math.max(r, b)
    const alpha = Math.max(0, Math.min(1, 1 - (greener - 25) / 45))
    px[i + 1] = Math.min(g, Math.max(r, b) + 8)
    px[i + 3] = Math.round(px[i + 3] * alpha)
  }
  ctx.putImageData(img, 0, 0)
  return cropToContent(c, ctx)
}

/**
 * Follows a point of a reference frame (e.g. under the nose) through the other frames of an
 * animation: the patch around it is looked for nearby in each frame. `mirrored` frames face the
 * other way, so the patch is flipped. Returns the point in each frame, normalized to that frame.
 */
export async function trackPoint(
  reference: string,
  point: { x: number; y: number },
  frames: Array<{ id: string; src: string; mirrored: boolean }>,
): Promise<Record<string, { x: number; y: number }>> {
  const ref = await loadImage(reference)
  const k = 160 / ref.naturalHeight // work small: same scale for every frame
  const sample = (img: HTMLImageElement) => {
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k))
    const { ctx } = canvasOf(img, w, h)
    return { w, h, px: ctx.getImageData(0, 0, w, h).data }
  }
  const R = sample(ref)
  const half = Math.round(R.h * 0.08) // patch: about a skull wide
  const reach = Math.round(R.h * 0.14) // how far the head can move between frames
  const cx = Math.round(point.x * R.w), cy = Math.round(point.y * R.h)
  const at = (s: { w: number; px: Uint8ClampedArray }, x: number, y: number, c: number) => s.px[(y * s.w + x) * 4 + c]
  const out: Record<string, { x: number; y: number }> = {}
  for (const f of frames) {
    const F = sample(await loadImage(f.src))
    const fx0 = f.mirrored ? F.w - 1 - Math.round(point.x * F.w) : Math.round(point.x * F.w)
    const fy0 = Math.round(point.y * F.h)
    let best = Infinity, bx = fx0, by = fy0
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        let sad = 0
        for (let ty = -half; ty <= half && sad < best; ty += 2)
          for (let tx = -half; tx <= half; tx += 2) {
            const rx = cx + tx, ry = cy + ty
            const qx = fx0 + dx + (f.mirrored ? -tx : tx), qy = fy0 + dy + ty
            if (rx < 0 || ry < 0 || rx >= R.w || ry >= R.h || qx < 0 || qy < 0 || qx >= F.w || qy >= F.h) {
              sad += 255
              continue
            }
            const ra = at(R, rx, ry, 3) / 255, qa = at(F, qx, qy, 3) / 255
            for (let c = 0; c < 3; c++) sad += Math.abs(at(R, rx, ry, c) * ra - at(F, qx, qy, c) * qa)
            sad += Math.abs(ra - qa) * 255
          }
        if (sad < best) {
          best = sad
          bx = fx0 + dx
          by = fy0 + dy
        }
      }
    out[f.id] = { x: +(bx / F.w).toFixed(4), y: +(by / F.h).toFixed(4) }
  }
  return out
}
