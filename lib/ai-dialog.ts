import { callOpenAI } from "./openai-key"
import { collectFlags, type Dialog, type DialogChoice, type DialogLine, type GameEffect, type GameProject } from "./game-types"

/** Text model used to rewrite dialogs (OpenAI Responses API). */
export const AI_DIALOG_MODEL = "gpt-5.5"

const INSTRUCTIONS = `Eres guionista de aventuras gráficas point-and-click y editas UN diálogo de un juego.
Recibes el diálogo actual en JSON y una instrucción del autor. Devuelve SOLO un objeto JSON:
{"summary": "qué cambiaste, en una frase, en español", "lines": [ ...líneas... ]}

Formato de cada línea:
{"id": string, "speaker": string, "text": string,
 "effects"?: Effect[], "next"?: string | "end" | null,
 "showIf"?: {"kind":"flag"|"item","id":string,"negate"?:boolean} (la línea solo se muestra si se cumple; si no, se salta),
 "choices"?: [{"id": string, "text": string, "requiresFlag"?: string|null, "requiresItem"?: string|null,
               "once"?: boolean, "effects"?: Effect[], "next"?: string | "end" | null}]}
Effect es uno de:
{"type":"setFlag","flag":string,"value":boolean} | {"type":"giveItem","itemId":string} |
{"type":"removeItem","itemId":string} | {"type":"goToScene","sceneId":string} | {"type":"endGame","text"?:string}

Reglas:
- Conserva el "id" de las líneas y opciones que mantengas; usa ids nuevos y cortos para las nuevas.
- "next" apunta al id de otra línea del MISMO diálogo, o "end". Sin "next", una línea sigue con la siguiente.
- En una opción, "next" ausente significa terminar el diálogo.
- Usa solo itemId y sceneId de las listas del contexto. Las variables (flags) son nombres libres en snake_case; reutiliza las existentes cuando tenga sentido.
- IDIOMA: todo el texto que escribas (líneas, opciones y summary) va SIEMPRE en español latinoamericano neutro, aunque el diálogo actual o la instrucción estén en otro idioma: tuteo (tú, nunca vos ni vosotros), sin modismos regionales ni de España (nada de "vale", "tío", "coger", "ordenador", "chévere", "che", "wey"). Si un diálogo existente está en otro idioma, tradúcelo.
- Mantén el tono y los personajes salvo que la instrucción pida cambiarlos. Conserva los nombres propios de personajes.
- El protagonista (el personaje del jugador) se escribe SIEMPRE con speaker "@protagonista", nunca con su nombre; su nombre actual está en el contexto ("protagonist"). Para nombrarlo dentro de un texto escribe {protagonista}.
- No inventes mecánicas que el formato no soporta.`

export interface AiDialogResult {
  lines: DialogLine[]
  summary?: string
  /** references the model invented that were dropped */
  dropped: string[]
}

function contextFor(project: GameProject, dialog: Dialog) {
  return {
    dialog: { name: dialog.name, lines: dialog.lines },
    protagonist: project.character.name?.trim() || "Protagonista",
    items: project.items.map((i) => ({ id: i.id, name: i.name })),
    scenes: project.scenes.map((s) => ({ id: s.id, name: s.name })),
    flags: collectFlags(project),
    otherDialogs: project.dialogs.filter((d) => d.id !== dialog.id).map((d) => d.name),
  }
}

/** Extract the text output from a Responses API payload. */
function outputText(json: unknown): string {
  const j = json as { output_text?: string; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }
  if (typeof j.output_text === "string") return j.output_text
  for (const item of j.output ?? []) {
    for (const c of item.content ?? []) if (c.type === "output_text" && c.text) return c.text
  }
  throw new Error("La IA no devolvió texto")
}

export async function generateDialogVersion(opts: {
  project: GameProject
  dialog: Dialog
  prompt: string
}): Promise<AiDialogResult> {
  const res = await callOpenAI("responses", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_DIALOG_MODEL,
      instructions: INSTRUCTIONS,
      input: `Instrucción del autor:\n${opts.prompt.trim()}\n\nContexto (JSON):\n${JSON.stringify(contextFor(opts.project, opts.dialog))}`,
      text: { format: { type: "json_object" } },
    }),
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(outputText(await res.json()))
  } catch (err) {
    throw new Error(err instanceof Error ? `Respuesta de la IA inválida: ${err.message}` : "Respuesta de la IA inválida")
  }
  return sanitizeDialogLines(parsed, opts.project)
}

