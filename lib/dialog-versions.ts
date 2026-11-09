import type { Dialog, DialogLine, DialogVersion, DialogVersionMeta } from "./game-types"

export function activeMeta(dialog: Dialog): DialogVersionMeta {
  return dialog.activeVersion ?? { id: "original", label: "Original", createdAt: 0, source: "manual" }
}

/** Store `lines` as a new inactive version. */
export function addVersion(
  dialog: Dialog,
  lines: DialogLine[],
  meta: Omit<DialogVersionMeta, "id" | "createdAt">,
): { dialog: Dialog; version: DialogVersion } {
  const version: DialogVersion = { ...meta, id: crypto.randomUUID(), createdAt: Date.now(), lines }
  return { dialog: { ...dialog, versions: [version, ...(dialog.versions ?? [])] }, version }
}

/** Make an inactive version active; the currently active one becomes inactive (nothing is lost). */
export function activateVersion(dialog: Dialog, versionId: string): Dialog {
  const target = dialog.versions?.find((v) => v.id === versionId)
  if (!target) return dialog
  const { lines, ...meta } = target
  const previous: DialogVersion = { ...activeMeta(dialog), lines: dialog.lines }
  return {
    ...dialog,
    lines,
    activeVersion: meta,
    versions: [previous, ...(dialog.versions ?? []).filter((v) => v.id !== versionId)],
  }
}

export function deleteVersion(dialog: Dialog, versionId: string): Dialog {
  return { ...dialog, versions: (dialog.versions ?? []).filter((v) => v.id !== versionId) }
}
