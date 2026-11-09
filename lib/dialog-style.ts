import { DEFAULT_DIALOG_STYLE, type Dialog, type DialogStyle, type GameProject } from "./game-types"

const preset = (style: Partial<DialogStyle>): DialogStyle => ({ ...DEFAULT_DIALOG_STYLE, ...style })

/** Built-in looks; dialogs reference them as "preset:<id>". */
export const DIALOG_PRESETS: Array<{ id: string; name: string; style: DialogStyle }> = [
  { id: "classic", name: "Clásico", style: preset({}) },
  {
    id: "parchment",
    name: "Pergamino",
    style: preset({
      width: "wide",
      background: "#f3e5c0",
      backgroundOpacity: 0.96,
      border: "#8b6b3d",
      text: "#3b2a1a",
      speaker: "#7a3e12",
      choice: "#8b1e1e",
      font: "serif",
      fontSize: 16,
      radius: 6,
      margin: 16,
      padding: 18,
    }),
  },
  {
    id: "neon",
    name: "Neón",
    style: preset({
      width: "wide",
      background: "#0b0b1a",
      backgroundOpacity: 0.85,
      border: "#22d3ee",
      text: "#e0f2fe",
      speaker: "#f472b6",
      choice: "#a3e635",
      font: "mono",
      fontSize: 14,
      radius: 10,
      margin: 16,
      padding: 16,
      typewriterSpeed: 45,
    }),
  },
  {
    id: "minimal",
    name: "Minimal",
    style: preset({
      width: "narrow",
      background: "#000000",
      backgroundOpacity: 0.6,
      border: "#ffffff",
      text: "#ffffff",
      speaker: "#cbd5e1",
      choice: "#fbbf24",
      font: "sans",
      fontSize: 14,
      radius: 14,
      margin: 24,
      padding: 14,
    }),
  },
  {
    id: "retro",
    name: "Retro 8-bit",
    style: preset({
      background: "#1e3a8a",
      backgroundOpacity: 0.97,
      border: "#fde047",
      text: "#ffffff",
      speaker: "#fde047",
      choice: "#fde047",
      font: "mono",
      fontSize: 15,
      radius: 0,
      margin: 8,
      padding: 16,
      typewriterSpeed: 35,
    }),
  },
]

export const PRESET_PREFIX = "preset:"

/** The style a dialog plays with: its own choice, else the project default. */
export function resolveDialogStyle(project: GameProject, dialog?: Dialog | null): DialogStyle {
  const id = dialog?.styleId
  if (id?.startsWith(PRESET_PREFIX)) {
    const p = DIALOG_PRESETS.find((x) => PRESET_PREFIX + x.id === id)
    if (p) return p.style
  } else if (id) {
    const custom = project.dialogStyles?.find((s) => s.id === id)
    if (custom) return { ...DEFAULT_DIALOG_STYLE, ...custom.style }
  }
  return { ...DEFAULT_DIALOG_STYLE, ...project.dialogStyle }
}

/** Human name of a dialog's style (for selects and badges). */
export function dialogStyleName(project: GameProject, styleId?: string | null): string {
  if (!styleId) return "Predeterminado del proyecto"
  if (styleId.startsWith(PRESET_PREFIX)) return DIALOG_PRESETS.find((p) => PRESET_PREFIX + p.id === styleId)?.name ?? "—"
  return project.dialogStyles?.find((s) => s.id === styleId)?.name ?? "Predeterminado del proyecto"
}
