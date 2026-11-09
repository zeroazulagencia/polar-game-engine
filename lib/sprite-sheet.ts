/**
 * Browser-side processing for AI-generated walk-cycle sprite sheets:
 * split a horizontal strip into frames, crop each to its content and
 * re-pack them on a shared canvas with the feet on the same baseline,
 * so the animation doesn't jitter or change size between frames.
 */

const ALPHA_THRESHOLD = 24
const PADDING = 6

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface ProcessedFrame {
  dataUrl: string
  width: number
  height: number
}

export interface ProcessedSheet {
  frames: ProcessedFrame[]
  /** per frame: why it looks wrong (cut by the image edge, too small…), or null if fine */
  issues: Array<string | null>
  /** poses the AI didn't draw (empty cells) */
  missing: number
  /** poses were touching and had to be cut at their narrowest points */
  touching?: boolean
  /** the legs barely change between frames (the AI repeated the same pose) */
  staticLegs?: boolean
  /** frames that faced the other way and were mirrored to match the rest */
  flipped?: number
  /** kept for older stored results; true when every pose was found cleanly */
  splitByGaps: boolean
  /** true when the image came back opaque and the background was keyed out */
  keyedBackground: boolean
}

/** How the poses are laid out in the generated image (reading order). */
export interface SheetLayout {
  cols: number
  rows: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("No se pudo leer la imagen"))
    img.src = src
  })
}

function imageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

function isOpaque(data: ImageData, x: number, y: number) {
  return data.data[(y * data.width + x) * 4 + 3] > ALPHA_THRESHOLD
}

/**
 * If the model ignored the transparent background request, flood-fill from the
 * borders and clear every pixel close to the border colour.
 */
function keyOutBackground(data: ImageData): boolean {
  const { width, height } = data
  const px = data.data
  let opaque = 0
  for (let i = 3; i < px.length; i += 4) if (px[i] > ALPHA_THRESHOLD) opaque++
  if (opaque / (width * height) < 0.97) return false

  const ref = [px[0], px[1], px[2]]
  const tolerance = 48
  const close = (i: number) =>
    Math.abs(px[i] - ref[0]) + Math.abs(px[i + 1] - ref[1]) + Math.abs(px[i + 2] - ref[2]) <= tolerance

  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x)
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1)
  while (stack.length) {
    const p = stack.pop()!
    if (seen[p]) continue
    seen[p] = 1
    if (!close(p * 4)) continue
    px[p * 4 + 3] = 0
    const x = p % width
    const y = (p - x) / width
    if (x > 0) stack.push(p - 1)
    if (x < width - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - width)
    if (y < height - 1) stack.push(p + width)
  }

  // Background enclosed by the figure (between a staff and the body, under an arm) is not
  // reachable from the edges: clear pockets that match it closely and aren't specks.
  const tight = (i: number) =>
    Math.abs(px[i] - ref[0]) + Math.abs(px[i + 1] - ref[1]) + Math.abs(px[i + 2] - ref[2]) <= 24
  const minPocket = Math.max(30, Math.round(width * height * 0.00005))
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !tight(start * 4)) continue
    const region: number[] = []
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop()!
      region.push(p)
      const x = p % width
      const y = (p - x) / width
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q < 0 || seen[q] || !tight(q * 4)) continue
        seen[q] = 1
        stack.push(q)
      }
    }
    if (region.length >= minPocket) for (const p of region) px[p * 4 + 3] = 0
  }
  return true
}



function contentBox(data: ImageData, xStart: number, xEnd: number): Box | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < data.height; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (!isOpaque(data, x, y)) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 }
}

function sourceCanvas(data: ImageData) {
  const canvas = document.createElement("canvas")
  canvas.width = data.width
  canvas.height = data.height
  canvas.getContext("2d")!.putImageData(data, 0, 0)
  return canvas
}

/**
 * Draw every box onto a canvas of the same size, centred horizontally and
 * resting on the bottom edge (feet baseline → pivotY = 1).
 */
