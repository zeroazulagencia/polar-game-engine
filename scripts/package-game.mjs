#!/usr/bin/env node
// Turns an exported game (the single HTML from «Exportar juego (HTML)») into something to install:
//   windows  a folder with «<Name>.exe», zipped         (Electron)
//   mac      «<Name>.app», zipped (unsigned)             (Electron)
//   linux    a folder with the «<name>» executable, zipped (Electron)
//   android  an Android Studio project, plus a debug APK when Java and the Android SDK are installed (Capacitor)
//
//   node scripts/package-game.mjs <game.html> --target windows|mac|linux|android|all [--name "Mi juego"] [--id com.estudio.juego] [--out dist]
//
// The first run of each target downloads Electron (about 100 MB per system) or Capacitor; later runs reuse them.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ELECTRON_VERSION = "44.9.3"
const CAPACITOR_VERSION = "8.5.3"
const TARGETS = ["windows", "mac", "linux", "android"]

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const opts = { target: null, name: null, id: null, out: path.join(ROOT, "dist"), html: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--target") opts.target = argv[++i]
    else if (a === "--name") opts.name = argv[++i]
    else if (a === "--id") opts.id = argv[++i]
    else if (a === "--out") opts.out = path.resolve(argv[++i])
    else if (!a.startsWith("--")) opts.html = path.resolve(a)
    else fail(`Opción desconocida: ${a}`)
  }
  if (!opts.html) fail("Falta el archivo del juego: node scripts/package-game.mjs juego.html --target windows")
  if (!fs.existsSync(opts.html)) fail(`No existe ${opts.html}`)
  if (!opts.target || ![...TARGETS, "all"].includes(opts.target)) fail(`--target debe ser uno de: ${[...TARGETS, "all"].join(", ")}`)
  const html = fs.readFileSync(opts.html, "utf8")
  opts.name ||= html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() || path.basename(opts.html, ".html")
  opts.slug = slugify(opts.name)
  opts.id ||= `com.polar.${opts.slug.replace(/-/g, "")}`
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(opts.id))
    fail(`--id no es un identificador válido (ejemplo: com.estudio.juego): ${opts.id}`)
  return opts
}

function slugify(name) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "juego"
  )
}

/** File names can't carry these on Windows. */
const safeFileName = (name) => name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim() || "Juego"
/** Without accents: zip tools on Windows and Linux don't always read them right. */
const asciiName = (name) =>
  safeFileName(
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/\s+/g, " "),
  )

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" })
  if (res.status !== 0) fail(`Falló: ${cmd} ${args.join(" ")}`)
}

/** Zip a folder (or .app) keeping symlinks, which a .app needs. */
function zip(source, zipFile) {
  fs.rmSync(zipFile, { force: true })
  const parent = path.dirname(source)
  const base = path.basename(source)
  // ditto for a Mac app (it keeps what a .app needs); plain zip otherwise, without Mac-only extras
  if (process.platform === "darwin" && base.endsWith(".app")) run("ditto", ["-c", "-k", "--keepParent", base, zipFile], parent)
  else if (process.platform === "darwin") run("zip", ["-r", "-y", "-q", "-X", zipFile, base], parent)
  else if (process.platform === "win32")
    run("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${base}' -DestinationPath '${zipFile}' -Force`], parent)
  else run("zip", ["-r", "-y", "-q", zipFile, base], parent)
}

// --- Desktop (Electron) ---

const MAIN_JS = `const { app, BrowserWindow, shell } = require("electron")
const path = require("node:path")

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  win.removeMenu()
  win.once("ready-to-show", () => win.show())
  // F11 (or Alt+Enter) toggles full screen.
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return
    if (input.key === "F11" || (input.alt && input.key === "Enter")) {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    }
  })
  // Links to the web open in the player's browser, never inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: "deny" }
  })
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) event.preventDefault()
  })
  win.loadFile(path.join(__dirname, "game", "index.html"))
}

app.whenReady().then(createWindow)
app.on("window-all-closed", () => app.quit())
`

async function packageDesktop(opts, target) {
  let packager
  try {
    ;({ packager } = await import("@electron/packager"))
  } catch {
    fail("Falta @electron/packager. Corre `npm install` en la carpeta del motor.")
  }
  const platform = { windows: "win32", mac: "darwin", linux: "linux" }[target]
  const stage = path.join(opts.out, ".build", `${opts.slug}-desktop`)
  fs.rmSync(stage, { recursive: true, force: true })
  fs.mkdirSync(path.join(stage, "game"), { recursive: true })
  fs.copyFileSync(opts.html, path.join(stage, "game", "index.html"))
  fs.writeFileSync(path.join(stage, "main.js"), MAIN_JS)
  fs.writeFileSync(
    path.join(stage, "package.json"),
    // Windows needs an author for the .exe details.
    JSON.stringify(
      { name: opts.slug, productName: opts.name, version: "1.0.0", main: "main.js", author: opts.name, private: true },
      null,
      2,
    ),
  )

  // the Mac app keeps the real name; Windows and Linux files go without accents
  const productName = target === "mac" ? safeFileName(opts.name) : asciiName(opts.name)
  console.log(`\n→ ${target}: empaquetando «${productName}» con Electron ${ELECTRON_VERSION}…`)
  let appDir
  try {
    ;[appDir] = await packager({
      dir: stage,
      out: path.join(opts.out, ".build", target),
      name: productName,
      executableName: target === "linux" ? opts.slug : productName,
      appBundleId: opts.id,
      appVersion: "1.0.0",
      platform,
      // Macs: Apple chips and Intel in one app.
      arch: target === "mac" ? "universal" : "x64",
      electronVersion: ELECTRON_VERSION,
      asar: true,
      overwrite: true,
      prune: false,
      quiet: true,
      win32metadata: { ProductName: opts.name, FileDescription: opts.name, CompanyName: opts.name },
    })
  } catch (err) {
    fail(`No se pudo empaquetar para ${target}: ${err instanceof Error ? err.message : err}`)
  }
  let source = target === "mac" ? path.join(appDir, `${productName}.app`) : appDir
  if (target !== "mac") {
    // «Mi juego-win32-x64» → «Mi juego»: the folder the player unzips
    const tidy = path.join(path.dirname(appDir), productName)
    fs.rmSync(tidy, { recursive: true, force: true })
    fs.renameSync(appDir, tidy)
    source = tidy
  }
  const zipFile = path.join(opts.out, `${opts.slug}-${target}.zip`)
  zip(source, zipFile)
  console.log(`✓ ${zipFile}`)
  return zipFile
}

// --- Android (Capacitor) ---

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"),
  ]
  return candidates.find((p) => p && fs.existsSync(p)) ?? null
}

