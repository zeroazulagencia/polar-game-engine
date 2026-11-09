import type { DialogLine, GameProject } from "./game-types"

/**
 * Dialog lines spoken by the player character store this token as `speaker` instead of a
 * name, and texts can mention `{protagonista}`: both resolve to `character.name` when shown,
 * so renaming the protagonist in Personaje updates every dialog at once.
 */
export const PLAYER_SPEAKER = "@protagonista"
export const PLAYER_NAME_TAG = "{protagonista}"

export function protagonistName(project: GameProject) {
  return project.character.name?.trim() || "Protagonista"
}

/** Name shown for a line's speaker. */
export function displaySpeaker(project: GameProject, speaker: string) {
  return speaker === PLAYER_SPEAKER ? protagonistName(project) : speaker
}

/** Line text with `{protagonista}` replaced by the current name. */
export function fillPlayerName(project: GameProject, text: string) {
  return text.replace(/\{protagonista\}/gi, protagonistName(project))
}

/** Speakers written as plain names (not the protagonist token), with how many lines use each. */
export function namedSpeakers(project: GameProject): Array<{ name: string; count: number }> {
  const map = new Map<string, { name: string; count: number }>()
  for (const d of project.dialogs)
    for (const l of d.lines) {
      const name = l.speaker.trim()
      if (!name || name === PLAYER_SPEAKER) continue
      const key = name.toLowerCase()
      const e = map.get(key) ?? { name, count: 0 }
      e.count++
      map.set(key, e)
    }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/**
 * Turn every line whose speaker is one of `names` (case-insensitive) into the protagonist,
 * in the active and the stored versions of every dialog.
 */
export function linkSpeakersToPlayer(project: GameProject, names: string[]): GameProject {
  const keys = new Set(names.map((n) => n.trim().toLowerCase()))
  const fix = (lines: DialogLine[]) =>
    lines.map((l) => (keys.has(l.speaker.trim().toLowerCase()) ? { ...l, speaker: PLAYER_SPEAKER } : l))
  // The protagonist keeps the name color those speakers had in each style.
  const moveColor = <S extends { speakerColors?: Record<string, string> }>(style: S): S => {
    const colors = { ...(style.speakerColors ?? {}) }
    const found = [...keys].map((k) => colors[k]).find(Boolean)
    if (!found) return style
    for (const k of keys) delete colors[k]
    colors[PLAYER_SPEAKER] ??= found
    return { ...style, speakerColors: colors }
  }
  return {
    ...project,
    dialogStyle: project.dialogStyle ? moveColor(project.dialogStyle) : project.dialogStyle,
    dialogStyles: project.dialogStyles?.map((c) => ({ ...c, style: moveColor(c.style) })),
    dialogs: project.dialogs.map((d) => ({
      ...d,
      lines: fix(d.lines),
      versions: d.versions?.map((v) => ({ ...v, lines: fix(v.lines) })),
    })),
  }
}
