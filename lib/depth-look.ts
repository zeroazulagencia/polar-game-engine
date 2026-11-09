import type { DepthWaypoint } from "./game-types"

/** How the character looks at a point of the scene: size and lighting from the depth graph. */
export interface DepthLook {
  scale: number
  /** 1 = unchanged; < 1 darker, > 1 brighter */
  brightness: number
  /** hex color washed over the sprite, or null */
  tint: string | null
  /** 0–1 */
  tintStrength: number
}

const NEUTRAL: DepthLook = { scale: 1, brightness: 1, tint: null, tintStrength: 0 }

type WP = Pick<DepthWaypoint, "x" | "y" | "scale" | "brightness" | "tint" | "tintStrength">

const lookOf = (w: WP): DepthLook => ({
  scale: w.scale,
  brightness: w.brightness ?? 1,
  tint: w.tint ?? null,
  tintStrength: w.tint ? (w.tintStrength ?? 0.35) : 0,
})

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0xffffff
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbToHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`

function mix(a: DepthLook, b: DepthLook, t: number): DepthLook {
  const lerp = (x: number, y: number) => x + (y - x) * t
  // A point without tint fades towards the other point's color with strength 0.
  const ca = a.tint ?? b.tint
  const cb = b.tint ?? a.tint
  let tint: string | null = null
  if (ca && cb) {
    const ra = hexToRgb(ca)
    const rb = hexToRgb(cb)
    tint = rgbToHex(ra.map((v, i) => lerp(v, rb[i])))
  }
  return {
    scale: lerp(a.scale, b.scale),
    brightness: lerp(a.brightness, b.brightness),
    tint,
    tintStrength: lerp(a.tintStrength, b.tintStrength),
  }
}

/**
 * Look at `pos`: interpolated along the closest segment between two depth points
 * (same rule the scale always used), so size, brightness and tint change smoothly.
 */
export function getDepthLook(pos: { x: number; y: number }, waypoints: WP[]): DepthLook {
  if (waypoints.length === 0) return NEUTRAL
  if (waypoints.length === 1) return lookOf(waypoints[0])

  let a = waypoints[0]
  let b = waypoints[1]
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < waypoints.length; i++) {
    for (let j = i + 1; j < waypoints.length; j++) {
      const p1 = waypoints[i]
      const p2 = waypoints[j]
      const vx = p2.x - p1.x
      const vy = p2.y - p1.y
      const len2 = vx * vx + vy * vy
      if (len2 < 1e-6) continue
      const t = Math.max(0, Math.min(1, ((pos.x - p1.x) * vx + (pos.y - p1.y) * vy) / len2))
      const qx = p1.x + vx * t
      const qy = p1.y + vy * t
      const d2 = (pos.x - qx) ** 2 + (pos.y - qy) ** 2
      if (d2 < best) {
        best = d2
        a = p1
        b = p2
      }
    }
  }
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len2 = vx * vx + vy * vy
  if (len2 < 1e-6) return lookOf(a)
  const t = Math.max(0, Math.min(1, ((pos.x - a.x) * vx + (pos.y - a.y) * vy) / len2))
  return mix(lookOf(a), lookOf(b), t)
}
