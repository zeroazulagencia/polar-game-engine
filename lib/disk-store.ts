import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

/**
 * Projects stored as files in the repo (data/), so they travel with git instead of living
 * in one browser's IndexedDB:
 *
 *   data/projects/index.json              open project + order of the saved list
 *   data/projects/<id>/project.json       the saved project
 *   data/projects/<id>/draft.json         unsaved working copy (gitignored)
 *   data/projects/<id>/assets/<hash>.png  every embedded data URL, as a real file
 *
 * In the JSON a data URL is replaced by "file:assets/<hash>.<ext>" and inlined back on read,
 * so the app keeps seeing exactly the project it saved.
 */
const DATA_DIR = path.join(process.cwd(), "data")
const PROJECTS_DIR = path.join(DATA_DIR, "projects")
const INDEX_FILE = path.join(PROJECTS_DIR, "index.json")
const TRASH_DIR = path.join(DATA_DIR, ".trash")
const FILE_PREFIX = "file:"

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a",
  "video/mp4": "mp4",
  // after x-m4a: m4a files read back as audio/mp4
  "audio/mp4": "m4a",
}
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]))
const DATA_URL = /^data:([^;,]+);base64,/

type Json = unknown
interface ProjectLike {
  id: string
  name?: string
}

/** Project ids come from the client: only allow plain id characters as folder names. */
function projectDir(id: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`id de proyecto inválido: ${id}`)
  return path.join(PROJECTS_DIR, id)
}

/** Write through a temp file so a crash never leaves a half-written JSON. */
function writeAtomic(file: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, "utf8")) as T
}

/** Replace every data URL in `value` by a file reference, writing the file if it is new. */
function extractFiles(value: Json, dir: string): Json {
  if (typeof value === "string") {
    const m = DATA_URL.exec(value)
    const ext = m && EXT_BY_MIME[m[1]]
    if (!m || !ext) return value
    const b64 = value.slice(m[0].length)
    const name = `${createHash("sha1").update(b64).digest("hex").slice(0, 16)}.${ext}`
    const file = path.join(dir, "assets", name)
    if (!fs.existsSync(file)) writeAtomic(file, Buffer.from(b64, "base64"))
    return `${FILE_PREFIX}assets/${name}`
  }
  if (Array.isArray(value)) return value.map((v) => extractFiles(v, dir))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, extractFiles(v, dir)]))
  }
  return value
}

/** Inverse of extractFiles. A missing file is left as its reference instead of failing the load. */
function inlineFiles(value: Json, dir: string): Json {
  if (typeof value === "string") {
    if (!value.startsWith(`${FILE_PREFIX}assets/`)) return value
    const rel = value.slice(FILE_PREFIX.length)
    const mime = MIME_BY_EXT[path.extname(rel).slice(1)]
    const file = path.join(dir, rel)
    if (!mime || !fs.existsSync(file)) return value
    return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`
  }
  if (Array.isArray(value)) return value.map((v) => inlineFiles(v, dir))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, inlineFiles(v, dir)]))
  }
  return value
}

function collectRefs(value: Json, out: Set<string>) {
  if (typeof value === "string") {
    if (value.startsWith(`${FILE_PREFIX}assets/`)) out.add(path.basename(value))
  } else if (Array.isArray(value)) value.forEach((v) => collectRefs(v, out))
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectRefs(v, out))
}

/** Remove asset files that neither the saved project nor its draft use any more. */
function pruneAssets(dir: string) {
  const assetsDir = path.join(dir, "assets")
  if (!fs.existsSync(assetsDir)) return
  const used = new Set<string>()
  for (const f of ["project.json", "draft.json"]) collectRefs(readJson(path.join(dir, f)), used)
  for (const name of fs.readdirSync(assetsDir)) {
    if (!used.has(name)) fs.rmSync(path.join(assetsDir, name))
  }
}

function writeProjectFile(project: ProjectLike, file: "project.json" | "draft.json") {
  const dir = projectDir(project.id)
  writeAtomic(path.join(dir, file), JSON.stringify(extractFiles(project, dir), null, 2) + "\n")
}

/** Deleted projects go to data/.trash instead of disappearing. */
function trashProject(id: string) {
  const dir = projectDir(id)
  if (!fs.existsSync(dir)) return
  fs.mkdirSync(TRASH_DIR, { recursive: true })
  fs.renameSync(dir, path.join(TRASH_DIR, `${id}-${Date.now()}`))
}

interface IndexFile {
  currentId: string | null
  projects: { id: string; name?: string }[]
}

export function readProjects() {
  const index = readJson<IndexFile>(INDEX_FILE)
  if (!index) return { initialized: false, projects: [], currentId: null }
  const projects = index.projects.flatMap(({ id }) => {
    const dir = projectDir(id)
    const p = readJson(path.join(dir, "project.json"))
    return p ? [inlineFiles(p, dir)] : []
  })
  return { initialized: true, projects, currentId: index.currentId }
}

/** `changed` are the projects whose content differs from disk; `ids` is the full saved list. */
export function writeProjects(ids: string[], currentId: string | null, changed: ProjectLike[]) {
  for (const p of changed) {
    writeProjectFile(p, "project.json")
    pruneAssets(projectDir(p.id))
  }
  const previous = readJson<IndexFile>(INDEX_FILE)
  const keep = new Set(ids)
  for (const { id } of previous?.projects ?? []) if (!keep.has(id)) trashProject(id)
  const names = new Map(changed.map((p) => [p.id, p.name]))
  const oldNames = new Map((previous?.projects ?? []).map((p) => [p.id, p.name]))
  const index: IndexFile = { currentId, projects: ids.map((id) => ({ id, name: names.get(id) ?? oldNames.get(id) })) }
  writeAtomic(INDEX_FILE, JSON.stringify(index, null, 2) + "\n")
}

function draftDirs() {
  if (!fs.existsSync(PROJECTS_DIR)) return []
  return fs
    .readdirSync(PROJECTS_DIR)
    .map((name) => path.join(PROJECTS_DIR, name))
    .filter((dir) => fs.existsSync(path.join(dir, "draft.json")))
}

export function readDraft() {
  const dir = draftDirs()[0]
  return dir ? inlineFiles(readJson(path.join(dir, "draft.json")), dir) : null
}

/** There is one working copy at a time: writing it drops any other draft. */
export function writeDraft(project: ProjectLike | null) {
  for (const dir of draftDirs()) {
    if (project && path.basename(dir) === project.id) continue
    fs.rmSync(path.join(dir, "draft.json"))
    // A never-saved project has nothing else worth keeping in its folder.
    if (fs.existsSync(path.join(dir, "project.json"))) pruneAssets(dir)
    else fs.rmSync(dir, { recursive: true, force: true })
  }
  if (project) writeProjectFile(project, "draft.json")
}

const TRACKER_FILE = path.join(DATA_DIR, "tracker.json")

export function readTracker() {
  return readJson<Json[]>(TRACKER_FILE)
}

export function writeTracker(items: Json[]) {
  writeAtomic(TRACKER_FILE, JSON.stringify(items, null, 2) + "\n")
}
