import type { Asset, GameProject } from "./game-types"
import { isContentPack, type ContentPack } from "./content-pack"

export function slugifyName(value: string) {
  const cleaned = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
  return cleaned || "pixelquest-project"
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-")

export function exportProjectJson(project: GameProject) {
  downloadJson(`${slugifyName(project.name)}-project-${stamp()}.json`, {
    schema: "pixelquest-project-v1",
    exportedAt: Date.now(),
    project,
  })
}

export function exportAssetsJson(project: GameProject) {
  downloadJson(`${slugifyName(project.name)}-assets-${stamp()}.json`, {
    schema: "pixelquest-assets-v1",
    exportedAt: Date.now(),
    projectId: project.id,
    projectName: project.name,
    assets: project.assets,
  })
}

export type ImportedFile =
  | { kind: "project"; project: GameProject }
  | { kind: "assets"; assets: Asset[] }
  | { kind: "content"; pack: ContentPack }

/** Parse a JSON exported by this editor (a whole project or an assets pack). */
export async function readImportFile(file: File): Promise<ImportedFile> {
  const parsed = JSON.parse(await file.text())

  if (isContentPack(parsed)) return { kind: "content", pack: parsed }

  if (parsed?.schema === "pixelquest-project-v1" && parsed?.project) {
    const project = parsed.project as GameProject
    if (!project.id) project.id = crypto.randomUUID()
    if (!project.name) project.name = `Importado ${new Date().toLocaleString()}`
    project.updatedAt = Date.now()
    return { kind: "project", project }
  }

  if (parsed?.schema === "pixelquest-assets-v1" && Array.isArray(parsed?.assets)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assets = parsed.assets.map((a: any): Asset => ({
      id: typeof a?.id === "string" ? a.id : crypto.randomUUID(),
      name: typeof a?.name === "string" ? a.name : "Imported Asset",
      kind: a?.kind === "background" || a?.kind === "sprite" || a?.kind === "object" ? a.kind : "object",
      dataUrl: typeof a?.dataUrl === "string" ? a.dataUrl : "",
      width: typeof a?.width === "number" ? a.width : 0,
      height: typeof a?.height === "number" ? a.height : 0,
    }))
    return { kind: "assets", assets }
  }

  throw new Error("JSON no reconocido. Usa un export de proyecto o de assets generado por este editor.")
}

/** Rough size of a project in MB (images and sounds dominate). */
export function projectSizeMB(project: GameProject) {
  const bytes =
    project.assets.reduce((n, a) => n + a.dataUrl.length, 0) +
    (project.sounds ?? []).reduce((n, s) => n + s.dataUrl.length, 0)
  return (bytes * 0.75) / 1e6
}
