import type { GameProject } from "./game-types"

/** Assets and sounds actually referenced by the game (the library may hold unused drafts). */
export function pruneForExport(project: GameProject): GameProject {
  const assetIds = new Set<string>()
  const soundIds = new Set<string>()
  const add = (set: Set<string>, id?: string | null) => id && set.add(id)

  add(assetIds, project.character.idleAssetId)
  add(assetIds, project.inventoryIconAssetId)
  project.character.walkAssetIds.forEach((id) => add(assetIds, id))
  for (const anim of Object.values(project.character.directions ?? {})) {
    add(assetIds, anim?.idleAssetId)
    anim?.walkAssetIds.forEach((id) => add(assetIds, id))
  }
  add(soundIds, project.pickupSoundId)
  add(soundIds, project.doorSoundId)
  project.items.forEach((it) => {
    add(assetIds, it.assetId)
    add(soundIds, it.useSoundId)
  })
  for (const sc of project.scenes) {
    add(assetIds, sc.backgroundAssetId)
    add(soundIds, sc.ambientSoundId)
    add(soundIds, sc.musicTrackId)
    for (const o of sc.sceneObjects ?? []) {
      add(assetIds, o.assetId)
      add(soundIds, o.sfxId)
      add(soundIds, o.action?.sfxId)
    }
    for (const h of sc.hotspots) add(soundIds, h.action.sfxId)
  }

  return {
    ...project,
    assets: project.assets.filter((a) => assetIds.has(a.id)),
    sounds: (project.sounds ?? []).filter((s) => soundIds.has(s.id)),
  }
}

/** CSS currently loaded by the app (Tailwind output); the player uses the same classes. */
function collectAppCss(): string {
  const parts: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      parts.push(Array.from(sheet.cssRules, (r) => r.cssText).join("\n"))
    } catch {
      // cross-origin stylesheet (e.g. fonts): not needed by the player
    }
  }
  return parts.join("\n")
}

/** The app's own font files (public/fonts) as data: URLs, so the standalone file shows them offline. */
async function inlineOwnFonts(css: string): Promise<string> {
  const urls = [...new Set(Array.from(css.matchAll(/url\(["']?(\/fonts\/[^"')]+)["']?\)/g), (m) => m[1]))]
  for (const url of urls) {
    const res = await fetch(url)
    if (!res.ok) continue
    const bytes = new Uint8Array(await res.arrayBuffer())
    let bin = ""
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    css = css.split(url).join(`data:font/woff2;base64,${btoa(bin)}`)
  }
  return css
}

/** Inline <script>/<style> content must not contain a closing tag. */
const escapeForScript = (text: string) => text.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--")

export async function buildStandaloneHtml(project: GameProject): Promise<{ html: string; bytes: number }> {
  const res = await fetch("/player.js", { cache: "no-store" })
  if (!res.ok) throw new Error("No se encontró el reproductor (public/player.js). Ejecuta `npm run build:player`.")
  const playerJs = await res.text()

  const game = pruneForExport(project)
  // JSON inside <script type="application/json">: escaping "<" keeps it inert and valid JSON.
  const json = JSON.stringify(game).replace(/</g, "\\u003c")
  const title = game.name.replace(/[<>&"]/g, "")
  const css = await inlineOwnFonts(collectAppCss())

  const html = `<!doctype html>
<html lang="es" class="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="Polar Game Engine" />
<title>${title}</title>
<style>${escapeForScript(css)}</style>
<style>html,body,#pixelquest-root{height:100%;margin:0}body{background:#000;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}</style>
</head>
<body>
<div id="pixelquest-root"></div>
<script type="application/json" id="pixelquest-project">${json}</script>
<script>${escapeForScript(playerJs)}</script>
</body>
</html>
`
  return { html, bytes: new Blob([html]).size }
}

export async function downloadStandaloneGame(project: GameProject, filenameBase: string) {
  const { html, bytes } = await buildStandaloneHtml(project)
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${filenameBase}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return bytes
}

export type PackageTarget = "windows" | "mac" | "linux" | "android"

/**
 * The game as an app: the same HTML, packaged on this machine by the editor's server
 * (app/api/package → scripts/package-game.mjs). Returns the paths of the files it made.
 */
export async function packageGame(project: GameProject, target: PackageTarget) {
  const { html } = await buildStandaloneHtml(project)
  let res: Response
  try {
    res = await fetch("/api/package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, name: project.name, html }),
    })
  } catch {
    throw new Error("No se pudo conectar con el servidor del editor. ¿Está corriendo `npm run dev`?")
  }
  const body = (await res.json()) as { files?: string[]; androidProjectOnly?: boolean; error?: string }
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  return { files: body.files ?? [], androidProjectOnly: !!body.androidProjectOnly }
}