function packFrames(
  sources: Array<{ canvas: HTMLCanvasElement; box: Box; scale?: number }>,
): ProcessedFrame[] {
  const sized = sources.map((s) => {
    const k = s.scale ?? 1
    return { ...s, w: (s.box.x1 - s.box.x0) * k, h: (s.box.y1 - s.box.y0) * k }
  })
  const width = Math.ceil(Math.max(...sized.map((s) => s.w)) + PADDING * 2)
  const height = Math.ceil(Math.max(...sized.map((s) => s.h)) + PADDING)

  return sized.map((s) => {
    const out = document.createElement("canvas")
    out.width = width
    out.height = height
    const ctx = out.getContext("2d")!
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(
      s.canvas,
      s.box.x0,
      s.box.y0,
      s.box.x1 - s.box.x0,
      s.box.y1 - s.box.y0,
      Math.round((width - s.w) / 2),
      Math.round(height - s.h),
      s.w,
      s.h,
    )
    return { dataUrl: out.toDataURL("image/png"), width, height }
  })
}

/**
 * Label 8-connected opaque regions. Returns the label per pixel (-1 = transparent) and,
 * per label, its pixel count, bounding box and centroid x.
 */
function labelComponents(data: ImageData) {
  const { width, height } = data
  const px = data.data
  const labels = new Int32Array(width * height).fill(-1)
  const comps: Array<{ size: number; box: Box; cx: number; cy: number }> = []
  const stack = new Int32Array(width * height)
  for (let start = 0; start < width * height; start++) {
    if (labels[start] !== -1 || px[start * 4 + 3] <= ALPHA_THRESHOLD) continue
    const id = comps.length
    let size = 0
    let sumX = 0
    let sumY = 0
    const box: Box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 }
    let top = 0
    stack[top++] = start
    labels[start] = id
    while (top > 0) {
      const p = stack[--top]
      const x = p % width
      const y = (p - x) / width
      size++
      sumX += x
      sumY += y
      if (x < box.x0) box.x0 = x
      if (y < box.y0) box.y0 = y
      if (x + 1 > box.x1) box.x1 = x + 1
      if (y + 1 > box.y1) box.y1 = y + 1
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const q = ny * width + nx
          if (labels[q] !== -1 || px[q * 4 + 3] <= ALPHA_THRESHOLD) continue
          labels[q] = id
          stack[top++] = q
        }
      }
    }
    comps.push({ size, box, cx: sumX / size, cy: sumY / size })
  }
  return { labels, comps }
}


/** A canvas holding only the pixels for which `keep(x, y, pixelIndex)` is true, cropped to them. */
function extractFigure(data: ImageData, keep: (p: number, x: number) => boolean): { canvas: HTMLCanvasElement; box: Box } | null {
  const { width, height } = data
  const box: Box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (data.data[p * 4 + 3] <= ALPHA_THRESHOLD || !keep(p, x)) continue
      if (x < box.x0) box.x0 = x
      if (y < box.y0) box.y0 = y
      if (x + 1 > box.x1) box.x1 = x + 1
      if (y + 1 > box.y1) box.y1 = y + 1
    }
  }
  if (box.x1 < 0) return null
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  const out = new ImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x + box.x0
      const p = (y + box.y0) * width + sx
      if (!keep(p, sx)) continue
      const i = p * 4
      const o = (y * w + x) * 4
      out.data[o] = data.data[i]
      out.data[o + 1] = data.data[i + 1]
      out.data[o + 2] = data.data[i + 2]
      out.data[o + 3] = data.data[i + 3]
    }
  }
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  canvas.getContext("2d")!.putImageData(out, 0, 0)
  return { canvas, box: { x0: 0, y0: 0, x1: w, y1: h } }
}

/** Small grayscale+alpha thumbnail of a figure (centered, fixed size) for comparisons. */
function thumb(canvas: HTMLCanvasElement, mirror: boolean): Float32Array {
  const W = 40
  const H = 56
  const t = document.createElement("canvas")
  t.width = W
  t.height = H
  const ctx = t.getContext("2d")!
  const scale = Math.min(W / canvas.width, H / canvas.height)
  const w = canvas.width * scale
  const h = canvas.height * scale
  ctx.save()
  if (mirror) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(canvas, (W - w) / 2, H - h, w, h)
  ctx.restore()
  const d = ctx.getImageData(0, 0, W, H).data
  const out = new Float32Array(W * H * 2)
  for (let i = 0; i < W * H; i++) {
    const a = d[i * 4 + 3] / 255
    out[i * 2] = a
    out[i * 2 + 1] = ((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765) * a
  }
  return out
}

const thumbDiff = (a: Float32Array, b: Float32Array) => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum
}

