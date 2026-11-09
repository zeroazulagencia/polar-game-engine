import type { Point, WalkableArea } from "./game-types"

/**
 * Check if a point is inside a polygon using ray casting algorithm.
 * Works with both convex and concave polygons.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false

  let inside = false
  const n = polygon.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y

    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Check if a point is inside a walkable area (inside boundary but outside holes).
 */
export function pointInWalkableArea(point: Point, area: WalkableArea): boolean {
  // Must be inside the boundary
  if (!pointInPolygon(point, area.points)) return false

  // Must NOT be inside any hole
  if (area.holes) {
    for (const hole of area.holes) {
      if (pointInPolygon(point, hole)) return false
    }
  }

  return true
}

/**
 * Check if a point is walkable in any of the walkable areas.
 */
export function isPointWalkable(point: Point, areas: WalkableArea[]): boolean {
  if (areas.length === 0) return true // No restrictions if no walkable areas defined
  return areas.some((area) => pointInWalkableArea(point, area))
}

/**
 * Get the center point of a polygon.
 */
export function getPolygonCenter(points: Point[]): Point {
  if (points.length === 0) return { x: 0.5, y: 0.5 }

  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  )

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  }
}

/**
 * Calculate distance between two points.
 */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Find the closest point on a line segment to a given point.
 */
function closestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) return a

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))

  return {
    x: a.x + t * dx,
    y: a.y + t * dy,
  }
}

/**
 * Find the closest walkable point to a given target.
 * If target is already walkable, returns target.
 * Otherwise, finds the nearest point on the walkable area boundary.
 */
export function findNearestWalkablePoint(
  target: Point,
  areas: WalkableArea[]
): Point {
  // If no areas defined or target is already walkable, return target
  if (areas.length === 0 || isPointWalkable(target, areas)) {
    return target
  }

  let closestPoint = target
  let closestDist = Infinity

  // Check all walkable area boundaries
  for (const area of areas) {
    const points = area.points
    const n = points.length

    // Check each edge of the polygon
    for (let i = 0; i < n; i++) {
      const a = points[i]
      const b = points[(i + 1) % n]
      const candidate = closestPointOnSegment(target, a, b)

      // Verify the candidate is actually walkable (slightly inside the polygon)
      const nudgedPoint = nudgePointInward(candidate, area.points, 0.001)
      if (pointInWalkableArea(nudgedPoint, area)) {
        const dist = distance(target, candidate)
        if (dist < closestDist) {
          closestDist = dist
          closestPoint = nudgedPoint
        }
      }
    }
  }

  return closestPoint
}

/**
 * Nudge a point slightly inward from the polygon edge.
 */
function nudgePointInward(point: Point, polygon: Point[], amount: number): Point {
  const center = getPolygonCenter(polygon)
  const dx = center.x - point.x
  const dy = center.y - point.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist === 0) return point

  return {
    x: point.x + (dx / dist) * amount,
    y: point.y + (dy / dist) * amount,
  }
}

/**
 * Convert a rectangle (legacy hotspot format) to polygon points.
 */
export function rectToPolygon(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

/**
 * Get bounding box of a polygon.
 */
export function getPolygonBounds(points: Point[]): {
  x: number
  y: number
  width: number
  height: number
} {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Generate SVG path data from polygon points.
 */
export function polygonToSvgPath(points: Point[], stageW: number, stageH: number): string {
  if (points.length < 2) return ""

  const commands = points.map((p, i) => {
    const cmd = i === 0 ? "M" : "L"
    return `${cmd} ${p.x * stageW} ${p.y * stageH}`
  })

  return commands.join(" ") + " Z"
}
