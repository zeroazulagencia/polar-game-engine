"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Settings2, Trash2, Star, MousePointerClick, User, Box, RotateCw, FlipHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGameStore } from "@/lib/game-store"
import { useEditorUI } from "./editor-context"
import { collectFlags, type HotspotActionType } from "@/lib/game-types"
import type { FaceOnArrive, SceneObject } from "@/lib/game-types"
import {
  ActionFields,
  BackgroundVariantsEditor,
  ConditionPicker,
  conditionText,
  FaceOptions,
  Field,
  Header,
  Help,
  Native,
  RouteEditor,
  Section,
  StandPointPicker,
} from "./inspector-parts"
import { newWaypointLook, rememberWaypointLook } from "@/lib/depth-defaults"

export function Inspector() {
  const { project, mutate, checkpoint } = useGameStore()
  // Slider drags count as one undo step (checkpoint on the first change of the drag).
  const sliderDrag = useRef<"idle" | "pending" | "live">("idle")
  const sliderOpts = () => {
    if (sliderDrag.current === "idle") return undefined
    if (sliderDrag.current === "pending") {
      checkpoint()
      sliderDrag.current = "live"
    }
    return { history: false }
  }
  const { activeSceneId, selection, setSelection } = useEditorUI()
  const scene = project?.scenes.find((s) => s.id === activeSceneId)
  const [sceneNameDraft, setSceneNameDraft] = useState("")
  const [dragLayerId, setDragLayerId] = useState<string | null>(null)

  useEffect(() => {
    setSceneNameDraft(scene?.name ?? "")
  }, [scene?.id, scene?.name])

  if (!project) return null

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-sidebar">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <Settings2 className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Inspector</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {!scene && (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground text-balance">
              Select or create a scene to edit its properties.
            </p>
          )}

          {scene && selection.type === "hotspot" && <HotspotInspector />}
          {scene && selection.type === "sceneObject" && <SceneObjectInspector />}
          {scene && selection.type === "character" && <CharacterInspector />}
          {scene && selection.type === "depthWaypoint" && <DepthWaypointInspector />}
          {scene && (selection.type === "scene" || selection.type === "none") && renderSceneInspector()}
        </div>
      </ScrollArea>
    </div>
  )

  function renderSceneInspector() {
    if (!scene) return null
    const currentSceneId = scene.id

    const backgrounds = project!.assets.filter((a) => a.kind === "background")
    const isStart = project!.startSceneId === scene.id
    const objectEntries = [...(scene.sceneObjects ?? [])].map((o) => ({
      id: `obj:${o.id}`,
      kind: "object" as const,
      object: o,
    }))
    const hotspotEntries = [...(scene.hotspots ?? [])].map((h) => ({
      id: `hot:${h.id}`,
      kind: "hotspot" as const,
      hotspot: h,
    }))
    const charSlot = Math.max(0, Math.min(objectEntries.length, scene.characterLayerZ ?? 0))
    const layers: Array<
      | { id: string; kind: "object"; object: (typeof objectEntries)[number]["object"] }
      | { id: string; kind: "hotspot"; hotspot: (typeof hotspotEntries)[number]["hotspot"] }
      | { id: "character"; kind: "character" }
    > = []
    for (let i = 0; i <= objectEntries.length; i++) {
      if (i === charSlot) layers.push({ id: "character", kind: "character" })
      if (i < objectEntries.length) layers.push(objectEntries[i])
    }
    layers.push(...hotspotEntries)
    return (
      <div className="flex flex-col gap-4">
        <Header icon={<MousePointerClick className="size-4" />} title="Escena" />
        <Section title="Lo básico" summary={isStart ? "escena inicial" : ""}>
          <Field label="Nombre">
            <Input
              value={sceneNameDraft}
              onChange={(e) => setSceneNameDraft(e.target.value)}
              onBlur={() => {
                const nextName = sceneNameDraft.trim()
                mutate((d) => ({
                  ...d,
                  scenes: d.scenes.map((s) =>
                    s.id === currentSceneId ? { ...s, name: nextName || s.name } : s,
                  ),
                }))
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
            />
          </Field>
          <Field label="Fondo">
            <Native
              value={scene.backgroundAssetId ?? ""}
              onChange={(v) =>
                mutate((d) => ({
                  ...d,
                  scenes: d.scenes.map((s) =>
                    s.id === scene.id ? { ...s, backgroundAssetId: v || null } : s,
                  ),
                }))
              }
            >
              <option value="">Sin fondo</option>
              {backgrounds.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Native>
          </Field>

          <Button
            variant={isStart ? "secondary" : "outline"}
            onClick={() => mutate((d) => ({ ...d, startSceneId: scene.id }))}
            disabled={isStart}
          >
            <Star className={isStart ? "size-4 fill-primary text-primary" : "size-4"} />
            {isStart ? "Es la escena inicial" : "Usar como escena inicial"}
          </Button>

        </Section>
        <Section title="Fondo alternativo" summary={(scene.backgroundVariants ?? []).length ? `${(scene.backgroundVariants ?? []).length} fondo(s)` : "no"} defaultOpen={!!scene.backgroundVariants?.length}>
          <BackgroundVariantsEditor
            variants={scene.backgroundVariants ?? []}
            onChange={(v) =>
              mutate((d) => ({
                ...d,
                scenes: d.scenes.map((s) => (s.id === currentSceneId ? { ...s, backgroundVariants: v.length ? v : undefined } : s)),
              }))
            }
          />
        </Section>
        <Section title="Música y movimiento" summary={(project?.sounds ?? []).find((x) => x.id === scene.musicTrackId)?.name ?? "sin música"}>
          <Field label="Música de la escena">
            <select
              value={scene.musicTrackId ?? ""}
              onChange={(e) =>
                mutate((d) => ({
                  ...d,
                  scenes: d.scenes.map((s) => (s.id === currentSceneId ? { ...s, musicTrackId: e.target.value || null } : s)),
                }))
              }
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Sin música</option>
              {(project?.sounds ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Se sube en la pestaña Sonidos de la biblioteca. Si la escena siguiente usa la misma pista, sigue sonando sin
              empezar de nuevo.
            </p>
          </Field>

          <Field label={`Velocidad al caminar · ${(scene.walkSpeed ?? 1).toFixed(2)}×${(scene.walkSpeed ?? 1) === 1 ? " (normal)" : ""}`}>
            <Slider
              value={[scene.walkSpeed ?? 1]}
              min={0.25}
              max={3}
              step={0.05}
              onPointerDown={() => checkpoint()}
              onValueChange={([v]) =>
                mutate(
                  (d) => ({ ...d, scenes: d.scenes.map((s) => (s.id === currentSceneId ? { ...s, walkSpeed: v } : s)) }),
                  { history: false },
                )
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cuánto tarda el personaje en llegar a donde se hace clic en esta escena. La animación de pasos se acelera o
              frena en la misma proporción.
            </p>
          </Field>

        </Section>
        <Section
          title="Cinemática al entrar"
          summary={(project!.cinematics ?? []).find((c) => c.id === scene.enterCinematicId)?.name ?? "ninguna"}
          defaultOpen={!!scene.enterCinematicId}
        >
          <Native
            value={scene.enterCinematicId ?? ""}
            onChange={(v) =>
              mutate((d) => ({ ...d, scenes: d.scenes.map((s) => (s.id === currentSceneId ? { ...s, enterCinematicId: v || null } : s)) }))
            }
          >
            <option value="">Ninguna</option>
            {(project!.cinematics ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Native>
          <Help>Se muestra la primera vez que el jugador entra a esta escena. Las cinemáticas se crean en la sección Cinemáticas.</Help>
        </Section>
        <Section title="¿Es un interludio?" summary={scene.cutscene ? "sí" : "no"} defaultOpen={!!scene.cutscene}>
          <Field label="Diálogo del interludio">
            <Native
              value={scene.cutscene?.dialogId ?? ""}
              onChange={(v) =>
                mutate((d) => ({
                  ...d,
                  scenes: d.scenes.map((s) => (s.id === scene.id ? { ...s, cutscene: v ? { dialogId: v } : null } : s)),
                }))
              }
            >
              <option value="">No, es una escena normal</option>
              {project!.dialogs.map((dl) => (
                <option key={dl.id} value={dl.id}>
                  {dl.name}
                </option>
              ))}
            </Native>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Una escena corta sin protagonista: al entrar se reproduce este diálogo y, al terminar, el jugador vuelve a la
              escena y al lugar de donde vino. Se lanza con «Ir a escena» desde un diálogo.
            </p>
          </Field>

        </Section>

        <div className="rounded-md border border-border bg-card p-2 text-xs text-muted-foreground">
          {scene.hotspots.length} hotspot(s), {(scene.depthWaypoints ?? []).length} depth point(s).
          Usa el botón Depth de arriba para conectar puntos con mouse (click-click). Doble click en un segundo punto elimina esa conexión. El % se edita al seleccionar un punto.
        </div>

        <div className="space-y-2 rounded-md border border-border bg-card p-3 hidden">
          <Label className="text-xs font-semibold text-foreground">Way depth system</Label>
          <p className="text-xs text-muted-foreground">Define puntos con escala para profundidad tipo Visionaire. Los puntos morados aparecen en la escena (modo Select) y se arrastran para posicionarlos.</p>
          <div className="space-y-2">
            {(scene.depthWaypoints ?? []).map((wp, idx) => {
              const others = (scene.depthWaypoints ?? []).filter((x) => x.id !== wp.id)
              return (
              <div key={wp.id} className="rounded border border-border bg-background p-2">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    #{idx + 1} ({wp.x.toFixed(2)}, {wp.y.toFixed(2)})
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-destructive"
                    onClick={() => {
                      mutate((d) => ({
                        ...d,
                        scenes: d.scenes.map((s) => {
                          if (s.id !== scene.id) return s
                          const filtered = (s.depthWaypoints ?? []).filter((x) => x.id !== wp.id)
                          return {
                            ...s,
                            depthWaypoints: filtered.map((x) => ({
                              ...x,
                              links: (x.links ?? []).filter((id) => id !== wp.id),
                            })),
                          }
                        }),
                      }))
                    }}
                  >
                    Quitar
                  </Button>
                </div>
                <Field label={`Escala ${Math.round(wp.scale * 100)}%`}>
                  <Slider
                    value={[wp.scale]}
                    min={0.3}
                    max={1.5}
                    step={0.01}
                    onPointerDown={() => {
                      sliderDrag.current = "pending"
                    }}
                    onValueCommit={() => {
                      sliderDrag.current = "idle"
                    }}
                    onValueChange={([v]) => {
                      rememberWaypointLook(scene.id, { ...wp, scale: v })
                      mutate((d) => ({
                        ...d,
                        scenes: d.scenes.map((s) =>
                          s.id === scene.id
                            ? {
                                ...s,
                                depthWaypoints: (s.depthWaypoints ?? []).map((x) =>
                                  x.id === wp.id ? { ...x, scale: v } : x,
                                ),
                              }
                            : s,
                        ),
                      }), sliderOpts())
                    }}
                  />
                </Field>

                <div className="mt-2 rounded border border-border/70 bg-card p-2">
                  <Label className="mb-1 block text-[11px] text-muted-foreground">Conectar con</Label>
                  <div className="space-y-1">
                    {others.length === 0 && <p className="text-[11px] text-muted-foreground">Sin otros puntos.</p>}
                    {others.map((o, j) => {
                      const linked = (wp.links ?? []).includes(o.id)
                      return (
                        <label key={o.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={linked}
                            onChange={(e) => {
                              const checked = e.target.checked
                              mutate((d) => ({
                                ...d,
                                scenes: d.scenes.map((s) => {
                                  if (s.id !== scene.id) return s
                                  const next = (s.depthWaypoints ?? []).map((x) => {
                                    if (x.id === wp.id) {
                                      const set = new Set(x.links ?? [])
                                      if (checked) set.add(o.id)
                                      else set.delete(o.id)
                                      return { ...x, links: Array.from(set) }
                                    }
                                    if (x.id === o.id) {
                                      const set = new Set(x.links ?? [])
                                      if (checked) set.add(wp.id)
                                      else set.delete(wp.id)
                                      return { ...x, links: Array.from(set) }
                                    }
                                    return x
                                  })
                                  return { ...s, depthWaypoints: next }
                                }),
                              }))
                            }}
                          />
                          <span>#{j + 1} ({Math.round(o.scale * 100)}%)</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
              )
            })}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                mutate((d) => ({
                  ...d,
                  scenes: d.scenes.map((s) =>
                    s.id === scene.id
                      ? {
                          ...s,
                          depthWaypoints: [
                            ...(s.depthWaypoints ?? []),
                            { id: crypto.randomUUID(), x: 0.5, y: 0.5, ...newWaypointLook(s.id, s.depthWaypoints ?? []), links: [] },
                          ],
                        }
                      : s,
                  ),
                }))
              }}
            >
              + Punto depth
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <Label className="text-xs font-semibold text-foreground">Capas de la escena</Label>
          <p className="text-xs text-muted-foreground">Arrastra para reordenar (personaje, objetos y hotspots).</p>
          <div className="max-h-44 space-y-1 overflow-auto pr-1">
            {layers.map((layer, idx) => {
              const isCharacter = layer.kind === "character"
              const isObject = layer.kind === "object"
              const isHotspot = layer.kind === "hotspot"
              const selected = isCharacter
                ? selection.type === "character"
                : isObject
                ? selection.type === "sceneObject" && selection.objectId === layer.object.id
                : selection.type === "hotspot" && selection.hotspotId === layer.hotspot.id
              const lockValue = isObject ? !!layer.object.locked : isHotspot ? !!layer.hotspot.locked : false
              const reorderable = isObject || isCharacter

              return (
                <div
                  key={layer.id}
                  draggable={reorderable}
                  onDragStart={() => {
                    if (!reorderable) return
                    setDragLayerId(layer.id)
                  }}
                  onDragOver={(e) => {
                    if (!reorderable) return
                    e.preventDefault()
                  }}
                  onDrop={() => {
                    if (!reorderable) return
                    if (!dragLayerId || dragLayerId === layer.id) return
                    mutate((d) => ({
                      ...d,
                      scenes: d.scenes.map((s) => {
                        if (s.id !== scene.id) return s
                        const objArr = [...(s.sceneObjects ?? [])]
                        const charSlot = Math.max(0, Math.min(objArr.length, s.characterLayerZ ?? 0))
                        const currentLayers: Array<
                          | { id: string; kind: "object"; object: (typeof objArr)[number] }
                          | { id: "character"; kind: "character" }
                        > = []
                        for (let i = 0; i <= objArr.length; i++) {
                          if (i === charSlot) currentLayers.push({ id: "character", kind: "character" })
                          if (i < objArr.length) currentLayers.push({ id: `obj:${objArr[i].id}`, kind: "object", object: objArr[i] })
                        }
                        const from = currentLayers.findIndex((x) => x.id === dragLayerId)
                        const to = currentLayers.findIndex((x) => x.id === layer.id)
                        if (from < 0 || to < 0) return s
                        const [moved] = currentLayers.splice(from, 1)
                        const insertAt = from < to ? to - 1 : to
                        currentLayers.splice(insertAt, 0, moved)

                        const reorderedObjects = currentLayers
                          .filter((x): x is Extract<typeof x, { kind: "object" }> => x.kind === "object")
                          .map((x) => x.object)
                        const nextCharIndex = currentLayers.findIndex((x) => x.kind === "character")
                        const nextCharacterLayerZ = Math.max(0, Math.min(reorderedObjects.length, nextCharIndex))

                        return { ...s, sceneObjects: reorderedObjects, characterLayerZ: nextCharacterLayerZ }
                      }),
                    }))
                    setDragLayerId(null)
                  }}
                  onDragEnd={() => setDragLayerId(null)}
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                    selected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"
                  } ${!reorderable ? "opacity-95" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isCharacter) setSelection({ type: "character" })
                      else if (isObject) setSelection({ type: "sceneObject", objectId: layer.object.id })
                      else setSelection({ type: "hotspot", hotspotId: layer.hotspot.id })
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between"
                  >
                    <span className="truncate">{isCharacter ? "Personaje" : isObject ? layer.object.name : `🔶 ${layer.hotspot.name}`}</span>
                    <span className="ml-2 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">z:{idx + 1}</span>
                  </button>
                  {!isCharacter && (
                    <button
                      type="button"
                      onClick={() => {
                        mutate((d) => ({
                          ...d,
                          scenes: d.scenes.map((s) => {
                            if (s.id !== scene.id) return s
                            if (isObject) {
                              return {
                                ...s,
                                sceneObjects: (s.sceneObjects ?? []).map((it) =>
                                  it.id === layer.object.id ? { ...it, locked: !it.locked } : it,
                                ),
                              }
                            }
                            return {
                              ...s,
                              hotspots: (s.hotspots ?? []).map((h) =>
                                h.id === layer.hotspot.id ? { ...h, locked: !h.locked } : h,
                              ),
                            }
                          }),
                        }))
                      }}
                      className={`rounded border px-2 py-1 text-xs ${
                        lockValue
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                      title={lockValue ? "Desbloquear capa" : "Bloquear capa"}
                    >
                      {lockValue ? "🔒" : "🔓"}
                    </button>
                  )}
                </div>
              )
            })}
            {layers.length === 0 && (
              <div className="rounded border border-dashed border-border p-2 text-xs text-muted-foreground">
                No hay objetos en esta escena.
              </div>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            mutate((d) => {
              const scenes = d.scenes.filter((s) => s.id !== scene.id)
              return {
                ...d,
                scenes,
                startSceneId:
                  d.startSceneId === scene.id ? (scenes[0]?.id ?? null) : d.startSceneId,
              }
            })
            setSelection({ type: "none" })
          }}
        >
          <Trash2 className="size-4" /> Delete scene
        </Button>
      </div>
    )
  }
}


/** Store + editor state shared by the inspector sections. */
function useInspectorScope() {
  const { project, mutate } = useGameStore()
  const { activeSceneId, selection, setSelection } = useEditorUI()
  const scene = project?.scenes.find((s) => s.id === activeSceneId)
  return { project, mutate, scene, selection, setSelection }
}

function HotspotInspector() {
  const { project, mutate, scene, selection, setSelection } = useInspectorScope()
  const hotspot =
    scene && selection.type === "hotspot" ? scene.hotspots.find((h) => h.id === selection.hotspotId) : undefined
  const [nameDraft, setNameDraft] = useState(hotspot?.name ?? "")
  const flagListId = useId()

  useEffect(() => {
    setNameDraft(hotspot?.name ?? "")
  }, [hotspot?.id, hotspot?.name])

  if (!scene || !hotspot) return null

  function patch(p: Partial<typeof hotspot>) {
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === scene!.id
          ? { ...s, hotspots: s.hotspots.map((h) => (h.id === hotspot!.id ? { ...h, ...p } : h)) }
          : s,
      ),
    }))
  }
  function patchAction(p: Partial<NonNullable<typeof hotspot>["action"]>) {
    patch({ action: { ...hotspot!.action, ...p } })
  }
  const pts = hotspot.points ?? []
  const foot = pts.length
    ? { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: Math.min(0.99, Math.max(...pts.map((p) => p.y))) }
    : { x: 0.5, y: 0.9 }
  const items = project!.items
  const needs = [
    hotspot.requiresItem && items.find((i) => i.id === hotspot.requiresItem)?.name,
    hotspot.requiresFlag,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-3">
      <Header icon={<MousePointerClick className="size-4" />} title="Zona interactiva" />
      <Field label="Nombre (se ve al pasar el mouse)">
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            const nextName = nameDraft.trim()
            patch({ name: nextName || hotspot.name })
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
        />
      </Field>
      <Help>Tiene {pts.length || 4} vértices. Su forma se edita con el lápiz de la barra de herramientas.</Help>

      <Section title="¿Qué pasa al hacer clic?" summary={ACTION_TEXT[hotspot.action.type]}>
        <ActionFields action={hotspot.action} onChange={patchAction} currentSceneId={scene.id}>
          {hotspot.action.type === "pickup" && (
            <SwitchRow
              label="Desaparece después de recogerlo"
              checked={hotspot.hideWhenCollected ?? true}
              onChange={(c) => patch({ hideWhenCollected: c })}
            />
          )}
        </ActionFields>
        <SwitchRow
          label="El personaje camina hasta aquí antes"
          help="Apagado: la acción ocurre al instante, desde donde esté."
          checked={!!hotspot.walkToFirst}
          onChange={(c) => patch({ walkToFirst: c })}
        />
        {hotspot.walkToFirst && <StandPointPicker value={hotspot.standAt} onChange={(p) => patch({ standAt: p })} auto={foot} />}
        {hotspot.action.type === "dialog" && (
          <SwitchRow
            label="Es una puerta: después de la primera vez, pasar directo"
            help="Si el diálogo lleva a otra escena, solo se ve la primera vez."
            checked={hotspot.directAfterFirstPass !== false}
            onChange={(c) => patch({ directAfterFirstPass: c })}
          />
        )}
        <Field label="Al usarlo, el personaje mira hacia">
          <Native value={hotspot.faceOnArrive ?? "auto"} onChange={(v) => patch({ faceOnArrive: v as FaceOnArrive })}>
            <FaceOptions />
          </Native>
        </Field>
      </Section>

      <Section title="¿Cuándo aparece?" summary={conditionText(hotspot.visibleIf, items)}>
        <Help>Mientras no se cumpla, la zona no existe: no muestra su nombre ni se puede hacer clic. Para algo que llega más tarde o que se va.</Help>
        <ConditionPicker value={hotspot.visibleIf} onChange={(c) => patch({ visibleIf: c })} alwaysLabel="Siempre está" />
      </Section>

      <Section title="¿Qué necesita para usarse?" summary={needs.length ? needs.join(" + ") : "nada"}>
        <Help>La zona se ve, pero si falta algo se muestra un aviso o un diálogo en lugar de la acción.</Help>
        <Field label="Tener este objeto">
          <Native value={hotspot.requiresItem ?? ""} onChange={(v) => patch({ requiresItem: v || null })}>
            <option value="">Ninguno</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </Native>
        </Field>
        <Field label="Tener esta variable activa">
          <Input
            value={hotspot.requiresFlag ?? ""}
            list={flagListId}
            onChange={(e) => patch({ requiresFlag: e.target.value.replace(/\s+/g, "_") || null })}
            placeholder="ninguna"
            className="h-8 font-mono text-xs"
          />
          <datalist id={flagListId}>
            {collectFlags(project!).map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>
        {(hotspot.requiresItem || hotspot.requiresFlag) && (
          <Field label="Si falta, mostrar">
            <Native value={hotspot.blockedDialog ?? ""} onChange={(v) => patch({ blockedDialog: v || null })}>
              <option value="">Un aviso automático («Necesitas: objeto»)</option>
              {project!.dialogs.map((dl) => (
                <option key={dl.id} value={dl.id}>
                  {dl.name}
                </option>
              ))}
            </Native>
          </Field>
        )}
        <Field label="Al usarlo, se gasta">
          <Native value={hotspot.consumesItem ?? ""} onChange={(v) => patch({ consumesItem: v || null })}>
            <option value="">Nada (el objeto se queda en el inventario)</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </Native>
        </Field>
      </Section>

      <Button
        variant="ghost"
        className="text-destructive"
        onClick={() => {
          mutate((d) => ({
            ...d,
            scenes: d.scenes.map((s) =>
              s.id === scene.id
                ? { ...s, hotspots: s.hotspots.filter((h) => h.id !== hotspot.id) }
                : s,
            ),
          }))
          setSelection({ type: "scene" })
        }}
      >
        <Trash2 className="size-4" /> Eliminar zona
      </Button>
    </div>
  )
}

const ACTION_TEXT: Record<HotspotActionType, string> = {
  none: "nada",
  dialog: "diálogo",
  goToScene: "otra escena",
  pickup: "recoger",
  endGame: "final",
}

function SwitchRow({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <Label className="text-sm">{label}</Label>
        {help && <Help>{help}</Help>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function CharacterInspector() {
  const { project, mutate, scene, selection, setSelection } = useInspectorScope()
  const { character } = project!
  const [scaleDraft, setScaleDraft] = useState(character.scale)
  const [pivotXDraft, setPivotXDraft] = useState(character.pivotX ?? 0.5)
  const [pivotYDraft, setPivotYDraft] = useState(character.pivotY ?? 1)

  useEffect(() => {
    setScaleDraft(character.scale)
    setPivotXDraft(character.pivotX ?? 0.5)
    setPivotYDraft(character.pivotY ?? 1)
  }, [character.scale, character.pivotX, character.pivotY])

  return (
    <div className="flex flex-col gap-4">
      <Header icon={<User className="size-4" />} title="Character" />
      <Field label={`Size base: ${Math.round(scaleDraft * 100)}% of stage height`}>
        <Slider
          value={[scaleDraft]}
          min={0.1}
          max={0.9}
          step={0.01}
          onValueChange={([v]) => setScaleDraft(v)}
          onValueCommit={([v]) => mutate((d) => ({ ...d, character: { ...d.character, scale: v } }))}
        />
      </Field>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-2">
        <Label className="text-sm">Scale character with depth</Label>
        <Switch
          checked={character.scaleWithDepth ?? true}
          onCheckedChange={(c) => mutate((d) => ({ ...d, character: { ...d.character, scaleWithDepth: c } }))}
        />
      </div>
      <div className="rounded-md border border-border bg-card p-2 text-xs text-muted-foreground">
        Assign idle and walk sprites in the Character tab of the left panel. Drag the character on
        the stage to set the start position for the selected scene. El punto de anclaje (pivot) define dónde están los pies para depth.
      </div>

      <div className="space-y-2 rounded-md border border-border bg-card p-2">
        <Label className="text-xs font-semibold">Pivot personaje</Label>
        <Field label={`Pivot X: ${Math.round(pivotXDraft * 100)}%`}>
          <Slider
            value={[pivotXDraft]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]) => setPivotXDraft(v)}
            onValueCommit={([v]) => mutate((d) => ({ ...d, character: { ...d.character, pivotX: v } }))}
          />
        </Field>
        <Field label={`Pivot Y (pies): ${Math.round(pivotYDraft * 100)}%`}>
          <Slider
            value={[pivotYDraft]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]) => setPivotYDraft(v)}
            onValueCommit={([v]) => mutate((d) => ({ ...d, character: { ...d.character, pivotY: v } }))}
          />
        </Field>
      </div>
    </div>
  )
}

/**
 * A depth point: the character's size and lighting when it walks there (interpolated
 * between connected points), e.g. darker and bluish in a shadowy corner.
 */
function DepthWaypointInspector() {
  const { mutate, scene, selection, setSelection } = useInspectorScope()
  const { checkpoint } = useGameStore()
  const waypoints = scene?.depthWaypoints ?? []
  const wp = selection.type === "depthWaypoint" ? waypoints.find((w) => w.id === selection.waypointId) : undefined
  if (!scene || !wp) return null
  const sceneId = scene.id
  const id = wp.id
  const index = waypoints.findIndex((w) => w.id === id) + 1

  const patch = (p: Partial<typeof wp>, history = false) => {
    // New points copy the size and lighting of the last point edited.
    if ("scale" in p || "brightness" in p || "tint" in p || "tintStrength" in p) rememberWaypointLook(sceneId, { ...wp, ...p })
    mutate(
      (d) => ({
        ...d,
        scenes: d.scenes.map((s) =>
          s.id === sceneId ? { ...s, depthWaypoints: (s.depthWaypoints ?? []).map((w) => (w.id === id ? { ...w, ...p } : w)) } : s,
        ),
      }),
      { history },
    )
  }
  const slider = (label: string, value: number, min: number, max: number, step: number, unit: string, onChange: (v: number) => void) => (
    <Field label={`${label} · ${unit === "%" ? Math.round(value * 100) + "%" : value.toFixed(2)}`}>
      <Slider value={[value]} min={min} max={max} step={step} onPointerDown={() => checkpoint()} onValueChange={([v]) => onChange(v)} />
    </Field>
  )

  return (
    <div className="flex flex-col gap-4">
      <Header icon={<MousePointerClick className="size-4" />} title={`Punto de profundidad #${index}`} />
      <p className="text-xs text-muted-foreground">
        Cómo se ve el personaje al pasar por aquí. Entre dos puntos conectados los valores cambian de forma gradual.
      </p>
      {slider("Escala", wp.scale, 0.3, 1.5, 0.01, "%", (v) => patch({ scale: v }))}
      {slider("Brillo", wp.brightness ?? 1, 0.2, 1.6, 0.01, "%", (v) => patch({ brightness: v }))}

      <div className="space-y-2 rounded-md border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Tinte</Label>
          <Switch
            checked={!!wp.tint}
            onCheckedChange={(c) => patch({ tint: c ? (wp.tint ?? "#3b5bdb") : null, tintStrength: wp.tintStrength ?? 0.35 }, true)}
          />
        </div>
        {wp.tint ? (
          <>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Color</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{wp.tint}</span>
                <input
                  type="color"
                  value={wp.tint}
                  onChange={(e) => patch({ tint: e.target.value })}
                  className="size-7 cursor-pointer rounded border border-border bg-transparent p-0.5"
                />
              </span>
            </label>
            {slider("Intensidad", wp.tintStrength ?? 0.35, 0, 1, 0.01, "%", (v) => patch({ tintStrength: v }))}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">Ej. azul tenue en una zona de sombra, naranja cerca del fuego.</p>
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => patch({ brightness: 1, tint: null, tintStrength: undefined }, true)}
        disabled={(wp.brightness ?? 1) === 1 && !wp.tint}
      >
        Restablecer luz
      </Button>
      <Button size="sm" variant="outline" onClick={() => setSelection({ type: "scene" })}>
        Volver a la escena
      </Button>
    </div>
  )
}

function SceneObjectInspector() {
  const { project, mutate, scene, selection, setSelection } = useInspectorScope()
  const sceneObjects = scene?.sceneObjects ?? []
  const obj = selection.type === "sceneObject" ? sceneObjects.find((o) => o.id === selection.objectId) : undefined
  const [objectNameDraft, setObjectNameDraft] = useState(obj?.name ?? "")

  useEffect(() => {
    setObjectNameDraft(obj?.name ?? "")
  }, [obj?.id, obj?.name])

  if (!scene || !obj) return null
  const sceneId = scene.id
  const objectId = obj.id
  const depthIndex = sceneObjects.findIndex((o) => o.id === objectId)
  const maxDepth = Math.max(0, sceneObjects.length - 1)

  function patchObject(p: Partial<typeof obj>) {
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              sceneObjects: (s.sceneObjects ?? []).map((o) =>
                o.id === objectId ? { ...o, ...p } : o,
              ),
            }
          : s,
      ),
    }))
  }

  function moveDepth(to: "front" | "back" | "forward" | "backward") {
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) => {
        if (s.id !== sceneId) return s
        const arr = [...(s.sceneObjects ?? [])]
        const idx = arr.findIndex((o) => o.id === objectId)
        if (idx < 0) return s

        const [item] = arr.splice(idx, 1)
        let target = idx
        if (to === "front") target = arr.length
        if (to === "back") target = 0
        if (to === "forward") target = Math.min(arr.length, idx + 1)
        if (to === "backward") target = Math.max(0, idx - 1)
        arr.splice(target, 0, item)

        return { ...s, sceneObjects: arr }
      }),
    }))
  }

  const items = project!.items
  const mode = obj.interactionMode ?? "none"
  const action = obj.action ?? { type: "none" as const }
  const isCharacter = !!(obj.animation || obj.speaker)

  return (
    <div className="flex flex-col gap-3">
      <Header icon={<Box className="size-4" />} title="Objeto" />
      <Field label="Nombre">
        <Input
          value={objectNameDraft}
          onChange={(e) => setObjectNameDraft(e.target.value)}
          onBlur={() => {
            const nextName = objectNameDraft.trim()
            patchObject({ name: nextName || obj.name })
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
        />
      </Field>
      <Help>
        Arrástralo en el escenario para moverlo; el control ↕ cambia su tamaño. Con el candado (🔒) no se mueve ni se
        escala.
      </Help>

      <Section title="Imagen" summary={[obj.flipX && "reflejado", obj.rotationDeg && `${obj.rotationDeg}°`].filter(Boolean).join(", ")}>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => patchObject({ flipX: !obj.flipX })} disabled={!!obj.locked}>
            <FlipHorizontal className="size-4" /> Reflejar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => patchObject({ rotationDeg: ((obj.rotationDeg ?? 0) + 15) % 360 })}
            disabled={!!obj.locked}
          >
            <RotateCw className="size-4" /> Rotar +15°
          </Button>
        </div>
      </Section>

      <Section title="¿Qué pasa al hacer clic?" summary={mode === "none" ? "es decorado" : ACTION_TEXT[action.type]}>
        <Field label="Cómo se usa">
          <Native
            value={mode}
            onChange={(v) =>
              patchObject({ interactionMode: v as SceneObject["interactionMode"], action: v === "none" ? obj.action : (obj.action ?? { type: "dialog" }) })
            }
          >
            <option value="none">No se usa: es decorado</option>
            <option value="walk">El personaje camina hasta él y lo usa</option>
            <option value="click">Se usa con un clic, desde donde esté el personaje</option>
          </Native>
        </Field>
        {mode !== "none" && (
          <>
            <ActionFields action={action} onChange={(p) => patchObject({ action: { ...action, ...p } })} currentSceneId={sceneId} />
            {mode === "walk" && <StandPointPicker value={obj.standAt} onChange={(p) => patchObject({ standAt: p })} auto={{ x: obj.x, y: obj.y }} />}
            <Field label="Al usarlo, el personaje mira hacia">
              <Native value={obj.faceOnArrive ?? "auto"} onChange={(v) => patchObject({ faceOnArrive: v as FaceOnArrive })}>
                <FaceOptions />
              </Native>
            </Field>
          </>
        )}
      </Section>

      <Section
        title="¿Cuándo aparece?"
        summary={[conditionText(obj.visibleIf, items), obj.hideWhenItem && "se va al recogerlo"].filter(Boolean).join(", ")}
      >
        <Help>Mientras no se cumpla, el objeto no se dibuja ni se puede usar. Para algo que llega más tarde o que se va.</Help>
        <ConditionPicker value={obj.visibleIf} onChange={(c) => patchObject({ visibleIf: c })} alwaysLabel="Siempre está" />
        <Field label="Desaparece cuando el jugador tiene">
          <Native value={obj.hideWhenItem ?? ""} onChange={(v) => patchObject({ hideWhenItem: v || null })}>
            <option value="">Nunca</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </Native>
        </Field>
        <Help>Por ejemplo, una cadena de la pared que se va cuando la recoges.</Help>
      </Section>

      <Section title="Si es un personaje" summary={isCharacter ? obj.speaker || "animado" : "no"} defaultOpen={isCharacter}>
        <Field label="Animación en reposo">
          <Native value={obj.animation ?? ""} onChange={(v) => patchObject({ animation: (v || null) as typeof obj.animation })}>
            <option value="">Ninguna (objeto)</option>
            <option value="breathe">Respirar</option>
            <option value="float">Flotar (fantasmas)</option>
            <option value="sway">Balancearse</option>
          </Native>
        </Field>
        <Field label="Habla en los diálogos como">
          <Input value={obj.speaker ?? ""} onChange={(e) => patchObject({ speaker: e.target.value || null })} placeholder="Ej. Grandma Margaret" />
        </Field>
        <Help>Con el mismo nombre que en los diálogos, se mueve cuando habla.</Help>
        <SwitchRow label="Recibe la luz de la escena" checked={!!obj.lit} onChange={(c) => patchObject({ lit: c })} />
        <Label className="pt-1 text-xs font-semibold">Recorrido</Label>
        <RouteEditor obj={obj} onChange={patchObject} />
      </Section>

      <Section title="Profundidad" summary={obj.depthSort ? "según los pies" : `capa ${depthIndex + 1} de ${maxDepth + 1}`}>
        <SwitchRow
          label="Delante o detrás según los pies del protagonista"
          help="Para muebles en medio de la sala: tapa al personaje solo cuando él está detrás."
          checked={!!obj.depthSort}
          onChange={(c) => patchObject({ depthSort: c })}
        />
        <Help>Capa {depthIndex + 1} de {maxDepth + 1}: la de número más alto se dibuja encima.</Help>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => moveDepth("back")} disabled={depthIndex <= 0 || !!obj.locked}>
            Enviar al fondo
          </Button>
          <Button variant="outline" size="sm" onClick={() => moveDepth("backward")} disabled={depthIndex <= 0 || !!obj.locked}>
            Bajar 1 nivel
          </Button>
          <Button variant="outline" size="sm" onClick={() => moveDepth("forward")} disabled={depthIndex >= maxDepth || !!obj.locked}>
            Subir 1 nivel
          </Button>
          <Button variant="outline" size="sm" onClick={() => moveDepth("front")} disabled={depthIndex >= maxDepth || !!obj.locked}>
            Traer al frente
          </Button>
        </div>
      </Section>

      <Button
        variant="ghost"
        className="text-destructive"
        onClick={() => {
          mutate((d) => ({
            ...d,
            scenes: d.scenes.map((s) =>
              s.id === sceneId
                ? { ...s, sceneObjects: (s.sceneObjects ?? []).filter((o) => o.id !== objectId) }
                : s,
            ),
          }))
          setSelection({ type: "scene" })
        }}
      >
        <Trash2 className="size-4" /> Quitar de la escena
      </Button>
    </div>
  )
}
