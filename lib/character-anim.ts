import type { Character, CharacterDirection } from "./game-types"

export const DEFAULT_VERTICAL_ANGLE = 55

/**
 * Direction of a movement vector. Mostly-horizontal moves (small angles) stay left/right;
 * only moves steeper than `verticalAngle` degrees switch to up/down.
 * Screen coordinates: dy < 0 is up (away from the camera).
 */
export function directionFromVector(dx: number, dy: number, verticalAngle = DEFAULT_VERTICAL_ANGLE): CharacterDirection {
  const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI
  if (angle > verticalAngle) return dy < 0 ? "up" : "down"
  return dx >= 0 ? "right" : "left"
}

export interface ResolvedAnimation {
  idleAssetId: string | null
  /** draw the idle sprite flipped horizontally */
  idleMirror: boolean
  walkAssetIds: string[]
  /** draw the walk frames flipped horizontally (left reusing the right-facing frames) */
  walkMirror: boolean
}

/**
 * Frames to use for a direction, with fallbacks: left without its own animation mirrors
 * right; up/down without their own idle or walk use the side view of the last
 * horizontal direction for the missing part.
 */
export function resolveAnimation(
  character: Character,
  dir: CharacterDirection,
  lastHorizontal: "right" | "left" = "right",
): ResolvedAnimation {
  const right: ResolvedAnimation = {
    idleAssetId: character.idleAssetId,
    idleMirror: false,
    walkAssetIds: character.walkAssetIds,
    walkMirror: false,
  }
  if (dir === "right") return right

  const own = character.directions?.[dir]
  const fallback: ResolvedAnimation =
    dir === "left" ? { ...right, idleMirror: true, walkMirror: true } : resolveAnimation(character, lastHorizontal)

  return {
    idleAssetId: own?.idleAssetId ?? fallback.idleAssetId,
    idleMirror: own?.idleAssetId ? false : fallback.idleMirror,
    walkAssetIds: own?.walkAssetIds.length ? own.walkAssetIds : fallback.walkAssetIds,
    walkMirror: own?.walkAssetIds.length ? false : fallback.walkMirror,
  }
}