/**
 * Which frames face the other way? A frame that looks more like the others when mirrored
 * is facing the opposite side (the AI sometimes draws one row looking left and the other
 * right). Returns, per frame, whether to mirror it so all of them face the majority side.
 */
function facingFlips(figs: Array<{ canvas: HTMLCanvasElement }>): boolean[] {
  const n = figs.length
  if (n < 2) return figs.map(() => false)
  const normal = figs.map((f) => thumb(f.canvas, false))
  const mirrored = figs.map((f) => thumb(f.canvas, true))
  // gain[i][j] > 0: frames i and j look more alike as they are than with j mirrored.
  const gain = normal.map((ni, i) => normal.map((nj, j) => (i === j ? 0 : thumbDiff(ni, mirrored[j]) - thumbDiff(ni, nj))))
  // Few frames (4–6): try every mirror combination and keep the most self-consistent one.
  let best = 0
  let bestScore = -Infinity
  for (let mask = 0; mask < 1 << n; mask++) {
    let score = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const same = ((mask >> i) & 1) === ((mask >> j) & 1)
        score += same ? gain[i][j] : -gain[i][j]
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = mask
    }
  }
  const flips = figs.map((_, i) => ((best >> i) & 1) === 1)
  // Mirror the minority so the majority keeps the side the AI drew most.
  const count = flips.filter(Boolean).length
  return count > n / 2 ? flips.map((f) => !f) : flips
}

function mirrorCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext("2d")!
  ctx.translate(canvas.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(canvas, 0, 0)
  return out
}

/** Mirror the frames facing the other way (good frames only decide the majority). */
function alignFacing<T extends { canvas: HTMLCanvasElement; box: Box }>(figs: T[], issues: Array<string | null>) {
  const goodIdx = figs.map((_, i) => i).filter((i) => !issues[i])
  const flips = facingFlips(goodIdx.map((i) => figs[i]))
  let flipped = 0
  const out = figs.map((f) => ({ ...f }))
  goodIdx.forEach((i, k) => {
    if (!flips[k]) return
    out[i].canvas = mirrorCanvas(out[i].canvas)
    flipped++
  })
  return { figs: out, flipped }
}

/**
 * Do the feet move? Compares the bottom 15% of each figure (the feet — legs are often hidden
 * by robes or coats), scaled to a small grid and centered, between consecutive frames.
 * Near-identical masks everywhere mean the AI repeated the same pose.
 */
function legsAreStatic(figs: Array<{ canvas: HTMLCanvasElement }>): boolean {
  if (figs.length < 2) return false
  const W = 48
  const H = 20
  const masks = figs.map(({ canvas }) => {
    const band = Math.max(1, Math.round(canvas.height * 0.15))
    const small = document.createElement("canvas")
    small.width = W
    small.height = H
    // Same horizontal scale for all frames: map the band's height to H, keep aspect, center.
    const scale = H / band
    const w = canvas.width * scale
    small.getContext("2d")!.drawImage(canvas, 0, canvas.height - band, canvas.width, band, (W - w) / 2, 0, w, H)
    const d = small.getContext("2d")!.getImageData(0, 0, W, H).data
    const m = new Uint8Array(W * H)
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 64 ? 1 : 0
    return m
  })
  const ious: number[] = []
  for (let i = 0; i < masks.length; i++) {
    const a = masks[i]
    const b = masks[(i + 1) % masks.length]
    let inter = 0
    let union = 0
    for (let k = 0; k < a.length; k++) {
      inter += a[k] & b[k]
      union += a[k] | b[k]
    }
    ious.push(union ? inter / union : 1)
  }
  return ious.every((v) => v > 0.82)
}

/** Gap in pixels between two boxes (0 when they overlap). */
function boxDistance(a: Box, b: Box) {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1)
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1)
  return Math.hypot(dx, dy)
}

/**
 * Split an AI walk-cycle sheet into frames. The poses are laid out in a grid (`layout`,
 * reading order; old results are a single row):
 * 1. In each cell, the biggest connected region whose center lies there is that pose's body.
 * 2. Every other region (a detached scythe, a loose hand, sparks) joins the body it is
 *    physically closest to — not the cell it happens to fall in.
 * 3. Each frame keeps only its own pixels, and suspicious frames are flagged: cut by the
 *    image edge, much smaller than the others (a stray piece), or missing.
 * Frames are then packed on one canvas with the feet on the same baseline.
 */
