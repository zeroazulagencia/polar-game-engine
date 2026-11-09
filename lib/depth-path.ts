import type { Point } from "./game-types"

/** A depth waypoint as used for navigation: a node of the walk graph. */
export interface GraphNode {
  id: string
  x: number
  y: number
  links?: string[]
}

interface Projection {
  point: Point
  /** node indices of the edge the point lies on */
  a: number
  b: number
}

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y)

function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len2 = vx * vx + vy * vy
  if (len2 < 1e-12) return { x: a.x, y: a.y }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2))
  return { x: a.x + vx * t, y: a.y + vy * t }
}

/** Undirected edges [i, j] (i < j) from the nodes' links. */
export function graphEdges(nodes: GraphNode[]): Array<[number, number]> {
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const seen = new Set<string>()
  const edges: Array<[number, number]> = []
  nodes.forEach((n, i) => {
    for (const id of n.links ?? []) {
      const j = index.get(id)
      if (j == null || j === i) continue
      const [a, b] = i < j ? [i, j] : [j, i]
      const key = `${a}-${b}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([a, b])
    }
  })
  return edges
}

function project(p: Point, nodes: GraphNode[], edges: Array<[number, number]>): Projection {
  let best: Projection = { point: { x: nodes[edges[0][0]].x, y: nodes[edges[0][0]].y }, a: edges[0][0], b: edges[0][1] }
  let bestD = Number.POSITIVE_INFINITY
  for (const [a, b] of edges) {
    const q = closestOnSegment(p, nodes[a], nodes[b])
    const d = dist(p, q)
    if (d < bestD) {
      bestD = d
      best = { point: q, a, b }
    }
  }
  return best
}

/** Closest point of the walk graph to `p` (`p` itself when the scene has no graph). */
export function nearestOnGraph(nodes: GraphNode[], p: Point): Point {
  const edges = graphEdges(nodes)
  return edges.length ? project(p, nodes, edges).point : p
}

/**
 * Route for the character, Visionaire "way system" style: the click is projected onto
 * the nearest line of the depth graph and the character walks along the lines to it.
 * - No connected waypoints: free movement straight to `to`.
 * - Returns null when the destination can't be reached through the graph.
 * The returned points exclude `from` (the walker starts there).
 */
export function planRoute(nodes: GraphNode[], from: Point, to: Point): Point[] | null {
  const edges = graphEdges(nodes)
  if (edges.length === 0) return [to]

  const start = project(from, nodes, edges)
  const end = project(to, nodes, edges)

  let path: Point[]
  if (start.a === end.a && start.b === end.b) {
    path = [start.point, end.point]
  } else {
    // Dijkstra over the nodes plus two virtual nodes: S (start projection) and T (end projection).
    const n = nodes.length
    const S = n
    const T = n + 1
    const coords: Point[] = [...nodes.map((v) => ({ x: v.x, y: v.y })), start.point, end.point]
    const adj: Array<Array<{ to: number; w: number }>> = Array.from({ length: n + 2 }, () => [])
    const link = (i: number, j: number) => {
      const w = dist(coords[i], coords[j])
      adj[i].push({ to: j, w })
      adj[j].push({ to: i, w })
    }
    for (const [a, b] of edges) link(a, b)
    link(S, start.a)
    link(S, start.b)
    link(end.a, T)
    link(end.b, T)

    const best = new Array(n + 2).fill(Number.POSITIVE_INFINITY)
    const prev = new Array<number>(n + 2).fill(-1)
    const done = new Array<boolean>(n + 2).fill(false)
    best[S] = 0
    for (;;) {
      let v = -1
      for (let i = 0; i < n + 2; i++) if (!done[i] && best[i] < Number.POSITIVE_INFINITY && (v < 0 || best[i] < best[v])) v = i
      if (v < 0 || v === T) break
      done[v] = true
      for (const e of adj[v]) {
        if (best[v] + e.w < best[e.to]) {
          best[e.to] = best[v] + e.w
          prev[e.to] = v
        }
      }
    }
    if (best[T] === Number.POSITIVE_INFINITY) return null
    const order: number[] = []
    for (let v = T; v >= 0; v = prev[v]) order.unshift(v)
    path = order.map((i) => coords[i])
  }

  // Drop zero-length steps (e.g. the character already stands on the graph).
  const route: Point[] = []
  let last = from
  for (const p of path) {
    if (dist(p, last) > 1e-4) route.push(p)
    last = p
  }
  return route.length ? route : [end.point]
}