function hasJava() {
  return spawnSync("java", ["-version"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0
}

function packageAndroid(opts) {
  const project = path.join(opts.out, `${opts.slug}-android`)
  console.log(`\n→ android: proyecto de Android Studio con Capacitor ${CAPACITOR_VERSION}…`)
  fs.mkdirSync(path.join(project, "www"), { recursive: true })
  fs.copyFileSync(opts.html, path.join(project, "www", "index.html"))
  fs.writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify(
      {
        name: opts.slug,
        version: "1.0.0",
        private: true,
        dependencies: {
          "@capacitor/android": CAPACITOR_VERSION,
          "@capacitor/cli": CAPACITOR_VERSION,
          "@capacitor/core": CAPACITOR_VERSION,
        },
      },
      null,
      2,
    ),
  )
  fs.writeFileSync(
    path.join(project, "capacitor.config.json"),
    JSON.stringify({ appId: opts.id, appName: opts.name, webDir: "www", android: { backgroundColor: "#000000" } }, null, 2),
  )
  run("npm", ["install", "--no-audit", "--no-fund"], project)
  if (!fs.existsSync(path.join(project, "android"))) run("npx", ["cap", "add", "android"], project)
  run("npx", ["cap", "sync", "android"], project)

  // Landscape and full screen: adventure games are wide.
  const manifest = path.join(project, "android", "app", "src", "main", "AndroidManifest.xml")
  let xml = fs.readFileSync(manifest, "utf8")
  if (!xml.includes("android:screenOrientation")) {
    xml = xml.replace("<activity", '<activity\n            android:screenOrientation="sensorLandscape"')
  }
  fs.writeFileSync(manifest, xml)

  const sdk = findAndroidSdk()
  if (!sdk || !hasJava()) {
    console.log(`✓ Proyecto listo en ${path.join(project, "android")}`)
    console.log(
      "  Para sacar el APK: instala Android Studio, abre esa carpeta android y usa Build → Generate App Bundles or APKs → Generate APKs.",
    )
    return path.join(project, "android")
  }
  fs.writeFileSync(path.join(project, "android", "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "\\\\")}\n`)
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew"
  run(gradlew, ["assembleDebug", "--quiet"], path.join(project, "android"))
  const apk = path.join(project, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")
  const outApk = path.join(opts.out, `${opts.slug}-android-debug.apk`)
  fs.copyFileSync(apk, outApk)
  console.log(`✓ ${outApk} (versión de prueba; para la tienda hay que firmarla en Android Studio)`)
  return outApk
}

const opts = parseArgs(process.argv.slice(2))
fs.mkdirSync(opts.out, { recursive: true })
const targets = opts.target === "all" ? TARGETS : [opts.target]
const results = []
for (const t of targets) results.push(t === "android" ? packageAndroid(opts) : await packageDesktop(opts, t))
fs.rmSync(path.join(opts.out, ".build"), { recursive: true, force: true })
console.log(`\nListo. Archivos en ${opts.out}`)
// The editor reads this line to know what was made.
console.log(`POLAR_RESULT ${JSON.stringify(results)}`)
