"use client"

import { Plus, X } from "lucide-react"
import type { GameEffect, GameProject } from "@/lib/game-types"
import { Input } from "@/components/ui/input"

type EffectKind = "flagOn" | "flagOff" | "giveItem" | "removeItem" | "goToScene" | "playCinematic" | "endGame"

const KIND_LABELS: Record<EffectKind, string> = {
  flagOn: "Activar variable",
  flagOff: "Desactivar variable",
  giveItem: "Dar objeto",
  removeItem: "Quitar objeto",
  goToScene: "Ir a escena",
  playCinematic: "Mostrar cinemática",
  endGame: "Terminar juego",
}

function kindOf(fx: GameEffect): EffectKind {
  if (fx.type === "setFlag") return fx.value ? "flagOn" : "flagOff"
  return fx.type
}

function defaultEffect(kind: EffectKind, project: GameProject): GameEffect {
  switch (kind) {
    case "flagOn":
      return { type: "setFlag", flag: "", value: true }
    case "flagOff":
      return { type: "setFlag", flag: "", value: false }
    case "giveItem":
      return { type: "giveItem", itemId: project.items[0]?.id ?? "" }
    case "removeItem":
      return { type: "removeItem", itemId: project.items[0]?.id ?? "" }
    case "goToScene":
      return { type: "goToScene", sceneId: project.scenes[0]?.id ?? "" }
    case "playCinematic":
      return { type: "playCinematic", cinematicId: project.cinematics?.[0]?.id ?? "" }
    case "endGame":
      return { type: "endGame", text: "" }
  }
}

export const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Editable list of effects ("activar variable X", "dar objeto Y"…). */
export function EffectsEditor({
  project,
  effects,
  onChange,
  flagListId,
}: {
  project: GameProject
  effects: GameEffect[] | undefined
  onChange: (effects: GameEffect[]) => void
  /** id of a <datalist> with known flag names */
  flagListId: string
}) {
  const list = effects ?? []
  const update = (i: number, fx: GameEffect) => onChange(list.map((x, j) => (j === i ? fx : x)))

  return (
    <div className="space-y-1.5">
      {list.map((fx, i) => {
        const kind = kindOf(fx)
        return (
          <div key={i} className="flex items-center gap-1.5">
            <select
              value={kind}
              onChange={(e) => update(i, defaultEffect(e.target.value as EffectKind, project))}
              className={`${selectClass} w-40 shrink-0`}
              aria-label="Tipo de efecto"
            >
              {(Object.keys(KIND_LABELS) as EffectKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>

            {fx.type === "setFlag" && (
              <Input
                value={fx.flag}
                list={flagListId}
                onChange={(e) => update(i, { ...fx, flag: e.target.value.replace(/\s+/g, "_") })}
                placeholder="nombre_variable"
                className="h-8 min-w-0 flex-1 font-mono text-xs"
              />
            )}
            {(fx.type === "giveItem" || fx.type === "removeItem") && (
              <select
                value={fx.itemId}
                onChange={(e) => update(i, { ...fx, itemId: e.target.value })}
                className={`${selectClass} min-w-0 flex-1`}
                aria-label="Objeto"
              >
                {project.items.length === 0 && <option value="">(sin objetos en el proyecto)</option>}
                {project.items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
            )}
            {fx.type === "goToScene" && (
              <>
                <select
                  value={fx.sceneId}
                  onChange={(e) => update(i, { ...fx, sceneId: e.target.value })}
                  className={`${selectClass} min-w-0 flex-1`}
                  aria-label="Escena"
                >
                  {project.scenes.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </select>
                {/* Where the character appears: by default, at the door that leads back. */}
                <select
                  value={fx.at ? "point" : "door"}
                  onChange={(e) => update(i, { ...fx, at: e.target.value === "point" ? { x: 0.5, y: 0.85 } : null })}
                  className={`${selectClass} w-36 shrink-0`}
                  aria-label="Dónde aparece"
                  title="Dónde aparece el personaje en la escena nueva"
                >
                  <option value="door">en la puerta de regreso</option>
                  <option value="point">en un punto (%)</option>
                </select>
                {fx.at &&
                  (["x", "y"] as const).map((k) => (
                    <Input
                      key={k}
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round(fx.at![k] * 100)}
                      onChange={(e) => update(i, { ...fx, at: { ...fx.at!, [k]: Math.max(0, Math.min(100, Number(e.target.value))) / 100 } })}
                      className="h-8 w-14 shrink-0 text-xs"
                      aria-label={k === "x" ? "Horizontal (%)" : "Vertical (%)"}
                      title={k === "x" ? "Horizontal: 0 = izquierda, 100 = derecha" : "Vertical: 0 = arriba, 100 = abajo"}
                    />
                  ))}
              </>
            )}
            {fx.type === "playCinematic" && (
              <select
                value={fx.cinematicId}
                onChange={(e) => update(i, { ...fx, cinematicId: e.target.value })}
                className={`${selectClass} min-w-0 flex-1`}
                aria-label="Cinemática"
                title="Se muestra al pasar esta línea (o al elegir esta opción)"
              >
                {!project.cinematics?.length && <option value="">(crea una en Cinemáticas)</option>}
                {(project.cinematics ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {fx.type === "endGame" && (
              <Input
                value={fx.text ?? ""}
                onChange={(e) => update(i, { ...fx, text: e.target.value })}
                placeholder="Mensaje final (opcional)"
                className="h-8 min-w-0 flex-1 text-xs"
              />
            )}

            <button
              type="button"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
              title="Quitar efecto"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => onChange([...list, defaultEffect("flagOn", project)])}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" /> Agregar efecto
      </button>
    </div>
  )
}
