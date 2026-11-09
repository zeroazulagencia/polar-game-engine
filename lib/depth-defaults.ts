import type { DepthWaypoint } from "./game-types"

/** The look of a depth point: what a new point copies. */
export type WaypointLook = Pick<DepthWaypoint, "scale" | "brightness" | "tint" | "tintStrength">

// Last point edited, per scene (the editor keeps it while the page is open).
const lastEdited = new Map<string, WaypointLook>()

const lookOf = (w: DepthWaypoint): WaypointLook => ({
  scale: w.scale,
  brightness: w.brightness,
  tint: w.tint,
  tintStrength: w.tintStrength,
})

/** Call after editing a point's size or lighting. */
export function rememberWaypointLook(sceneId: string, w: DepthWaypoint) {
  lastEdited.set(sceneId, lookOf(w))
}

/**
 * Look for a new point in a scene: the last point edited there; if none was edited yet, the
 * selected one, else the last point of the scene; with no points, full size.
 */
export function newWaypointLook(sceneId: string, waypoints: DepthWaypoint[], selectedId?: string | null): WaypointLook {
  const remembered = lastEdited.get(sceneId)
  if (remembered) return { ...remembered }
  const base = waypoints.find((w) => w.id === selectedId) ?? waypoints[waypoints.length - 1]
  return base ? lookOf(base) : { scale: 1 }
}
