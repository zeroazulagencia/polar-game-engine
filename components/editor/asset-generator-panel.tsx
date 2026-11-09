"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  Loader2,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Compass,
  Box,
  Image as ImageIcon,
  RectangleHorizontal,
  RectangleVertical,
  Save,
  Sparkles,
  Square,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useGameStore } from "@/lib/game-store"
import { generateAssetWithByok } from "@/lib/ai-asset-generator"
import { cropToAspect, dataUrlToAsset } from "@/lib/image-utils"
import type { AssetKind } from "@/lib/game-types"
import { cn } from "@/lib/utils"
import { createSlot, useSlot } from "@/lib/persistent-slot"
import { referenceSlot } from "@/lib/studio-reference"
import { ReferencePicker } from "./reference-picker"
import { HOUSE_STYLE_PROMPTS, HOUSE_STYLES } from "@/lib/ai-styles"

const STORAGE_KEY = "pixelquest:ai-studio:v4"
const LEGACY_STORAGE_KEY = "pixelquest:ai-studio:v3"
const STYLES_STORAGE_KEY = "pixelquest:ai-styles:v1"
const IDEAS_STORAGE_KEY = "pixelquest:ai-ideas:v1"

type PersistedState = {
  prompt: string
  style: string
  angleId: AngleId
  kind: AssetKind
  size: "1024x1024" | "1536x1024" | "1024x1536"
  styles: string[]
  ideas: string[]
}

type PreviewImage = {
  dataUrl: string
  revisedPrompt?: string
  createdAt: number
  /** kind it was generated as (the form may have changed since) */
  kind?: AssetKind
  /** title for the library: suggested from the prompt, editable */
  name?: string
}

const KIND_NAMES: Record<AssetKind, string> = { background: "Fondo", sprite: "Personaje", object: "Objeto", video: "Video" }

/** Short title from the prompt's first clause ("Bosque encantado de noche, con niebla…" → "Bosque encantado de noche"). */
function suggestAssetName(prompt: string, kind: AssetKind, taken: string[]): string {
  const clause = prompt.split(/[,.;:|\n]/)[0]?.trim() ?? ""
  const list = clause.split(/\s+/).filter(Boolean).slice(0, 5)
  // Don't end on a connector ("…de noche con" → "…de noche").
  const connectors = new Set(["con", "de", "del", "la", "el", "los", "las", "y", "en", "a", "un", "una", "para", "por", "with", "of", "and", "the", "a", "an", "in", "on", "at", "for"])
  while (list.length > 1 && connectors.has(list[list.length - 1].toLowerCase())) list.pop()
  const words = list.join(" ")
  const base = words ? words.charAt(0).toUpperCase() + words.slice(1) : KIND_NAMES[kind]
  let name = base
  for (let n = 2; taken.includes(name); n++) name = `${base} ${n}`
  return name
}

// Survive leaving the view (and reloads): the last preview, and an in-flight generation.
const previewSlot = createSlot<PreviewImage>("pixelquest:studio-preview", { persist: true })
const loadingSlot = createSlot<boolean>("pixelquest:studio-loading")
const errorSlot = createSlot<string>("pixelquest:studio-error")

type AngleId = "front" | "left" | "right" | "top" | "bottom" | "isometric"

const ANGLE_OPTIONS: Array<{
  id: AngleId
  label: string
  prompt: string
  icon: ReactNode
}> = [
  { id: "front", label: "Frente", prompt: "front view", icon: <Compass className="size-4" /> },
  { id: "left", label: "Izquierda", prompt: "left side view", icon: <ArrowLeft className="size-4" /> },
  { id: "right", label: "Derecha", prompt: "right side view", icon: <ArrowRight className="size-4" /> },
  { id: "top", label: "Arriba", prompt: "top-down view", icon: <ArrowUp className="size-4" /> },
  { id: "bottom", label: "Abajo", prompt: "bottom-up view", icon: <ArrowDown className="size-4" /> },
  { id: "isometric", label: "Isométrico", prompt: "isometric 3/4 view", icon: <Compass className="size-4" /> },
]

