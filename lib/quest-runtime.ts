import type { Quest, QuestCondition } from "./game-types"

export interface QuestWorld {
  flags: Record<string, boolean>
  inventory: string[]
  visitedScenes: string[]
}

export function conditionMet(cond: QuestCondition, world: QuestWorld): boolean {
  switch (cond.type) {
    case "flag":
      return !!cond.flag && !!world.flags[cond.flag]
    case "item":
      return world.inventory.includes(cond.itemId)
    case "scene":
      return world.visitedScenes.includes(cond.sceneId)
  }
}

export function questStarted(quest: Quest, world: QuestWorld): boolean {
  return !quest.startFlag || !!world.flags[quest.startFlag]
}

/**
 * Steps already done stay done (`latched`), so e.g. using up an item later
 * doesn't un-complete the step that asked for it.
 */
export function stepDone(stepId: string, quest: Quest, world: QuestWorld, latched: string[]): boolean {
  if (latched.includes(stepId)) return true
  const step = quest.steps.find((s) => s.id === stepId)
  return !!step && conditionMet(step.when, world)
}
