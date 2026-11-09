"use client"

import { useEffect, useMemo, useState } from "react"
import { Footprints, Loader2, RefreshCw, Check, AlertTriangle, Wand2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { useGameStore } from "@/lib/game-store"
import { generateWalkCycleSheet, WALK_LAYOUTS, type WalkFrameCount } from "@/lib/ai-asset-generator"
import { packWithIdle, processWalkSheet, type ProcessedFrame, type SheetLayout } from "@/lib/sprite-sheet"
import { dataUrlToAsset, flipHorizontal } from "@/lib/image-utils"
import { cn } from "@/lib/utils"
import { createSlot, useSlot } from "@/lib/persistent-slot"
import { mirrorRightToLeft } from "@/lib/character-mirror"
import { proceduralWalk } from "@/lib/procedural-walk"
import Link from "next/link"
import type { CharacterDirection } from "@/lib/game-types"
import { confirmAction } from "@/components/ui/confirm-host"

const DIRECTION_LABELS: Record<CharacterDirection, string> = { right: "Derecha", left: "Izquierda", up: "Arriba", down: "Abajo" }
/** What each direction looks like, so "Derecha" isn't ambiguous. */
const DIRECTION_BUTTONS: Record<CharacterDirection, { arrow: string; view: string }> = {
  right: { arrow: "→", view: "de perfil" },
  left: { arrow: "←", view: "de perfil" },
  up: { arrow: "↑", view: "de espaldas" },
  down: { arrow: "↓", view: "de frente" },
}


type Result = {
  sheetDataUrl: string
  frames: ProcessedFrame[]
  enabled: boolean[]
  splitByGaps: boolean
  keyedBackground: boolean
  /** poses requested (to re-split the same sheet) */
  frameCount?: WalkFrameCount
  /** grid the poses were drawn in; absent = old single-row sheets */
  layout?: SheetLayout
  /** per frame: why it looks wrong, or null */
  issues?: Array<string | null>
  /** poses the AI didn't draw */
  missing?: number
  /** poses touched and were cut at their narrowest points */
  touching?: boolean
  /** legs barely change between frames */
  staticLegs?: boolean
  /** frames mirrored automatically to face the same way as the rest */
  flipped?: number
  /** built from a single sprite without AI (no sheet to re-split) */
  procedural?: boolean
}

// Survive leaving the view (and reloads): the last result and an in-flight generation.
const resultSlot = createSlot<Result & { direction?: CharacterDirection }>("pixelquest:walk-cycle-result", { persist: true })
const loadingSlot = createSlot<boolean>("pixelquest:walk-cycle-loading")
const errorSlot = createSlot<string>("pixelquest:walk-cycle-error")

export function WalkCyclePanel() {
  const { project, mutate } = useGameStore()
  const spriteAssets = useMemo(
    () => (project?.assets ?? []).filter((a) => a.kind === "sprite" || a.kind === "object"),
    [project?.assets],
  )

  const [referenceId, setReferenceId] = useState<string>(project?.character.idleAssetId ?? spriteAssets[0]?.id ?? "")
  const [frameCount, setFrameCount] = useState<WalkFrameCount>(4)
  // Empty by default: the reference image defines the look (house style is for creating characters).
  const [style, setStyle] = useState("")
  const [notes, setNotes] = useState("")
  const [normalizeIdle, setNormalizeIdle] = useState(true)
  // Which direction this cycle is for (right = the base side animation).
  const [direction, setDirection] = useState<CharacterDirection>("right")
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("dir")
    if (d === "left" || d === "up" || d === "down" || d === "right") setDirection(d)
  }, [])
  // Coming back to a stored result: show the direction it was generated for.
  const resultDirection = useSlot(resultSlot)?.direction
  useEffect(() => {
    if (resultDirection && !new URLSearchParams(window.location.search).get("dir")) setDirection(resultDirection)
  }, [resultDirection])

  const loading = !!useSlot(loadingSlot)
  const setLoading = (v: boolean) => loadingSlot.set(v || null)
  const error = useSlot(errorSlot)
  const setError = (v: string | null) => errorSlot.set(v)
  const [success, setSuccess] = useState<string | null>(null)
  const result = useSlot(resultSlot)
  // Only used to toggle frames of the existing result; it keeps the direction it was generated for.
  const setResult = (fn: (r: Result | null) => Result | null) => {
    const prev = resultSlot.get()
    const value = fn(prev)
    resultSlot.set(value ? { ...value, direction: prev?.direction } : null)
  }
  const [tick, setTick] = useState(0)

  const reference = spriteAssets.find((a) => a.id === referenceId) ?? null
  const isCurrentIdle = !!reference && reference.id === project?.character.idleAssetId
  // The last result belongs to one direction; with another one selected, preview what that
  // direction has assigned in the character instead (e.g. the mirrored left frames).
  const resultMatches = !!result && (result.direction ?? "right") === direction
  const assignedFrames = useMemo(() => {
    if (!project) return []
    const ids = direction === "right" ? project.character.walkAssetIds : project.character.directions?.[direction]?.walkAssetIds ?? []
    return ids.map((id) => project.assets.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a)
  }, [project, direction])
  const activeFrames = resultMatches && result ? result.frames.filter((_, i) => result.enabled[i]) : assignedFrames
  const frameMs = Math.max(60, project?.character.walkFrameMs ?? 200)

  useEffect(() => {
    if (activeFrames.length < 2) return
    const id = setInterval(() => setTick((t) => t + 1), frameMs)
    return () => clearInterval(id)
  }, [activeFrames.length, frameMs])

  /** Split a sheet of poses (generated here or made elsewhere) and show it as the result. */
  async function showSheet(sheetDataUrl: string, forDirection: CharacterDirection) {
    const layout = { cols: WALK_LAYOUTS[frameCount].cols, rows: WALK_LAYOUTS[frameCount].rows }
    const processed = await processWalkSheet(sheetDataUrl, frameCount, layout)
    resultSlot.set({
      sheetDataUrl,
      frames: processed.frames,
      // Frames flagged as cut or too small start excluded.
      enabled: processed.issues.map((issue) => !issue),
      issues: processed.issues,
      missing: processed.missing,
      touching: processed.touching,
      staticLegs: processed.staticLegs,
      flipped: processed.flipped,
      splitByGaps: processed.splitByGaps,
      keyedBackground: processed.keyedBackground,
      frameCount,
      layout,
      direction: forDirection,
    })
  }

  /** A sheet drawn with another tool (e.g. Magnific), same grid as the generator asks for. */
  async function handleImportSheet(file: File) {
    if (loading) return
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"))
        reader.readAsDataURL(file)
      })
      await showSheet(dataUrl, direction)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo separar la hoja")
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    if (!reference || loading) return

    setLoading(true)
    setError(null)
    setSuccess(null)
    const requestedDirection = direction
    try {
      const sheet = await generateWalkCycleSheet({
        referenceDataUrl: reference.dataUrl,
        direction,
        frames: frameCount,
        style,
        notes,
      })
      await showSheet(sheet.dataUrl, requestedDirection)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el ciclo")
    } finally {
      setLoading(false)
    }
  }

  const [building, setBuilding] = useState(false)
  /** Walk cycle from the reference alone, without AI: the feet step procedurally. */
  async function handleProcedural() {
    if (!reference || building) return
    setBuilding(true)
    setError(null)
    setSuccess(null)
    try {
      const frames = await proceduralWalk(reference.dataUrl, { frames: 8, direction })
      resultSlot.set({
        sheetDataUrl: reference.dataUrl,
        frames,
        enabled: frames.map(() => true),
        splitByGaps: false,
        keyedBackground: false,
        procedural: true,
        direction,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el ciclo")
    } finally {
      setBuilding(false)
    }
  }

  /** Mirror some frames in place (to fix the side they face). */
  async function flipFrames(indexes: number[]) {
    const current = resultSlot.get()
    if (!current) return
    const frames = await Promise.all(
      current.frames.map(async (f, i) => (indexes.includes(i) ? { ...f, dataUrl: await flipHorizontal(f.dataUrl) } : f)),
    )
    resultSlot.set({ ...current, frames })
  }

  const [resplitting, setResplitting] = useState(false)
  async function resplit() {
    const current = resultSlot.get()
    if (!current) return
    setResplitting(true)
    setError(null)
    try {
      const count = (current.frameCount ?? (current.frames.length === 6 ? 6 : 4)) as WalkFrameCount
      // Old results were a single row.
      const processed = await processWalkSheet(current.sheetDataUrl, count, current.layout ?? { cols: count, rows: 1 })
      resultSlot.set({
        ...current,
        frames: processed.frames,
        enabled: processed.issues.map((issue) => !issue),
        issues: processed.issues,
        missing: processed.missing,
        touching: processed.touching,
        staticLegs: processed.staticLegs,
        flipped: processed.flipped,
        splitByGaps: processed.splitByGaps,
        keyedBackground: processed.keyedBackground,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo separar")
    } finally {
      setResplitting(false)
    }
  }

  const [mirroring, setMirroring] = useState(false)
  const [mirrorMsg, setMirrorMsg] = useState<string | null>(null)
  async function copyMirroredToLeft() {
    if (!project) return
    if (project.character.directions?.left && !(await confirmAction("La izquierda ya tiene animación propia. ¿Reemplazarla con los de la derecha reflejados?", { confirmLabel: "Reemplazar", destructive: true }))) return
    setMirroring(true)
    setMirrorMsg(null)
    try {
      const { assets, left } = await mirrorRightToLeft(project)
      mutate((d) => ({
        ...d,
        assets: [...d.assets, ...assets],
        character: { ...d.character, directions: { ...d.character.directions, left } },
      }))
      setMirrorMsg(`Listo: ${assets.length} imagen(es) reflejadas asignadas a la izquierda.`)
    } catch (err) {
      setMirrorMsg(err instanceof Error ? err.message : "No se pudo reflejar")
    } finally {
      setMirroring(false)
    }
  }

  async function handleApply() {
    if (!result || !reference || activeFrames.length === 0) return
    setError(null)
    // Apply to the direction the result was generated for (the selector may have changed since).
    const applyDir: CharacterDirection = result.direction ?? direction
    try {
      const base = reference.name.replace(/[_\s-]*idle\b.*$/i, "").trim() || "character"
      let walk = activeFrames
      let idle: ProcessedFrame | null = null
      if (applyDir === "right" && normalizeIdle) {
        const packed = await packWithIdle(reference.dataUrl, activeFrames)
        walk = packed.walk
        idle = packed.idle
      } else if (applyDir !== "right" && normalizeIdle) {
        // The reference shows the side view; for other directions the first frame is a better "standing" pose.
        idle = walk[0]
      }
      const suffix = applyDir === "right" ? "" : `_${applyDir}`

      const walkAssets = await Promise.all(
        walk.map((f, i) => dataUrlToAsset(f.dataUrl, "sprite", `${base}${suffix}_walk_${String(i + 1).padStart(2, "0")}`)),
      )
      const idleAsset = idle
        ? await dataUrlToAsset(idle.dataUrl, "sprite", applyDir === "right" ? `${base}_idle_aligned` : `${base}${suffix}_idle`)
        : null

      mutate((d) => {
        const assets = [...d.assets, ...(idleAsset ? [idleAsset] : []), ...walkAssets]
        if (applyDir === "right") {
          return {
            ...d,
            assets,
            character: {
              ...d.character,
              walkAssetIds: walkAssets.map((a) => a.id),
              // Frames are packed with the feet on the bottom edge, so the pivot sits there too.
              ...(idleAsset ? { idleAssetId: idleAsset.id, pivotX: 0.5, pivotY: 1 } : {}),
            },
          }
        }
        const prev = d.character.directions?.[applyDir]
        return {
          ...d,
          assets,
          character: {
            ...d.character,
            directions: {
              ...d.character.directions,
              [applyDir]: { idleAssetId: idleAsset?.id ?? prev?.idleAssetId ?? null, walkAssetIds: walkAssets.map((a) => a.id) },
            },
          },
        }
      })
      setSuccess(
        applyDir === "right"
          ? `Ciclo de ${walkAssets.length} fotogramas asignado al personaje${idleAsset ? " (idle alineado y pivot en los pies)" : ""}.`
          : `Ciclo de ${walkAssets.length} fotogramas asignado a la dirección «${DIRECTION_LABELS[applyDir]}».`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el ciclo")
    }
  }

  if (!project) return null

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[420px_1fr]">
      <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <div className="space-y-1.5">
            <Label>¿Hacia dónde camina en esta animación?</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["right", "left", "up", "down"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={cn(
                    "flex h-12 flex-col items-center justify-center rounded-md border text-xs leading-tight",
                    direction === d
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-input bg-background text-muted-foreground",
                  )}
                >
                  <span>
                    {DIRECTION_BUTTONS[d].arrow} {DIRECTION_LABELS[d]}
                  </span>
                  <span className="text-[10px] opacity-60">{DIRECTION_BUTTONS[d].view}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {direction === "right"
                ? "Empieza por aquí: la IA dibuja al personaje de perfil caminando hacia la derecha. El juego la refleja para caminar a la izquierda."
                : direction === "left"
                  ? "Normalmente no hace falta: se usa la de derecha reflejada. Genérala solo si tu personaje no es simétrico (ej. lleva algo en una mano)."
                  : direction === "up"
                    ? "Opcional: de espaldas, para cuando camina hacia el fondo de la escena."
                    : "Opcional: de frente, para cuando camina hacia la cámara."}{" "}
              Queda asignada en <Link href="/character" className="underline">Personaje</Link>.
            </p>
            {direction === "left" && (
              <div className="mt-2 space-y-2 rounded-md border border-border bg-background/40 p-2.5">
                <p className="text-xs text-muted-foreground">
                  Sin gastar IA: copia los fotogramas de la derecha reflejados como animación propia de la izquierda
                  (luego puedes retocar alguno en la Biblioteca).
                </p>
                <Button size="sm" variant="outline" onClick={copyMirroredToLeft} disabled={mirroring}>
                  {mirroring ? "Reflejando…" : "← Copiar los de la derecha reflejados"}
                </Button>
                {mirrorMsg && <p className="text-xs text-emerald-400">{mirrorMsg}</p>}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="walk-reference">Personaje de referencia</Label>
            {spriteAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Primero genera o sube un sprite del personaje (pestaña Assets o la biblioteca).
              </p>
            ) : (
              <div className="flex items-center gap-3">
                <select
                  id="walk-reference"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-3 text-sm"
                >
                  {spriteAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.id === project.character.idleAssetId ? " (idle actual)" : ""}
                    </option>
                  ))}
                </select>
                {reference && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={reference.dataUrl}
                    alt={reference.name}
                    className="h-16 w-16 shrink-0 rounded border border-border bg-background object-contain"
                  />
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Fotogramas</Label>
            <div className="grid grid-cols-2 gap-2">
              {([4, 6] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFrameCount(n)}
                  className={cn(
                    "h-9 rounded-md border text-sm",
                    frameCount === n
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-input bg-background text-muted-foreground",
                  )}
                >
                  {n} {n === 4 ? "(más estable)" : "(más fluido)"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="walk-style">Ajuste de estilo (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Se copia el estilo de la imagen de referencia. Escribe aquí solo si quieres ajustar algo.
            </p>
            <Textarea
              id="walk-style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Ej.: más contraste, colores un poco más cálidos"
              rows={2}
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="walk-notes">Indicaciones extra (opcional)</Label>
            <Textarea
              id="walk-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Keeps holding the torch in the right hand. Slow, cautious walk."
              rows={3}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={normalizeIdle} onCheckedChange={(v) => setNormalizeIdle(v === true)} className="mt-0.5" />
            <span>
              {direction === "right" ? "Alinear también el idle con el ciclo" : "Usar el primer fotograma como sprite en reposo"}
              <span className="block text-xs text-muted-foreground">
                {direction === "right"
                  ? "Crea una copia del idle a la misma escala y con los pies en la misma base, y ajusta el pivot. Evita que el personaje cambie de tamaño al empezar a caminar."
                  : "La referencia es la vista lateral; para esta dirección el primer fotograma sirve como pose de reposo."}
              </span>
            </span>
          </label>

        </div>

        <div className="shrink-0 space-y-2 border-t border-border p-4">
          <Button className="w-full" onClick={handleGenerate} disabled={!reference || loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generando ciclo…
              </>
            ) : (
              <>
                <Footprints className="size-4" /> Generar ciclo de caminar
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Una sola imagen por intento con GPT Image 2.5, calidad alta: las {frameCount} poses en una cuadrícula de{" "}
            {WALK_LAYOUTS[frameCount].cols}×{WALK_LAYOUTS[frameCount].rows} ({WALK_LAYOUTS[frameCount].size.replace("x", "×")}, ≈ USD 0.25).
          </p>
          <Button variant="outline" className="w-full" asChild disabled={loading}>
            <label className="cursor-pointer">
              <Upload className="size-4" /> Importar hoja de poses
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) handleImportSheet(file)
                }}
              />
            </label>
          </Button>
          <p className="text-xs text-muted-foreground">
            Una hoja hecha en otra herramienta, con las {frameCount} poses en {WALK_LAYOUTS[frameCount].cols}×
            {WALK_LAYOUTS[frameCount].rows} y fondo liso: se separa igual que la generada.
          </p>

          <Button variant="outline" className="w-full" onClick={handleProcedural} disabled={!reference || building}>
            {building ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Crear sin IA (pasos automáticos)
          </Button>
          <p className="text-xs text-muted-foreground">
            Gratis e instantáneo: usa la referencia tal cual y anima los pies, el borde de la ropa y un leve rebote.
            Ideal para personajes con túnica o capa.
          </p>

          {error && <p className="break-words text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-500">{success}</p>}
        </div>
      </section>

      <section className="min-h-0 space-y-5 overflow-y-auto p-5">

          {!resultMatches ? (
            assignedFrames.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Animación asignada a {DIRECTION_LABELS[direction]}</p>
                <div className="flex items-end justify-center rounded-lg border border-border bg-[repeating-conic-gradient(#ffffff08_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activeFrames[tick % activeFrames.length].dataUrl} alt="Animación" className="h-72 w-auto object-contain" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {assignedFrames.map((a) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={a.id} src={a.dataUrl} alt={a.name} className="h-20 w-auto rounded border border-border bg-background/40 object-contain p-1" />
                  ))}
                </div>
                {result && (
                  <p className="text-xs text-muted-foreground">
                    El último ciclo generado es para {DIRECTION_LABELS[result.direction ?? "right"]}: selecciona esa dirección para verlo.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {loading ? <Loader2 className="size-6 animate-spin" /> : <Footprints className="size-6" />}
                {loading
                  ? "Generando… puede tardar 1–2 minutos."
                  : `${DIRECTION_LABELS[direction]} todavía no tiene animación. Genérala${direction === "left" ? " o copia la de la derecha reflejada" : ""}.`}
              </div>
            )
          ) : !result ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {loading ? <Loader2 className="size-6 animate-spin" /> : <Footprints className="size-6" />}
              {loading ? "Generando… puede tardar 1–2 minutos." : "El ciclo generado aparecerá aquí, animado."}
            </div>
          ) : (
            <>
              <div className="flex items-end justify-center rounded-lg border border-border bg-[repeating-conic-gradient(#ffffff08_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-6">
                {activeFrames.length > 0 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeFrames[tick % activeFrames.length].dataUrl}
                    alt="Animación"
                    className="h-72 w-auto object-contain"
                  />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Velocidad de animación</span>
                  <span className="text-muted-foreground">{frameMs} ms/fotograma · se guarda en el personaje</span>
                </div>
                <Slider
                  value={[frameMs]}
                  min={60}
                  max={400}
                  step={10}
                  onValueChange={([v]) => mutate((d) => ({ ...d, character: { ...d.character, walkFrameMs: v } }), { history: false })}
                />
                <p className="text-xs text-muted-foreground">
                  Con 4 fotogramas, 180–220 ms se ve como un paso tranquilo; valores bajos parecen correr.
                </p>
              </div>

              {(() => {
                const flagged = (result.issues ?? []).filter(Boolean).length
                const missing = result.missing ?? 0
                if (!flagged && !missing && !result.touching && !result.staticLegs && !result.flipped && !result.keyedBackground) return null
                return (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {!!result.flipped &&
                        `${result.flipped} fotograma(s) miraban al lado contrario y se reflejaron para que todos miren igual. Al reflejarlos, lo que lleva en la mano cambia de mano y se nota un salto: si pasa, conviene Regenerar. Si todos quedaron mirando al lado equivocado, usa «Reflejar todos». `}
                      {result.staticLegs &&
                        "Las piernas casi no cambian entre fotogramas: la IA repitió la misma pose y no se verá caminar. Conviene pulsar Regenerar. "}
                      {result.touching &&
                        "Las poses se tocaban: se separaron por los puntos más angostos (revisa que ninguna traiga partes de otra). "}
                      {missing > 0 &&
                        `La IA dibujó ${result.frames.length} de ${result.frames.length + missing} poses. `}
                      {flagged > 0 &&
                        `${flagged} fotograma(s) salieron mal (marcados en rojo) y quedaron excluidos. `}
                      {(missing > 0 || flagged > 0) &&
                        (result.frames.length - flagged >= 2
                          ? "Puedes usar el ciclo con los que quedan o pulsar Regenerar. "
                          : "Conviene pulsar Regenerar. ")}
                      {result.keyedBackground && "La imagen vino con fondo opaco; se quitó automáticamente."}
                    </span>
                  </div>
                )
              })()}

              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void flipFrames(result.frames.map((_, i) => i))}>
                    ↔ Reflejar todos
                  </Button>
                  <span className="text-xs text-muted-foreground">↔ en cada fotograma lo refleja solo a él.</span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Fotogramas — haz clic para excluir los que salieron mal ({activeFrames.length}/{result.frames.length}{" "}
                  activos, {frameMs} ms por fotograma).
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.frames.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setResult((r) => r && { ...r, enabled: r.enabled.map((e, j) => (j === i ? !e : e)) })
                      }
                      className={cn(
                        "relative rounded border bg-background p-1",
                        result.enabled[i] ? "border-primary" : "border-border opacity-30",
                        result.issues?.[i] && "border-red-500/70",
                      )}
                      title={`${result.issues?.[i] ? `Problema: ${result.issues[i]}. ` : ""}${result.enabled[i] ? "Clic para excluir" : "Clic para incluir"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.dataUrl} alt={`Fotograma ${i + 1}`} className="h-24 w-auto object-contain" />
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px]">{i + 1}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        title="Reflejar este fotograma"
                        onClick={(e) => {
                          e.stopPropagation()
                          void flipFrames([i])
                        }}
                        className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] hover:bg-primary hover:text-primary-foreground"
                      >
                        ↔
                      </span>
                      {result.issues?.[i] && (
                        <span className="absolute inset-x-1 bottom-1 rounded bg-red-600/90 px-1 text-center text-[9px] leading-tight text-white">
                          {result.issues[i]!.split(" (")[0]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {!result.procedural && (<>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={resplit} disabled={resplitting}>
                  <RefreshCw className="size-4" /> {resplitting ? "Separando…" : "Volver a separar"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Procesa de nuevo la misma imagen (sin generar otra ni gastar IA).
                </span>
              </div>

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Imagen original generada</summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.sheetDataUrl} alt="Hoja generada" className="mt-2 w-full rounded border border-border" />
              </details>
              </>)}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button onClick={handleApply} disabled={activeFrames.length === 0}>
                  <Check className="size-4" /> Usar como ciclo de caminar
                </Button>
                {result.procedural ? (
                  <Button variant="outline" onClick={handleGenerate} disabled={loading}>
                    <Footprints className="size-4" /> Probar con IA
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleGenerate} disabled={loading}>
                    <RefreshCw className="size-4" /> Regenerar
                  </Button>
                )}
              </div>
              {direction === "right" && !isCurrentIdle && normalizeIdle && (
                <p className="text-xs text-muted-foreground">
                  Nota: la referencia elegida no es el idle actual; al aplicar, pasará a ser el idle del personaje.
                </p>
              )}
            </>
          )}
      </section>
    </div>
  )
}
