"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FlipHorizontal2, Footprints, Sparkles, Trash2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { CharacterShadow } from "@/components/editor/character-shadow"
import { PROTAGONIST_BREATH, PROTAGONIST_BREATH_MS, useIdleAnimation } from "@/components/editor/living-sprite"
import { ViewHeader } from "@/components/app-shell/view-header"
import { AccessoriesEditor } from "./accessories-editor"
import { useGameStore } from "@/lib/game-store"
import type { Asset, CharacterDirection, DirectionAnimation, GameProject } from "@/lib/game-types"
import { DEFAULT_VERTICAL_ANGLE, resolveAnimation } from "@/lib/character-anim"
import { cn } from "@/lib/utils"
import { mirrorRightToLeft } from "@/lib/character-mirror"
import { editAssetWithAI } from "@/lib/ai-asset-generator"
import { dataUrlToAsset, flipHorizontal } from "@/lib/image-utils"
import { packWithIdle } from "@/lib/sprite-sheet"
import { Input } from "@/components/ui/input"
import { linkSpeakersToPlayer, namedSpeakers, PLAYER_SPEAKER } from "@/lib/protagonist"
import { confirmAction } from "@/components/ui/confirm-host"

/** What the AI is asked for when creating the idle pose of each direction. */
const IDLE_PROMPTS: Record<Exclude<CharacterDirection, "right">, string> = {
  left:
    "The same character standing still in a relaxed idle pose, side view facing the LEFT side of the image. Redraw the pose (do not simply mirror the image): every held item stays in the SAME hand as in the reference.",
  up: "The same character standing still in a relaxed idle pose, seen from BEHIND (back view, walking away from the camera): we see the back of the head, hair and outfit, not the face. Held items stay in the same hand.",
  down: "The same character standing still in a relaxed idle pose, seen from the FRONT, facing the camera, face fully visible. Held items stay in the same hand.",
}

const DIRS: Array<{ id: CharacterDirection; label: string; icon: typeof ArrowRight; fallback: string }> = [
  { id: "right", label: "Derecha", icon: ArrowRight, fallback: "" },
  { id: "left", label: "Izquierda", icon: ArrowLeft, fallback: "Reflejo de la derecha" },
  { id: "up", label: "Arriba (de espaldas)", icon: ArrowUp, fallback: "Usa la vista lateral" },
  { id: "down", label: "Abajo (de frente)", icon: ArrowDown, fallback: "Usa la vista lateral" },
]

const checker = "bg-[repeating-conic-gradient(#ffffff0d_0_25%,transparent_0_50%)] bg-[length:16px_16px]"

/** The animation a direction edits: right = the base fields; others = character.directions[dir]. */
function ownAnimation(project: GameProject, dir: CharacterDirection): DirectionAnimation | null {
  const c = project.character
  if (dir === "right") return { idleAssetId: c.idleAssetId, walkAssetIds: c.walkAssetIds }
  return c.directions?.[dir] ?? null
}