const DEFAULT_STYLES = [
  "retro pixel art, limited palette",
  "hand-painted fantasy",
  "clean cartoon style",
]

const DEFAULT_IDEAS = [
  "Ancient temple corridor, moody lighting",
  "Detective office at night, rain on window",
  "Old library with hidden mechanism",
]

export function AssetGeneratorPanel() {
  const { project, mutate } = useGameStore()

  // the generator draws images only: videos are uploaded in Cinemáticas
  const [kind, setKind] = useState<Exclude<AssetKind, "video">>("background")
  const [size, setSize] = useState<"1024x1024" | "1536x1024" | "1024x1536">("1024x1024")
  const [prompt, setPrompt] = useState("")
  const [style, setStyle] = useState(HOUSE_STYLES.background.prompt)
  const [angleId, setAngleId] = useState<AngleId>("front")

  const [styles, setStyles] = useState<string[]>(DEFAULT_STYLES)
  const [ideas, setIdeas] = useState<string[]>(DEFAULT_IDEAS)

  const loading = !!useSlot(loadingSlot)
  const setLoading = (v: boolean) => loadingSlot.set(v || null)
  const error = useSlot(errorSlot)
  const setError = (v: string | null) => errorSlot.set(v)
  const [success, setSuccess] = useState<string | null>(null)

  const preview = useSlot(previewSlot)
  const setPreview = (v: PreviewImage | null) => previewSlot.set(v)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {

      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<PersistedState>

      if (typeof saved.prompt === "string") setPrompt(saved.prompt)
      // An empty saved style falls back to the house default.
      if (typeof saved.style === "string" && saved.style.trim()) setStyle(saved.style)
      if (saved.angleId && ANGLE_OPTIONS.some((a) => a.id === saved.angleId)) {
        setAngleId(saved.angleId)
      }
      if (saved.kind === "background" || saved.kind === "sprite" || saved.kind === "object") setKind(saved.kind)
      if (saved.size === "1024x1024" || saved.size === "1536x1024" || saved.size === "1024x1536") setSize(saved.size)
      // House styles are added per asset kind on the fly; keep only the user's own in the list.
      const withDefault = (list: string[]) => list.filter((x) => !HOUSE_STYLE_PROMPTS.has(x))
      if (Array.isArray(saved.styles) && saved.styles.length) {
        setStyles(withDefault(saved.styles.filter((x): x is string => typeof x === "string")))
      } else {
        const rawStyles = localStorage.getItem(STYLES_STORAGE_KEY)
        if (rawStyles) {
          const parsed = JSON.parse(rawStyles)
          if (Array.isArray(parsed) && parsed.length) {
            setStyles(withDefault(parsed.filter((x): x is string => typeof x === "string")))
          }
        }
      }
      if (Array.isArray(saved.ideas) && saved.ideas.length) {
        setIdeas(saved.ideas.filter((x): x is string => typeof x === "string"))
      } else {
        const rawIdeas = localStorage.getItem(IDEAS_STORAGE_KEY)
        if (rawIdeas) {
          const parsed = JSON.parse(rawIdeas)
          if (Array.isArray(parsed) && parsed.length) {
            setIdeas(parsed.filter((x): x is string => typeof x === "string"))
          }
        }
      }
    } catch (err) {
      console.log("[v0] failed to restore AI Studio state:", err)
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const payload: PersistedState = {
      prompt,
      style,
      angleId,
      kind,
      size,
      styles,
      ideas,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    localStorage.setItem(STYLES_STORAGE_KEY, JSON.stringify(styles))
    localStorage.setItem(IDEAS_STORAGE_KEY, JSON.stringify(ideas))
  }, [hydrated, prompt, style, angleId, kind, size, styles, ideas])

  // The house style follows the asset kind (background / object / character version);
  // a style the user typed or picked is left alone.
  useEffect(() => {
    if (!hydrated) return
    if (!style.trim() || HOUSE_STYLE_PROMPTS.has(style)) setStyle(HOUSE_STYLES[kind].prompt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, hydrated])

  function saveCurrentStyle() {
    const value = style.trim()
    if (!value || HOUSE_STYLE_PROMPTS.has(value)) return
    setStyles((prev) => (prev.includes(value) ? prev : [value, ...prev].slice(0, 20)))
  }

  function saveCurrentIdea() {
    const value = prompt.trim()
    if (!value) return
    setIdeas((prev) => (prev.includes(value) ? prev : [value, ...prev].slice(0, 20)))
  }

  async function handleGeneratePreview() {
    if (loading) return
    if (prompt.trim().length < 5) {
      setError("Escribe un prompt más específico")
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const generated = await generateAssetWithByok({
        provider: "openai",
        prompt,
        kind,
        style,
        angleHint: ANGLE_OPTIONS.find((a) => a.id === angleId)?.prompt,
        // Backgrounds: widest size the model offers (3:2), then cropped to the 16:9 game screen.
        size: kind === "background" ? "1536x1024" : size,
        referenceDataUrl: referenceSlot.get()?.dataUrl,
      })

      setPreview({
        dataUrl: kind === "background" ? await cropToAspect(generated.dataUrl) : generated.dataUrl,
        revisedPrompt: generated.revisedPrompt,
        createdAt: Date.now(),
        kind,
        name: suggestAssetName(prompt, kind, project?.assets.map((a) => a.name) ?? []),
      })
      setSuccess(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la imagen")
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveAsset() {
    if (!preview) return
    const finalName = preview.name?.trim() || suggestAssetName(prompt, preview.kind ?? kind, [])
    try {
      const asset = await dataUrlToAsset(preview.dataUrl, preview.kind ?? kind, finalName)
      mutate((d) => ({ ...d, assets: [...d.assets, asset] }))
      // It's in the library now: clear the preview so the next generation starts fresh.
      setPreview(null)
      setSuccess(`«${asset.name}» guardado en la biblioteca.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el asset")
    }
  }

  const kindOptions: Array<{ id: Exclude<AssetKind, "video">; label: string; hint: string; icon: ReactNode }> = [
    { id: "background", label: "Fondo", hint: "Escena completa", icon: <ImageIcon className="size-4" /> },
    { id: "object", label: "Objeto", hint: "Fondo transparente", icon: <Box className="size-4" /> },
    { id: "sprite", label: "Personaje", hint: "Fondo transparente", icon: <User className="size-4" /> },
  ]
  const sizeOptions: Array<{ id: typeof size; label: string; icon: ReactNode }> = [
    { id: "1536x1024", label: "Horizontal", icon: <RectangleHorizontal className="size-4" /> },
    { id: "1024x1024", label: "Cuadrado", icon: <Square className="size-4" /> },
    { id: "1024x1536", label: "Vertical", icon: <RectangleVertical className="size-4" /> },
  ]

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[420px_1fr]">
      {/* Form */}
      <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <FormStep n={1} title="Qué quieres generar">
            <div className="grid grid-cols-3 gap-2">
              {kindOptions.map((k) => (
                <OptionButton key={k.id} active={kind === k.id} onClick={() => setKind(k.id)} title={k.hint}>
                  {k.icon}
                  <span>{k.label}</span>
                </OptionButton>
              ))}
            </div>
            {kind === "background" ? (
              <p className="rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                Los fondos se generan en <span className="text-foreground">16:9</span>, el formato del escenario del
                juego (se pide 1536×1024 y se recorta al centro).
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {sizeOptions.map((o) => (
                  <OptionButton key={o.id} active={size === o.id} onClick={() => setSize(o.id)} title={o.id}>
                    {o.icon}
                    <span>{o.label}</span>
                  </OptionButton>
                ))}
              </div>
            )}
            {kind !== "background" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Ángulo</Label>
                <div className="grid grid-cols-3 gap-2">
                  {ANGLE_OPTIONS.map((angle) => (
                    <OptionButton
                      key={angle.id}
                      active={angle.id === angleId}
                      onClick={() => setAngleId(angle.id)}
                      title={angle.prompt}
                    >
                      {angle.icon}
                      <span>{angle.label}</span>
                    </OptionButton>
                  ))}
                </div>
              </div>
            )}
          </FormStep>

          <FormStep n={2} title="Imagen de referencia (opcional)">
            <ReferencePicker assets={project?.assets ?? []} />
          </FormStep>

          <FormStep
            n={3}
            title="Descripción"
            action={
              <button type="button" onClick={saveCurrentIdea} className="text-xs text-muted-foreground hover:text-foreground">
                Guardar como idea
              </button>
            }
          >
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ancient temple corridor, point-and-click adventure, cinematic lighting"
              rows={5}
            />
            {ideas.length > 0 && (
              <select
                aria-label="Ideas guardadas"
                value=""
                onChange={(e) => e.target.value && setPrompt(e.target.value)}
                className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs text-muted-foreground"
              >
                <option value="">Usar una idea guardada…</option>
                {ideas.map((idea) => (
                  <option key={idea} value={idea}>
                    {idea}
                  </option>
                ))}
              </select>
            )}
          </FormStep>

          <FormStep
            n={4}
            title="Estilo"
            action={
              <button type="button" onClick={saveCurrentStyle} className="text-xs text-muted-foreground hover:text-foreground">
                Guardar estilo
              </button>
            }
          >
            <Textarea
              id="style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="retro pixel art, high contrast"
              rows={4}
              className="text-xs"
            />
            {styles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[HOUSE_STYLES[kind].prompt, ...styles].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(s)}
                    title={s}
                    className={cn(
                      "max-w-full truncate rounded-full border px-2.5 py-1 text-xs transition-colors",
                      style === s
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s === HOUSE_STYLES[kind].prompt ? `${HOUSE_STYLES[kind].label} (predeterminado)` : s}
                  </button>
                ))}
              </div>
            )}
          </FormStep>
        </div>

        <div className="shrink-0 space-y-2 border-t border-border p-4">
          <Button className="w-full" onClick={handleGeneratePreview} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generando…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />{" "}
                {preview && (preview.kind ?? kind) === kind ? "Generar otra versión" : "Generar vista previa"}
              </>
            )}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </section>

      {/* Preview */}
      <section className="flex min-h-0 flex-col">
        <div className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#ffffff08_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-6">
          {preview && preview.kind && preview.kind !== kind && (
            <div className="absolute left-3 top-3 z-10 rounded-md border border-amber-500/40 bg-black/80 px-2.5 py-1.5 text-xs text-amber-100">
              Vista previa de un {KIND_NAMES[preview.kind]}, sin guardar. Guárdala o descártala; generar ahora creará un{" "}
              {KIND_NAMES[kind]}.
            </div>
          )}
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.dataUrl} alt="Vista previa" className="max-h-full max-w-full rounded object-contain shadow-2xl" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
              {loading ? <Loader2 className="size-6 animate-spin" /> : <ImageIcon className="size-6" />}
              <p>{loading ? "Generando… puede tardar hasta un minuto." : "La vista previa aparecerá aquí."}</p>
            </div>
          )}
          {loading && preview && (
            <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-border p-4">
          {preview?.revisedPrompt && (
            <p className="line-clamp-2 text-xs text-muted-foreground" title={preview.revisedPrompt}>
              Prompt refinado: {preview.revisedPrompt}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="asset-name"
              value={preview?.name ?? ""}
              onChange={(e) => preview && setPreview({ ...preview, name: e.target.value })}
              placeholder="Nombre del asset (ej. temple_bg_01)"
              className="h-9 min-w-48 flex-1"
              disabled={!preview}
            />
            <Button onClick={handleSaveAsset} disabled={!preview}>
              <Save className="size-4" /> Guardar en biblioteca
            </Button>
            {preview && (
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={loading} title="Quitar esta vista previa">
                Descartar
              </Button>
            )}
          </div>
          {success && <p className="text-sm text-emerald-500">{success}</p>}
        </div>
      </section>
    </div>
  )
}

function FormStep({
  n,
  title,
  action,
  children,
}: {
  n: number
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
            {n}
          </span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function OptionButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-input bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