export async function processWalkSheet(
  sheetDataUrl: string,
  frameCount: number,
  layout: SheetLayout = { cols: frameCount, rows: 1 },
): Promise<ProcessedSheet> {
  const img = await loadImage(sheetDataUrl)
  const data = imageData(img)
  const keyedBackground = keyOutBackground(data)
  const { width, height } = data

  const { labels, comps } = labelComponents(data)
  const totalOpaque = comps.reduce((n, c) => n + c.size, 0)
  if (totalOpaque === 0) throw new Error("La imagen generada está vacía")

  const cellW = width / layout.cols
  const cellH = height / layout.rows
  const cellOf = (x: number, y: number) =>
    Math.min(layout.rows - 1, Math.floor(y / cellH)) * layout.cols + Math.min(layout.cols - 1, Math.floor(x / cellW))

  // 1. Bodies: biggest meaningful region per cell (by its center).
  const minBody = totalOpaque * 0.02
  const bodies: Array<number | null> = new Array(frameCount).fill(null)
  for (let id = 0; id < comps.length; id++) {
    const c = comps[id]
    if (c.size < minBody) continue
    const cell = cellOf(c.cx, c.cy)
    if (cell >= frameCount) continue
    const cur = bodies[cell]
    if (cur === null || comps[cur].size < c.size) bodies[cell] = id
  }

  // Touching poses merge into one region that spans several cells: cut them apart instead.
  const spansCells = bodies.some(
    (id) => id !== null && (comps[id].box.x1 - comps[id].box.x0 > cellW * 1.25 || comps[id].box.y1 - comps[id].box.y0 > cellH * 1.25),
  )
  if (bodies.includes(null) && spansCells) {
    return splitTouching(data, frameCount, layout, keyedBackground)
  }

  // 2. Everything else joins the physically closest body.
  const owner = new Int32Array(comps.length).fill(-1)
  bodies.forEach((id, frame) => id !== null && (owner[id] = frame))
  const bodyList = bodies.map((id, frame) => ({ id, frame })).filter((b): b is { id: number; frame: number } => b.id !== null)
  for (let id = 0; id < comps.length; id++) {
    if (owner[id] !== -1 || comps[id].size < totalOpaque * 0.0005 || bodyList.length === 0) continue
    let best = bodyList[0]
    for (const b of bodyList) {
      if (boxDistance(comps[id].box, comps[b.id].box) < boxDistance(comps[id].box, comps[best.id].box)) best = b
    }
    owner[id] = best.frame
  }

  // 3. Extract each pose with only its own pixels, and flag suspicious ones.
  const extracted = bodyList.map(({ frame }) => {
    const fig = extractFigure(data, (p) => labels[p] >= 0 && owner[labels[p]] === frame)
    let area = 0
    let cut = false
    for (let id = 0; id < comps.length; id++) {
      if (owner[id] !== frame) continue
      area += comps[id].size
      const bx = comps[id].box
      if (bx.x0 <= 1 || bx.y0 <= 1 || bx.x1 >= width - 1 || bx.y1 >= height - 1) cut = true
    }
    return { fig, area, cut }
  })
  const areas = extracted.map((e) => e.area).sort((a, b) => a - b)
  const median = areas[Math.floor(areas.length / 2)] ?? 0
  const kept = extracted.filter((e): e is typeof e & { fig: NonNullable<typeof e.fig> } => !!e.fig)
  if (kept.length === 0) throw new Error("No se encontraron poses en la imagen generada")

  const issues = kept.map((e) =>
    e.cut ? "cortado por el borde de la imagen" : e.area < median * 0.45 ? "demasiado pequeño (parece una pieza suelta)" : null,
  )
  const missing = frameCount - kept.length
  const aligned = alignFacing(
    kept.map((e) => e.fig),
    issues,
  )
  return {
    frames: packFrames(aligned.figs),
    issues,
    missing,
    flipped: aligned.flipped,
    staticLegs: legsAreStatic(aligned.figs.filter((_, i) => !issues[i])),
    splitByGaps: missing === 0 && issues.every((i) => !i),
    keyedBackground,
  }
}

/**
 * Fallback for touching poses: in each grid row, cut between columns at the column with the
 * fewest opaque pixels near the expected boundary (the narrowest point between two figures).
 */