export function CharacterView() {
  const { project, mutate } = useGameStore()
  const [dir, setDir] = useState<CharacterDirection>("right")
  const [mirroring, setMirroring] = useState(false)
  const [mirrorMsg, setMirrorMsg] = useState<string | null>(null)
  const [idleBusy, setIdleBusy] = useState<"mirror" | "ai" | null>(null)
  const [idleMsg, setIdleMsg] = useState<string | null>(null)
  if (!project) return null

  /** Left = mirrored copies of the right frames, as real assets (editable one by one). */
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
      setMirrorMsg(`Listo: ${assets.length} imagen(es) reflejadas, ahora son la animación propia de la izquierda.`)
    } catch (err) {
      setMirrorMsg(err instanceof Error ? err.message : "No se pudo reflejar")
    } finally {
      setMirroring(false)
    }
  }

  /** Create the idle pose of the selected direction (mirror of the right one, or AI). */
  async function createIdle(method: "mirror" | "ai") {
    if (!project || dir === "right") return
    const base = project.assets.find((a) => a.id === project.character.idleAssetId)
    if (!base) {
      setIdleMsg("Primero asigna el sprite en reposo de la Derecha: es la base para las demás.")
      return
    }
    setIdleBusy(method)
    setIdleMsg(null)
    try {
      let dataUrl: string
      if (method === "mirror") {
        dataUrl = await flipHorizontal(base.dataUrl)
      } else {
        const res = await editAssetWithAI({ dataUrl: base.dataUrl, kind: "sprite", width: base.width, height: base.height, prompt: IDLE_PROMPTS[dir] })
        // Same size and baseline as the side idle, so the character doesn't change size when turning.
        const packed = await packWithIdle(res.dataUrl, [{ dataUrl: base.dataUrl, width: base.width, height: base.height }])
        dataUrl = packed.idle.dataUrl
      }
      const label = { left: "izquierda", up: "espaldas", down: "frente" }[dir]
      const asset = await dataUrlToAsset(dataUrl, "sprite", `${base.name.replace(/[_\s-]*idle\b.*$/i, "").trim() || "personaje"} idle ${label}`)
      mutate((d) => {
        const prev = d.character.directions?.[dir]
        return {
          ...d,
          assets: [...d.assets, asset],
          character: {
            ...d.character,
            directions: { ...d.character.directions, [dir]: { idleAssetId: asset.id, walkAssetIds: prev?.walkAssetIds ?? [] } },
          },
        }
      })
      setIdleMsg("Listo: pose en reposo creada y asignada.")
    } catch (err) {
      setIdleMsg(err instanceof Error ? err.message : "No se pudo crear la pose")
    } finally {
      setIdleBusy(null)
    }
  }

  const c = project.character
  const sprites = project.assets.filter((a) => a.kind === "sprite")
  const own = ownAnimation(project, dir)
  const meta = DIRS.find((d) => d.id === dir)!
  // Switching a direction to the mirror and back must not lose its frames: keep the last own
  // animation of each direction while this view is open.
  const stashed = useRef<Partial<Record<CharacterDirection, DirectionAnimation>>>({})

  function setAnim(next: DirectionAnimation | null) {
    mutate((d) => {
      if (dir === "right") {
        return {
          ...d,
          character: { ...d.character, idleAssetId: next?.idleAssetId ?? null, walkAssetIds: next?.walkAssetIds ?? [] },
        }
      }
      const directions = { ...d.character.directions }
      if (next) directions[dir] = next
      else delete directions[dir]
      return { ...d, character: { ...d.character, directions } }
    })
  }

  return (
    <>
      <ViewHeader
        icon={User}
        title="Personaje"
        description="Animaciones por dirección: el juego usa la de hacia dónde camina el personaje (o refleja la lateral)."
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[260px_1fr_340px]">
        {/* Directions */}
        <aside className="min-h-0 space-y-1 overflow-y-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
          {DIRS.map((d) => {
            const has = d.id === "right" || !!c.directions?.[d.id]
            const Icon = d.icon
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDir(d.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left",
                  dir === d.id ? "bg-primary/15" : "hover:bg-accent",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{d.label}</span>
                  <span className={cn("block text-[11px]", has ? "text-emerald-400" : "text-muted-foreground")}>
                    {has ? "Animación propia" : d.fallback}
                  </span>
                </span>
              </button>
            )
          })}

          <ProtagonistName project={project} />

          <div className="mt-4 space-y-4 rounded-lg border border-border bg-card p-3">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Ángulo para arriba/abajo</span>
                <span className="text-muted-foreground">{c.verticalAngle ?? DEFAULT_VERTICAL_ANGLE}°</span>
              </div>
              <Slider
                value={[c.verticalAngle ?? DEFAULT_VERTICAL_ANGLE]}
                min={25}
                max={85}
                step={5}
                onValueChange={([v]) => mutate((d) => ({ ...d, character: { ...d.character, verticalAngle: v } }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Movimientos más inclinados que este ángulo usan arriba/abajo; los más planos siguen usando izquierda/derecha.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs">Mira al empezar</p>
              <div className="grid grid-cols-2 gap-1.5">
                {([-1, 1] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={(c.startFacing ?? 1) === f ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => mutate((d) => ({ ...d, character: { ...d.character, startFacing: f } }))}
                  >
                    {f === -1 ? "Izquierda" : "Derecha"}
                  </Button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span>
                Sombra en los pies
                <span className="block text-[11px] text-muted-foreground">Sombras muy tenues que se estiran desde los pies hacia los lados.</span>
              </span>
              <Switch
                checked={!!c.shadow}
                onCheckedChange={(v) => mutate((d) => ({ ...d, character: { ...d.character, shadow: v } }))}
              />
            </label>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Velocidad de animación</span>
                <span className="text-muted-foreground">{c.walkFrameMs ?? 200} ms/fotograma</span>
              </div>
              <Slider
                value={[c.walkFrameMs ?? 200]}
                min={60}
                max={400}
                step={10}
                onValueChange={([v]) => mutate((d) => ({ ...d, character: { ...d.character, walkFrameMs: v } }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Respiración quieto: cuánto se estira</span>
                <span className="text-muted-foreground">
                  {(c.breathDepth ?? PROTAGONIST_BREATH) === 0 ? "sin respirar" : `${((c.breathDepth ?? PROTAGONIST_BREATH) * 2.2).toFixed(1)} %`}
                </span>
              </div>
              <Slider
                value={[c.breathDepth ?? PROTAGONIST_BREATH]}
                min={0}
                max={4}
                step={0.25}
                onValueChange={([v]) => mutate((d) => ({ ...d, character: { ...d.character, breathDepth: v } }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Respiración quieto: duración</span>
                <span className="text-muted-foreground">{((c.breathMs ?? PROTAGONIST_BREATH_MS) / 1000).toFixed(1)} s</span>
              </div>
              <Slider
                value={[c.breathMs ?? PROTAGONIST_BREATH_MS]}
                min={800}
                max={6000}
                step={100}
                onValueChange={([v]) => mutate((d) => ({ ...d, character: { ...d.character, breathMs: v } }))}
              />
              <p className="text-[11px] text-muted-foreground">Lo que tarda en inhalar y exhalar una vez. Se ve en la vista previa «Quieto».</p>
            </div>
          </div>
        </aside>

        {/* Editor for the selected direction */}
        <section className="min-h-0 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{meta.label}</h2>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/walk-cycle?dir=${dir}`}>
                <Sparkles className="size-4" /> Generar ciclo con IA para esta dirección
              </Link>
            </Button>
          </div>

          {dir !== "right" && (
            <div className="flex rounded-lg bg-muted p-0.5 text-sm">
              {[
                [false, meta.fallback],
                [true, "Animación propia"],
              ].map(([value, label]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => {
                    if (value) return setAnim(own ?? stashed.current[dir] ?? { idleAssetId: null, walkAssetIds: [] })
                    if (own) stashed.current[dir] = own
                    setAnim(null)
                  }}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5",
                    !!own === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label as string}
                </button>
              ))}
            </div>
          )}

          <IdleCard project={project} dir={dir}>
            {dir === "left" && (
              <Button size="sm" variant="outline" onClick={() => createIdle("mirror")} disabled={!!idleBusy}>
                <FlipHorizontal2 className="size-4" /> {idleBusy === "mirror" ? "Reflejando…" : "Crear reflejando la derecha (gratis)"}
              </Button>
            )}
            {dir !== "right" && (
              <Button size="sm" variant="outline" onClick={() => createIdle("ai")} disabled={!!idleBusy}>
                <Sparkles className="size-4" />{" "}
                {idleBusy === "ai"
                  ? "Generando… (1–2 min)"
                  : dir === "left"
                    ? "Generar con IA (objetos en la misma mano)"
                    : dir === "up"
                      ? "Generar de espaldas con IA"
                      : "Generar de frente con IA"}
              </Button>
            )}
            {idleMsg && <p className="w-full text-xs text-muted-foreground">{idleMsg}</p>}
          </IdleCard>

          {dir === "left" && (
            <div className="space-y-2 rounded-lg border border-border bg-card p-3">
              <p className="text-sm">Copiar los fotogramas de la derecha, reflejados</p>
              <p className="text-xs text-muted-foreground">
                Crea copias espejadas de la derecha como imágenes propias de la izquierda, para retocar alguna (por
                ejemplo con «Editar con IA» en la Biblioteca). Si no vas a retocarlas, no hace falta: el reflejo
                automático ya funciona.
              </p>
              <Button size="sm" variant="outline" onClick={copyMirroredToLeft} disabled={mirroring}>
                <FlipHorizontal2 className="size-4" /> {mirroring ? "Reflejando…" : "Copiar los de la derecha reflejados"}
              </Button>
              {mirrorMsg && <p className="text-xs text-emerald-400">{mirrorMsg}</p>}
            </div>
          )}

          {own ? (
            <>
              <FramePicker
                title="Sprite en reposo"
                hint="Se muestra cuando el personaje está quieto mirando hacia esta dirección."
                sprites={sprites}
                selected={own.idleAssetId ? [own.idleAssetId] : []}
                onToggle={(id) => setAnim({ ...own, idleAssetId: own.idleAssetId === id ? null : id })}
              />
              <FramePicker
                title="Ciclo de caminar"
                hint="Clic para agregar o quitar fotogramas; el número es el orden."
                sprites={sprites}
                selected={own.walkAssetIds}
                ordered
                onToggle={(id) =>
                  setAnim({
                    ...own,
                    walkAssetIds: own.walkAssetIds.includes(id)
                      ? own.walkAssetIds.filter((x) => x !== id)
                      : [...own.walkAssetIds, id],
                  })
                }
              />
              {own.walkAssetIds.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setAnim({ ...own, walkAssetIds: [] })}
                >
                  <Trash2 className="size-4" /> Vaciar ciclo de caminar
                </Button>
              )}
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              {dir === "left"
                ? "Hacia la izquierda se usa la animación de la derecha reflejada. Elige «Animación propia» si tu personaje no es simétrico (por ejemplo, lleva algo en una mano)."
                : "Hacia arriba/abajo se usa la vista lateral. Elige «Animación propia» para usar sprites de espaldas o de frente."}
            </p>
          )}
        </section>

        {/* Live preview of what the game will show */}
        <aside className="min-h-0 overflow-y-auto border-t border-border p-5 lg:border-l lg:border-t-0">
          <AnimationPreview project={project} dir={dir} />
          <div className="mt-5">
            <AccessoriesEditor project={project} />
          </div>
        </aside>
      </div>
    </>
  )
}

/**
 * The protagonist's name lives here; dialog lines marked "protagonista" show it, so renaming
 * updates every dialog. Lines that still have a written name can be linked in one click.
 */
function ProtagonistName({ project }: { project: GameProject }) {
  const { mutate } = useGameStore()
  const [draft, setDraft] = useState(project.character.name ?? "")
  useEffect(() => setDraft(project.character.name ?? ""), [project.character.name])
  const linked = project.dialogs.reduce((n, d) => n + d.lines.filter((l) => l.speaker === PLAYER_SPEAKER).length, 0)
  const candidates = namedSpeakers(project).slice(0, 6)
  const commit = () => {
    const name = draft.trim()
    if (name !== (project.character.name ?? "")) mutate((d) => ({ ...d, character: { ...d.character, name } }))
  }
  return (
    <div className="mt-4 space-y-2 rounded-lg border border-border bg-card p-3">
      <label className="block space-y-1.5">
        <span className="text-xs">Nombre del protagonista</span>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="Ej. Elena"
          className="h-8 text-sm"
        />
      </label>
      <p className="text-[11px] text-muted-foreground">
        {linked} línea(s) de diálogo lo usan: al cambiarlo aquí se actualizan todas. En los textos, {"{protagonista}"} se
        reemplaza por este nombre.
      </p>
      {candidates.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">¿Diálogos con el nombre escrito a mano?</summary>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Si alguno de estos es el protagonista, conviértelo para que use este nombre (en todas las versiones):
          </p>
          <div className="mt-1.5 space-y-1">
            {candidates.map((c) => (
              <button
                key={c.name}
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent"
                onClick={async () => {
                  if (!(await confirmAction(`¿Convertir las ${c.count} línea(s) de «${c.name}» en el protagonista?`, { confirmLabel: "Convertir" }))) return
                  mutate((d) => linkSpeakersToPlayer(d, [c.name]))
                }}
              >
                <span>«{c.name}»</span>
                <span className="text-muted-foreground">{c.count} líneas → protagonista</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

/** The idle pose the game shows for a direction, where it comes from, and ways to create it. */
function IdleCard({ project, dir, children }: { project: GameProject; dir: CharacterDirection; children?: React.ReactNode }) {
  const anim = resolveAnimation(project.character, dir, "right")
  const idle = project.assets.find((a) => a.id === anim.idleAssetId)
  const ownIdle = dir === "right" ? !!project.character.idleAssetId : !!project.character.directions?.[dir]?.idleAssetId
  const source = ownIdle
    ? "Pose propia de esta dirección."
    : dir === "left"
      ? "No tiene propia: se usa la de la derecha reflejada."
      : dir === "right"
        ? "Falta: elige abajo el sprite en reposo."
        : `No tiene propia: se usa la vista lateral. Crea una ${dir === "up" ? "de espaldas" : "de frente"} para que se vea al quedarse quieto mirando hacia ${dir === "up" ? "el fondo" : "la cámara"}.`
  return (
    <div className="flex gap-4 rounded-lg border border-border bg-card p-3">
      <div className={cn("flex h-32 w-24 shrink-0 items-end justify-center overflow-hidden rounded-md border border-border p-1", checker)}>
        {idle ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={idle.dataUrl} alt="" className="max-h-full max-w-full object-contain" style={{ transform: anim.idleMirror ? "scaleX(-1)" : undefined }} />
        ) : (
          <User className="mb-10 size-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium">Pose en reposo</p>
          <p className="text-xs text-muted-foreground">Lo que se ve cuando el personaje se detiene mirando hacia aquí. {source}</p>
        </div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </div>
  )
}

function FramePicker({
  title,
  hint,
  sprites,
  selected,
  ordered,
  onToggle,
}: {
  title: string
  hint: string
  sprites: Asset[]
  selected: string[]
  ordered?: boolean
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {sprites.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay sprites de personaje. Súbelos o genéralos en la <Link className="underline" href="/library">Biblioteca</Link>.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-8">
          {sprites.map((a) => {
            const idx = selected.indexOf(a.id)
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onToggle(a.id)}
                title={a.name}
                className={cn(
                  "relative aspect-[3/4] overflow-hidden rounded-md border",
                  checker,
                  idx >= 0 ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.dataUrl} alt={a.name} className="size-full object-contain p-1" />
                {idx >= 0 && (
                  <span className="absolute left-1 top-1 grid size-4 place-items-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
                    {ordered ? idx + 1 : "✓"}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AnimationPreview({ project, dir }: { project: GameProject; dir: CharacterDirection }) {
  const [tick, setTick] = useState(0)
  const anim = resolveAnimation(project.character, dir, dir === "left" ? "left" : "right")
  const frames = anim.walkAssetIds.map((id) => project.assets.find((a) => a.id === id)).filter((a): a is Asset => !!a)
  const idle = project.assets.find((a) => a.id === anim.idleAssetId)
  const ms = Math.max(60, project.character.walkFrameMs ?? 200)
  // "Quieto" breathes as in the game.
  const breathRef = useRef<HTMLDivElement>(null)
  useIdleAnimation(
    breathRef,
    idle ? "breathe" : null,
    "protagonist",
    project.character.breathDepth ?? PROTAGONIST_BREATH,
    project.character.breathMs ?? PROTAGONIST_BREATH_MS,
  )

  useEffect(() => {
    if (frames.length < 2) return
    const id = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [frames.length, ms])

  const panes: Array<{ label: string; asset?: Asset; mirror: boolean; note: string }> = [
    { label: "Quieto", asset: idle, mirror: anim.idleMirror, note: anim.idleMirror ? "reflejado" : "" },
    {
      label: "Caminando",
      asset: frames.length ? frames[tick % frames.length] : undefined,
      mirror: anim.walkMirror,
      note: `${frames.length} fotograma(s)${anim.walkMirror ? " · reflejado" : ""}`,
    },
  ]

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Vista previa</p>
      <div className="grid grid-cols-2 gap-3">
        {panes.map((p) => (
          <div key={p.label} className="space-y-1.5">
            <div className={cn("relative flex aspect-[3/4] items-end justify-center overflow-hidden rounded-lg border border-border p-3", checker)}>
              {p.asset && project.character.shadow && (
                // feet sit on the bottom padding (12px); the box is 4 × 1 figure widths (~25% of the pane)
                <CharacterShadow style={{ left: "50%", bottom: "12px", width: "100%", height: "18.75%", transform: "translate(-50%, 50%)" }} />
              )}
              {p.asset ? (
                <div
                  ref={p.label === "Quieto" ? breathRef : undefined}
                  className="relative flex size-full items-end justify-center"
                  style={{ transformOrigin: "50% 100%" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.asset.dataUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    style={{ transform: p.mirror ? "scaleX(-1)" : undefined }}
                  />
                </div>
              ) : (
                <div className="self-center text-center text-xs text-muted-foreground">
                  <Footprints className="mx-auto mb-2 size-5" />
                  Sin sprites
                </div>
              )}
            </div>
            <p className="text-xs">
              {p.label} <span className="text-muted-foreground">{p.note && `· ${p.note}`}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
