import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import type { NextRequest } from "next/server"

/**
 * Packages the exported game for desktop or Android with scripts/package-game.mjs and returns
 * what it made (in the repo's dist/ folder). Only meant for running the editor on your own
 * machine, like the rest of /api.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// the first run of a target downloads Electron or Capacitor
export const maxDuration = 900

const TARGETS = new Set(["windows", "mac", "linux", "android"])

export async function POST(req: NextRequest) {
  const { target, name, html } = (await req.json()) as { target?: string; name?: string; html?: string }
  if (!target || !TARGETS.has(target)) return Response.json({ error: `Destino no válido: ${target}` }, { status: 400 })
  if (!html || !name) return Response.json({ error: "Falta el juego." }, { status: 400 })

  const root = path.resolve(/*turbopackIgnore: true*/ process.cwd())
  const out = path.join(/*turbopackIgnore: true*/ root, "dist")
  const tmp = path.join(/*turbopackIgnore: true*/ out, ".tmp")
  fs.mkdirSync(tmp, { recursive: true })
  const htmlFile = path.join(/*turbopackIgnore: true*/ tmp, `juego-${Date.now()}.html`)
  fs.writeFileSync(htmlFile, html)

  const args = [path.join(/*turbopackIgnore: true*/ root, "scripts", "package-game.mjs"), htmlFile, "--target", target, "--name", name, "--out", out]
  const { code, log } = await new Promise<{ code: number | null; log: string }>((resolve) => {
    let log = ""
    // no shell: the name goes as a plain argument
    const child = spawn(process.execPath, args, { cwd: root })
    child.stdout.on("data", (d) => (log += d))
    child.stderr.on("data", (d) => (log += d))
    child.on("close", (code) => resolve({ code, log }))
    child.on("error", (err) => resolve({ code: 1, log: log + String(err) }))
  })
  fs.rmSync(htmlFile, { force: true })

  if (code !== 0) {
    const reason = log.match(/✗ (.*)/)?.[1] ?? log.trim().split("\n").slice(-3).join("\n")
    return Response.json({ error: reason || "No se pudo empaquetar." }, { status: 500 })
  }
  const files = JSON.parse(log.match(/POLAR_RESULT (.*)/)?.[1] ?? "[]") as string[]
  const androidProjectOnly = target === "android" && files.some((f) => !f.endsWith(".apk"))

  // Show the result in Finder / Explorer / the file manager.
  const opener = { darwin: "open", win32: "explorer", linux: "xdg-open" }[process.platform as string]
  if (opener && files[0]) {
    const reveal = process.platform === "darwin" ? ["-R", files[0]] : [path.dirname(files[0])]
    spawn(opener, reveal, { detached: true, stdio: "ignore" }).unref()
  }
  return Response.json({ files: files.map((f) => path.relative(root, f)), androidProjectOnly })
}
