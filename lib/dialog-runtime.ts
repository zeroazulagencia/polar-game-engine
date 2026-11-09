import type { Dialog, DialogChoice, DialogLine, DialogNext, LineCondition } from "./game-types"

export interface PlayerState {
  flags: Record<string, boolean>
  inventory: string[]
  /** ids of `once` choices already picked */
  usedChoices: string[]
  /** scene the player is in (for choices tied to a place) */
  sceneId?: string | null
}

/** Index of the line a jump lands on, or null when the dialog ends. */
export function resolveNext(dialog: Dialog, fromIdx: number, next: DialogNext | null | undefined): number | null {
  if (next === "end") return null
  if (next) {
    const idx = dialog.lines.findIndex((l) => l.id === next)
    return idx >= 0 ? idx : null
  }
  return fromIdx + 1 < dialog.lines.length ? fromIdx + 1 : null
}

/** Whether a line's `showIf` condition holds for the current state. */
export function isLineVisible(line: DialogLine, state: Pick<PlayerState, "flags" | "inventory">): boolean {
  return conditionHolds(line.showIf, state)
}

/** A flag/item condition (absent = always true). Also used for objects and hotspots that appear later. */
export function conditionHolds(c: LineCondition | null | undefined, state: Pick<PlayerState, "flags" | "inventory">): boolean {
  if (!c?.id) return true
  const has = c.kind === "item" ? state.inventory.includes(c.id) : !!state.flags[c.id]
  return c.negate ? !has : has
}

export function isChoiceAvailable(choice: DialogChoice, state: PlayerState): boolean {
  if (choice.once && state.usedChoices.includes(choice.id)) return false
  if (choice.requiresFlag && !state.flags[choice.requiresFlag]) return false
  if (choice.requiresItem && !state.inventory.includes(choice.requiresItem)) return false
  if (choice.requiresScene && state.sceneId !== choice.requiresScene) return false
  if (choice.hideInScene && state.sceneId === choice.hideInScene) return false
  return true
}

export function availableChoices(line: DialogLine | undefined, state: PlayerState): DialogChoice[] {
  return (line?.choices ?? []).filter((c) => isChoiceAvailable(c, state))
}