function splitTouching(data: ImageData, frameCount: number, layout: SheetLayout, keyedBackground: boolean): ProcessedSheet {
  const { width, height } = data
  const cellW = width / layout.cols
  const cellH = height / layout.rows
  const rowCuts: number[][] = []
  for (let r = 0; r < layout.rows; r++) {
    const y0 = Math.round(r * cellH)
    const y1 = Math.round((r + 1) * cellH)
    const profile = new Array<number>(width).fill(0)
    for (let x = 0; x < width; x++) for (let y = y0; y < y1; y++) if (isOpaque(data, x, y)) profile[x]++
    // The AI often ignores the column widths, so don't look near the "expected" boundaries:
    // take the narrowest points of the whole row (smoothed), at least half a cell apart.
    const smooth = profile.map((_, x) => {
      let sum = 0
      let n = 0
      for (let k = Math.max(0, x - 6); k <= Math.min(width - 1, x + 6); k++) {
        sum += profile[k]
        n++
      }
      return sum / n
    })
    const margin = Math.round(cellW * 0.25)
    const candidates = Array.from({ length: Math.max(0, width - 2 * margin) }, (_, i) => i + margin).sort(
      (p, q) => smooth[p] - smooth[q],
    )
    const picked: number[] = []
    for (const x of candidates) {
      if (picked.length === layout.cols - 1) break
      if (picked.every((c) => Math.abs(c - x) >= cellW * 0.5)) picked.push(x)
    }
    rowCuts.push([0, ...picked.sort((p, q) => p - q), width])
  }
  const cellOfPixel = (p: number, x: number) => {
    const r = Math.min(layout.rows - 1, Math.floor((p - x) / width / cellH))
    const cuts = rowCuts[r]
    let c = 0
    while (c < layout.cols - 1 && x >= cuts[c + 1]) c++
    return r * layout.cols + c
  }
  const figs: Array<{ fig: { canvas: HTMLCanvasElement; box: Box }; area: number; cut: boolean }> = []
  for (let cell = 0; cell < frameCount; cell++) {
    let area = 0
    let cut = false
    const fig = extractFigure(data, (p, x) => {
      const mine = cellOfPixel(p, x) === cell
      if (mine) {
        area++
        const y = (p - x) / width
        if (x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2) cut = true
      }
      return mine
    })
    if (fig) figs.push({ fig, area, cut })
  }
  if (figs.length === 0) throw new Error("No se encontraron poses en la imagen generada")
  const areas = figs.map((f) => f.area).sort((a, b) => a - b)
  const median = areas[Math.floor(areas.length / 2)]
  const issues = figs.map((f) =>
    f.cut ? "cortado por el borde de la imagen" : f.area < median * 0.45 ? "demasiado pequeño (parece una pieza suelta)" : null,
  )
  const aligned = alignFacing(
    figs.map((f) => f.fig),
    issues,
  )
  return {
    frames: packFrames(aligned.figs),
    issues,
    missing: frameCount - figs.length,
    flipped: aligned.flipped,
    staticLegs: legsAreStatic(aligned.figs.filter((_, i) => !issues[i])),
    touching: true,
    splitByGaps: false,
    keyedBackground,
  }
}

/**
 * Re-pack the idle sprite together with the walk frames on one shared canvas,
 * scaling the idle so the character has the same height as in the walk cycle
 * (median frame height). Idle and walk then render at the same size in play mode.
 */
export async function packWithIdle(
  idleDataUrl: string,
  walkFrames: ProcessedFrame[],
): Promise<{ idle: ProcessedFrame; walk: ProcessedFrame[] }> {
  const idle = imageData(await loadImage(idleDataUrl))
  keyOutBackground(idle)
  const idleBox = contentBox(idle, 0, idle.width)
  if (!idleBox) throw new Error("El sprite idle está vacío")

  const walkSources: Array<{ canvas: HTMLCanvasElement; box: Box }> = []
  for (const f of walkFrames) {
    const d = imageData(await loadImage(f.dataUrl))
    const box = contentBox(d, 0, d.width)
    if (box) walkSources.push({ canvas: sourceCanvas(d), box })
  }
  if (walkSources.length === 0) throw new Error("No hay fotogramas de caminar")

  const heights = walkSources.map((s) => s.box.y1 - s.box.y0).sort((a, b) => a - b)
  const scale = heights[Math.floor(heights.length / 2)] / (idleBox.y1 - idleBox.y0)

  const [packedIdle, ...walk] = packFrames([{ canvas: sourceCanvas(idle), box: idleBox, scale }, ...walkSources])
  return { idle: packedIdle, walk }
}
