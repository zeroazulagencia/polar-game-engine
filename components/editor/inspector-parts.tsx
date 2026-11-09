"use client"

import { useId, useState } from "react"
import { ChevronRight, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { useGameStore } from "@/lib/game-store"
import { collectFlags, type HotspotAction, type HotspotActionType, type LineCondition, type ObjectStop, type Point, type SceneObject } from "@/lib/game-types"

export function Native({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
      {children}
    </select>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export function Header({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-foreground">
      <span className="text-primary">{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  )
}

export function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-snug text-muted-foreground">{children}</p>
}

/** A titled block of the inspector, answering one question ("¿Cuándo aparece?"). Folds closed. */
export function Section({
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  title: string
  /** what is set now, shown next to the title (also while folded) */
  summary?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-3 py-2 text-left">
        <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {summary && <span className="ml-auto truncate pl-2 text-[11px] text-muted-foreground">{summary}</span>}
      </button>
      {open && <div className="flex flex-col gap-3 border-t border-border px-3 pb-3 pt-2.5">{children}</div>}
    </div>
  )
}

/** Choices for where the character turns when it uses a hotspot or object. */
export function FaceOptions() {
  return (
    <>
      <option value="auto">Hacia el elemento (automático)</option>
      <option value="left">Izquierda</option>
      <option value="right">Derecha</option>
      <option value="down">De frente (hacia la cámara)</option>
      <option value="up">De espaldas (hacia el fondo)</option>
      <option value="none">No girar</option>
    </>
  )
}

type CondMode = "always" | "flag" | "noflag" | "item" | "noitem"

/** One condition on a variable or an item, as a sentence: "cuando la variable X está activa". */
export function ConditionPicker({
  value,
  onChange,
  alwaysLabel = "Siempre",
}: {
  value: LineCondition | null | undefined
  onChange: (c: LineCondition | null) => void
  alwaysLabel?: string
}) {
  const { project } = useGameStore()
  const listId = useId()
  if (!project) return null
  const mode: CondMode = !value ? "always" : value.kind === "flag" ? (value.negate ? "noflag" : "flag") : value.negate ? "noitem" : "item"
  const setMode = (m: CondMode) => {
    if (m === "always") return onChange(null)
    const kind = m === "flag" || m === "noflag" ? "flag" : "item"
    const id = value?.kind === kind ? value.id : kind === "item" ? (project.items[0]?.id ?? "") : ""
    onChange({ kind, id, negate: m === "noflag" || m === "noitem" })
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Native value={mode} onChange={(v) => setMode(v as CondMode)}>
        <option value="always">{alwaysLabel}</option>
        <option value="flag">Cuando una variable está activa</option>
        <option value="noflag">Cuando una variable NO está activa</option>
        <option value="item">Cuando el jugador tiene un objeto</option>
        <option value="noitem">Cuando el jugador NO tiene un objeto</option>
      </Native>
      {value?.kind === "flag" && (
        <>
          <Input
            value={value.id}
            list={listId}
            onChange={(e) => onChange({ ...value, id: e.target.value.replace(/\s+/g, "_") })}
            placeholder="nombre_de_la_variable"
            className="h-8 font-mono text-xs"
          />
          <datalist id={listId}>
            {collectFlags(project).map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </>
      )}
      {value?.kind === "item" && (
        <Native value={value.id} onChange={(v) => onChange({ ...value, id: v })}>
          {project.items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
            </option>
          ))}
        </Native>
      )}
    </div>
  )
}

/** Short text of a condition, for section summaries. */
export function conditionText(c: LineCondition | null | undefined, items: Array<{ id: string; name: string }>) {
  if (!c?.id) return "siempre"
  const what = c.kind === "flag" ? c.id : (items.find((i) => i.id === c.id)?.name ?? c.id)
  return `${c.negate ? "sin" : "con"} ${what}`
}

/** A point on the stage, as two percentage sliders. */
export function PointSliders({ value, onChange }: { value: Point; onChange: (p: Point) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={`Horizontal · ${Math.round(value.x * 100)}%`}>
        <Slider value={[value.x]} min={0} max={1} step={0.005} onValueChange={([x]) => onChange({ ...value, x })} />
      </Field>
      <Field label={`Vertical · ${Math.round(value.y * 100)}%`}>
        <Slider value={[value.y]} min={0} max={1} step={0.005} onValueChange={([y]) => onChange({ ...value, y })} />
      </Field>
    </div>
  )
}

/** Where the protagonist stands to use something: automatic, or a point chosen here. */
export function StandPointPicker({ value, onChange, auto }: { value: Point | null | undefined; onChange: (p: Point | null) => void; auto: Point }) {
  return (
    <Field label="Dónde se para el personaje">
      <Native value={value ? "point" : "auto"} onChange={(v) => onChange(v === "point" ? { ...auto } : null)}>
        <option value="auto">Automático (al pie del elemento)</option>
        <option value="point">En un punto exacto</option>
      </Native>
      {value && <PointSliders value={value} onChange={onChange} />}
    </Field>
  )
}

/** What a click does: the same choices for hotspots and objects. */
export function ActionFields({
  action,
  onChange,
  currentSceneId,
  children,
}: {
  action: HotspotAction
  onChange: (p: Partial<HotspotAction>) => void
  currentSceneId: string
  /** extra fields shown under the chosen action */
  children?: React.ReactNode
}) {
  const { project } = useGameStore()
  if (!project) return null
  return (
    <>
      <Field label="Al hacer clic">
        <Native value={action.type} onChange={(v) => onChange({ type: v as HotspotActionType })}>
          <option value="none">No pasa nada</option>
          <option value="dialog">Abre un diálogo</option>
          <option value="goToScene">Lleva a otra escena</option>
          <option value="pickup">Se recoge un objeto</option>
          <option value="endGame">Termina el juego</option>
        </Native>
      </Field>
      {action.type === "goToScene" && (
        <Field label="Escena de destino">
          <Native value={action.targetSceneId ?? ""} onChange={(v) => onChange({ targetSceneId: v || null })}>
            <option value="">Elige una escena…</option>
            {project.scenes
              .filter((s) => s.id !== currentSceneId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Native>
        </Field>
      )}
      {action.type === "dialog" && (
        <Field label="Diálogo">
          <Native value={action.dialogId ?? ""} onChange={(v) => onChange({ dialogId: v || null })}>
            <option value="">Elige un diálogo…</option>
            {project.dialogs.map((dl) => (
              <option key={dl.id} value={dl.id}>
                {dl.name}
              </option>
            ))}
          </Native>
        </Field>
      )}
      {action.type === "pickup" && (
        <Field label="Objeto que se recoge">
          <Native value={action.itemId ?? ""} onChange={(v) => onChange({ itemId: v || null })}>
            <option value="">Elige un objeto…</option>
            {project.items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </Native>
        </Field>
      )}
      {action.type === "endGame" && (
        <Field label="Mensaje del final">
          <Input value={action.endGameText ?? ""} onChange={(e) => onChange({ endGameText: e.target.value || null })} placeholder="¡Fin!" />
        </Field>
      )}
      {children}
    </>
  )
}

/** Other backgrounds for the same place, each with the condition that shows it. */
export function BackgroundVariantsEditor({
  variants,
  onChange,
}: {
  variants: Array<{ assetId: string; when: LineCondition }>
  onChange: (v: Array<{ assetId: string; when: LineCondition }>) => void
}) {
  const { project } = useGameStore()
  if (!project) return null
  const backgrounds = project.assets.filter((a) => a.kind === "background")
  return (
    <>
      <Help>
        La misma escena con otro fondo cuando pasa algo (de noche, destruida, 300 años después). Zonas y objetos se
        mantienen: dibuja el fondo nuevo con la misma cámara. Si se cumplen varias, gana la última.
      </Help>
      {variants.map((v, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
          <div className="flex items-center gap-1.5">
            <Native value={v.assetId} onChange={(assetId) => onChange(variants.map((x, j) => (j === i ? { ...x, assetId } : x)))}>
              {backgrounds.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Native>
            <Button size="icon" variant="ghost" className="size-8 shrink-0" title="Quitar" onClick={() => onChange(variants.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <ConditionPicker value={v.when} onChange={(when) => when && onChange(variants.map((x, j) => (j === i ? { ...x, when } : x)))} alwaysLabel="(elige cuándo)" />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={!backgrounds.length}
        onClick={() => onChange([...variants, { assetId: backgrounds[0].id, when: { kind: "flag", id: "" } }])}
      >
        <Plus className="size-4" /> Añadir fondo alternativo
      </Button>
    </>
  )
}

/** Places a character object walks to as the story advances. */
export function RouteEditor({ obj, onChange }: { obj: SceneObject; onChange: (p: Partial<SceneObject>) => void }) {
  const { project } = useGameStore()
  if (!project) return null
  const stops = obj.stops ?? []
  const setStops = (s: ObjectStop[]) => onChange({ stops: s.length ? s : undefined })
  const sprites = project.assets.filter((a) => a.kind === "sprite" || a.kind === "object")
  const frames = obj.walkAssetIds ?? []
  return (
    <>
      <Help>
        El personaje empieza donde lo pusiste y camina hasta el último punto cuya condición se cumple. Sirve para que
        alguien te guíe o cambie de lugar cuando avanza la historia.
      </Help>
      {stops.map((st, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Punto {i + 1}</span>
            <Button size="icon" variant="ghost" className="size-7" title="Quitar" onClick={() => setStops(stops.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <PointSliders value={st} onChange={(p) => setStops(stops.map((x, j) => (j === i ? { ...x, ...p } : x)))} />
          <ConditionPicker value={st.when} onChange={(when) => when && setStops(stops.map((x, j) => (j === i ? { ...x, when } : x)))} alwaysLabel="(elige cuándo)" />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => setStops([...stops, { x: obj.x, y: obj.y, when: { kind: "flag", id: "" } }])}>
        <Plus className="size-4" /> Añadir punto
      </Button>
      {stops.length > 0 && (
        <Field label={`Cuadros al caminar (${frames.length})`}>
          <Help>Sin cuadros se desliza con su imagen de siempre. Elige los cuadros en orden.</Help>
          {frames.map((id, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Native value={id} onChange={(v) => onChange({ walkAssetIds: frames.map((x, j) => (j === i ? v : x)) })}>
                {sprites.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Native>
              <Button size="icon" variant="ghost" className="size-8 shrink-0" title="Quitar" onClick={() => onChange({ walkAssetIds: frames.filter((_, j) => j !== i) })}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => onChange({ walkAssetIds: [...frames, obj.assetId] })}>
            <Plus className="size-4" /> Añadir cuadro
          </Button>
        </Field>
      )}
    </>
  )
}