/**
 * Turn the model output into valid dialog lines: unique ids, jumps that point to existing
 * lines, effects that reference existing items/scenes. Anything invalid is dropped and reported.
 */
export function sanitizeDialogLines(raw: unknown, project: GameProject): AiDialogResult {
  const dropped: string[] = []
  const obj = raw as { lines?: unknown; summary?: unknown }
  if (!Array.isArray(obj?.lines) || obj.lines.length === 0) throw new Error("La IA no devolvió líneas de diálogo")

  const itemIds = new Set(project.items.map((i) => i.id))
  const sceneIds = new Set(project.scenes.map((s) => s.id))
  const str = (v: unknown) => (typeof v === "string" ? v : "")
  const used = new Set<string>()
  const uniqueId = (v: unknown) => {
    let id = str(v).trim()
    if (!id || used.has(id)) id = crypto.randomUUID()
    used.add(id)
    return id
  }

  const effects = (list: unknown): GameEffect[] | undefined => {
    if (!Array.isArray(list)) return undefined
    const out: GameEffect[] = []
    for (const e of list as Array<Record<string, unknown>>) {
      if (e?.type === "setFlag" && str(e.flag)) out.push({ type: "setFlag", flag: str(e.flag).replace(/\s+/g, "_"), value: e.value !== false })
      else if ((e?.type === "giveItem" || e?.type === "removeItem") && itemIds.has(str(e.itemId)))
        out.push({ type: e.type, itemId: str(e.itemId) })
      else if (e?.type === "goToScene" && sceneIds.has(str(e.sceneId))) out.push({ type: "goToScene", sceneId: str(e.sceneId) })
      else if (e?.type === "endGame") out.push({ type: "endGame", text: str(e.text) || undefined })
      else dropped.push(`efecto ${JSON.stringify(e)}`)
    }
    return out.length ? out : undefined
  }

  // First pass: ids, texts, effects. Jumps are fixed once every line id is known.
  const rawLines = obj.lines as Array<Record<string, unknown>>
  const lines: DialogLine[] = rawLines.map((l) => ({
    id: uniqueId(l?.id),
    speaker: str(l?.speaker),
    text: str(l?.text),
    effects: effects(l?.effects),
    next: (l?.next as string | null | undefined) ?? null,
    showIf: (() => {
      const c = l?.showIf as Record<string, unknown> | null | undefined
      if (!c || !str(c.id)) return undefined
      if (c.kind === "item" && !itemIds.has(str(c.id))) return undefined
      return { kind: c.kind === "item" ? ("item" as const) : ("flag" as const), id: str(c.id).replace(/\s+/g, "_"), negate: c.negate === true || undefined }
    })(),
    choices: Array.isArray(l?.choices)
      ? (l.choices as Array<Record<string, unknown>>).map(
          (c): DialogChoice => ({
            id: uniqueId(c?.id),
            text: str(c?.text),
            requiresFlag: str(c?.requiresFlag) || null,
            requiresItem: itemIds.has(str(c?.requiresItem)) ? str(c?.requiresItem) : null,
            once: c?.once === true || undefined,
            effects: effects(c?.effects),
            next: (c?.next as string | null | undefined) ?? "end",
          }),
        )
      : undefined,
  }))

  const lineIds = new Set(lines.map((l) => l.id))
  const fixNext = (n: unknown, fallback: "end" | null) => {
    if (n === "end" || n == null) return n === "end" ? "end" : fallback
    if (typeof n === "string" && lineIds.has(n)) return n
    dropped.push(`salto a «${String(n)}»`)
    return fallback
  }
  for (const l of lines) {
    l.next = fixNext(l.next, null)
    if (l.choices?.length === 0) l.choices = undefined
    l.choices?.forEach((c) => (c.next = fixNext(c.next, "end")))
  }

  return { lines, summary: str(obj.summary) || undefined, dropped }
}
