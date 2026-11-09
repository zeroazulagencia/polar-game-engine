"use client"

import { useState } from "react"
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PLAYER_SPEAKER, displaySpeaker, protagonistName } from "@/lib/protagonist"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useGameStore } from "@/lib/game-store"
import { DEFAULT_DIALOG_STYLE, type DialogStyle } from "@/lib/game-types"
import { cn } from "@/lib/utils"
import { DialogBox } from "./dialog-box"
import { DIALOG_PRESETS } from "@/lib/dialog-style"
import { confirmAction } from "@/components/ui/confirm-host"

const SAMPLE = {
  speaker: "Guardián",
  text: "Nadie ha cruzado estas puertas en siglos. ¿Qué te trae al templo, forastero?",
  choices: [
    { id: "a", text: "Busco el cristal perdido." },
    { id: "b", text: "Solo estoy de paso." },
  ],
}

type Target = "default" | string

/** Visual design of the in-game dialog box: project default + custom styles, with presets and live preview. */
/** Distinct, readable name colors for "assign automatically". */
const SPEAKER_PALETTE = ["#fbbf24", "#60a5fa", "#f472b6", "#34d399", "#c084fc", "#fb923c", "#22d3ee", "#a3e635"]

export function DialogDesign() {
  const { project, mutate, checkpoint } = useGameStore()
  const [target, setTarget] = useState<Target>("default")
  const [withChoices, setWithChoices] = useState(true)
  const [replay, setReplay] = useState(0)
  const [naming, setNaming] = useState<null | { mode: "new" | "rename"; value: string }>(null)
  if (!project) return null

  const customs = project.dialogStyles ?? []
  const custom = target === "default" ? null : customs.find((c) => c.id === target) ?? null
  const editingDefault = !custom
  const style: DialogStyle = { ...DEFAULT_DIALOG_STYLE, ...(custom ? custom.style : project.dialogStyle) }

  const set = (patch: Partial<DialogStyle>, opts?: { history?: boolean }) =>
    mutate((d) => {
      if (custom) {
        return {
          ...d,
          dialogStyles: (d.dialogStyles ?? []).map((c) =>
            c.id === custom.id ? { ...c, style: { ...DEFAULT_DIALOG_STYLE, ...c.style, ...patch } } : c,
          ),
        }
      }
      return { ...d, dialogStyle: { ...DEFAULT_DIALOG_STYLE, ...d.dialogStyle, ...patch } }
    }, opts)

  // Characters that speak in the project's dialogs (each can get its own name color).
  const speakers = Array.from(
    new Map(
      project.dialogs
        .flatMap((dl) => dl.lines.map((l) => l.speaker.trim()))
        .filter(Boolean)
        .map((name) => [name.toLowerCase(), name] as const),
    ).values(),
  )
  const speakerLabel = (key: string) => (key === PLAYER_SPEAKER ? `${protagonistName(project)} (protagonista)` : key)
  const setSpeakerColor = (name: string, color: string | null) => {
    const next = { ...(style.speakerColors ?? {}) }
    if (color) next[name.toLowerCase()] = color
    else delete next[name.toLowerCase()]
    set({ speakerColors: next })
  }
  const autoColors = () =>
    set({
      speakerColors: Object.fromEntries(speakers.map((n, i) => [n.toLowerCase(), SPEAKER_PALETTE[i % SPEAKER_PALETTE.length]])),
    })
  const previewSpeaker = speakers.length ? speakers[replay % speakers.length] : SAMPLE.speaker

  const usage = (styleId: string | null) =>
    project.dialogs.filter((dl) => (styleId ? dl.styleId === styleId : !dl.styleId)).length

  function commitName() {
    if (!naming) return
    const name = naming.value.trim()
    if (!name) return setNaming(null)
    if (naming.mode === "new") {
      const id = crypto.randomUUID()
      mutate((d) => ({ ...d, dialogStyles: [...(d.dialogStyles ?? []), { id, name, style }] }))
      setTarget(id)
    } else if (custom) {
      mutate((d) => ({
        ...d,
        dialogStyles: (d.dialogStyles ?? []).map((c) => (c.id === custom.id ? { ...c, name } : c)),
      }))
    }
    setNaming(null)
  }

  async function deleteCustom() {
    if (!custom) return
    const used = usage(custom.id)
    const msg = used
      ? `«${custom.name}» lo usan ${used} diálogo(s); pasarán al estilo predeterminado. ¿Eliminarlo?`
      : `¿Eliminar el estilo «${custom.name}»?`
    if (!(await confirmAction(msg, { confirmLabel: "Eliminar", destructive: true }))) return
    mutate((d) => ({
      ...d,
      dialogStyles: (d.dialogStyles ?? []).filter((c) => c.id !== custom.id),
      dialogs: d.dialogs.map((dl) => (dl.styleId === custom.id ? { ...dl, styleId: null } : dl)),
    }))
    setTarget("default")
  }

  const startScene = project.scenes.find((s) => s.id === project.startSceneId) ?? project.scenes[0]
  const bg = project.assets.find((a) => a.id === startScene?.backgroundAssetId)

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[380px_1fr]">
      <section className="min-h-0 space-y-6 overflow-y-auto border-b border-border p-5 lg:border-b-0 lg:border-r">
        {/* Which style is being edited */}
        <Group title="Estilo que estás editando">
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value)
              setNaming(null)
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Estilo que estás editando"
          >
            <option value="default">Predeterminado del proyecto · {usage(null)} diálogo(s)</option>
            {customs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {usage(c.id)} diálogo(s)
              </option>
            ))}
          </select>
          {naming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                commitName()
              }}
            >
              <input
                autoFocus
                value={naming.value}
                onChange={(e) => setNaming({ ...naming, value: e.target.value })}
                placeholder="Nombre del estilo"
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              />
              <Button type="submit" size="sm" disabled={!naming.value.trim()}>
                Guardar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(null)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setNaming({ mode: "new", value: "" })}>
                <Plus className="size-3.5" /> Guardar como estilo nuevo
              </Button>
              {custom && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setNaming({ mode: "rename", value: custom.name })}>
                    <Pencil className="size-3.5" /> Renombrar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={deleteCustom}>
                    <Trash2 className="size-3.5" /> Eliminar
                  </Button>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {editingDefault
              ? "Lo usan todos los diálogos que no tienen un estilo propio."
              : "Asígnalo a un diálogo desde la pestaña Conversaciones (selector «Estilo»)."}
          </p>
        </Group>

        <Group title="Partir de un estilo predefinido">
          <div className="grid grid-cols-3 gap-2">
            {DIALOG_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set(p.style)}
                title={`Copiar los valores de «${p.name}» al estilo que estás editando`}
                className="group overflow-hidden rounded-md border border-border text-left hover:border-foreground/40"
              >
                <div className="flex h-10 items-end bg-gradient-to-br from-slate-600 to-slate-900 p-1">
                  <div
                    className="h-4 w-full"
                    style={{
                      background: p.style.background,
                      opacity: p.style.backgroundOpacity,
                      border: `1px solid ${p.style.border}`,
                      borderRadius: Math.min(p.style.radius, 6),
                    }}
                  />
                </div>
                <p className="truncate px-1.5 py-1 text-[11px]">{p.name}</p>
              </button>
            ))}
          </div>
        </Group>

        <Group title="Posición y tamaño">
          <Segmented
            value={style.position}
            onChange={(position) => set({ position })}
            options={[
              ["bottom", "Abajo"],
              ["center", "Centro"],
              ["top", "Arriba"],
            ]}
          />
          <Segmented
            value={style.width}
            onChange={(width) => set({ width })}
            options={[
              ["full", "Ancho completo"],
              ["wide", "Amplio"],
              ["narrow", "Angosto"],
            ]}
          />
          <SliderRow
            label="Margen (separación del borde)"
            value={style.margin}
            min={0}
            max={64}
            unit="px"
            onStart={checkpoint}
            onChange={(margin) => set({ margin }, { history: false })}
          />
          <SliderRow
            label="Relleno interno"
            value={style.padding}
            min={6}
            max={40}
            unit="px"
            onStart={checkpoint}
            onChange={(padding) => set({ padding }, { history: false })}
          />
          <SliderRow
            label="Esquinas"
            value={style.radius}
            min={0}
            max={24}
            unit="px"
            onStart={checkpoint}
            onChange={(radius) => set({ radius }, { history: false })}
          />
        </Group>

        <Group title="Colores">
          <ColorRow label="Fondo" value={style.background} onChange={(background) => set({ background })} />
          <SliderRow
            label="Opacidad del fondo"
            value={Math.round(style.backgroundOpacity * 100)}
            min={20}
            max={100}
            unit="%"
            onStart={checkpoint}
            onChange={(v) => set({ backgroundOpacity: v / 100 }, { history: false })}
          />
          <ColorRow label="Borde" value={style.border} onChange={(border) => set({ border })} />
          <ColorRow label="Texto" value={style.text} onChange={(text) => set({ text })} />
          <ColorRow label="Nombre de quien habla" value={style.speaker} onChange={(speaker) => set({ speaker })} />
          <ColorRow label="Opciones del jugador" value={style.choice} onChange={(choice) => set({ choice })} />
        </Group>

        <Group title="Color por personaje">
          <label className="flex items-center justify-between gap-2 text-xs">
            <span>
              Fondo de un tono distinto por personaje
              <span className="block text-[11px] text-muted-foreground">
                Mismo color de fondo, más claro u oscuro según quién habla: el narrador lo deja igual y el protagonista
                siempre un poco más oscuro. Haz clic en la vista previa para ver otros personajes.
              </span>
            </span>
            <Switch checked={style.speakerShades !== false} onCheckedChange={(v) => set({ speakerShades: v })} />
          </label>
          <p className="text-xs text-muted-foreground">
            El nombre de cada personaje con su propio color en este estilo. Sin color propio usa «Nombre de quien habla».
          </p>
          {speakers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aún no hay personajes que hablen en los diálogos.</p>
          ) : (
            <>
              {speakers.map((name) => {
                const own = style.speakerColors?.[name.toLowerCase()]
                return (
                  <div key={name} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <ColorRow label={speakerLabel(name)} value={own ?? style.speaker} onChange={(c) => setSpeakerColor(name, c)} />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      disabled={!own}
                      onClick={() => setSpeakerColor(name, null)}
                      title="Usar el color general"
                    >
                      ↺
                    </Button>
                  </div>
                )
              })}
              <Button size="sm" variant="outline" onClick={autoColors}>
                Asignar colores distintos automáticamente
              </Button>
            </>
          )}
        </Group>

        <Group title="Texto">
          <Segmented
            value={style.font}
            onChange={(font) => set({ font })}
            options={[
              ["sans", "Sans"],
              ["serif", "Serif"],
              ["mono", "Mono"],
              ["rounded", "Redonda"],
            ]}
          />
          <SliderRow
            label="Tamaño de letra"
            value={style.fontSize}
            min={11}
            max={28}
            unit="px"
            onStart={checkpoint}
            onChange={(fontSize) => set({ fontSize }, { history: false })}
          />
          <SliderRow
            label="Máquina de escribir"
            value={style.typewriterSpeed}
            min={0}
            max={120}
            step={5}
            unit=" letras/s"
            zeroLabel="desactivada"
            onStart={checkpoint}
            onChange={(typewriterSpeed) => set({ typewriterSpeed }, { history: false })}
          />
        </Group>

        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => set(DEFAULT_DIALOG_STYLE)}>
          <RotateCcw className="size-4" /> Restablecer a «Clásico»
        </Button>
      </section>

      <section className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Vista previa · <span className="text-foreground">{custom ? custom.name : "Predeterminado del proyecto"}</span>
          </p>
          <div className="flex items-center gap-2">
            <Segmented
              value={withChoices ? "choices" : "line"}
              onChange={(v) => setWithChoices(v === "choices")}
              options={[
                ["line", "Línea"],
                ["choices", "Con opciones"],
              ]}
            />
            {style.typewriterSpeed > 0 && (
              <Button size="sm" variant="outline" onClick={() => setReplay((n) => n + 1)}>
                Repetir animación
              </Button>
            )}
          </div>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
          {bg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bg.dataUrl} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <DialogBox
            style={style}
            lineKey={`preview-${replay}-${withChoices}-${target}`}
            speaker={displaySpeaker(project, previewSpeaker)}
            colorKey={previewSpeaker}
            text={SAMPLE.text}
            choices={withChoices ? SAMPLE.choices : []}
            hint="Siguiente →"
            onAdvance={() => setReplay((n) => n + 1)}
          />
        </div>
      </section>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<[T, string]>
}) {
  return (
    <div className="flex rounded-md bg-muted p-0.5 text-xs">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex-1 rounded px-2 py-1.5 transition-colors",
            value === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-7 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
      </span>
    </label>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  zeroLabel,
  onStart,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit: string
  zeroLabel?: string
  onStart: () => void
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <Label className="font-normal">{label}</Label>
        <span className="text-xs text-muted-foreground">{value === 0 && zeroLabel ? zeroLabel : `${value}${unit}`}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onPointerDown={onStart} onValueChange={([v]) => onChange(v)} />
    </div>
  )
}
