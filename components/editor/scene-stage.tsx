"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  MousePointerClick,
  Plus,
  ImageOff,
  Crosshair,
  Move,
  Route,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Scissors,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { useGameStore } from "@/lib/game-store"
import { useEditorUI } from "./editor-context"
import type { DepthWaypoint, Hotspot, Point, SceneObject } from "@/lib/game-types"
import { CharacterSprite } from "./character-sprite"
import { getDepthLook } from "@/lib/depth-look"
import { cn } from "@/lib/utils"
import { PolygonEditor, PolygonDrawer } from "./polygon-editor"
import { getPolygonCenter, rectToPolygon } from "@/lib/geometry"
import { cutForeground } from "@/lib/foreground-cut"
import { dataUrlToAsset } from "@/lib/image-utils"
import { newWaypointLook } from "@/lib/depth-defaults"

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

type ToolMode = "select" | "draw-hotspot" | "depth-link" | "cut-foreground"

export function SceneStage() {
  const { project, mutate, checkpoint } = useGameStore()
  // A drag is a single undo step: the checkpoint is taken on its first move (so plain
  // clicks don't add history) and every move after that skips the history.
  const dragNeedsCheckpoint = useRef(false)
  const beginDrag = () => {
    dragNeedsCheckpoint.current = true
  }
  const liveOpts = () => {
    if (dragNeedsCheckpoint.current) {
      checkpoint()
      dragNeedsCheckpoint.current = false
    }
    return { history: false }
  }
  const {
    activeSceneId,
    setActiveSceneId,
    selection,
    setSelection,
    libraryOpen,
    inspectorOpen,
    toggleLibrary,
    toggleInspector,
  } = useEditorUI()
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 450 })
  const [toolMode, setToolMode] = useState<ToolMode>("select")
  const [characterDrag, setCharacterDrag] = useState(false)
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const [resizingObject, setResizingObject] = useState<{
    objectId: string
    startY: number
    startScale: number
  } | null>(null)
  const [dragOverStage, setDragOverStage] = useState(false)
  const [backgroundOnly, setBackgroundOnly] = useState(false)
  const [draggingDepthWaypointId, setDraggingDepthWaypointId] = useState<string | null>(null)
  const [linkStartWaypointId, setLinkStartWaypointId] = useState<string | null>(null)
  const [cutError, setCutError] = useState<string | null>(null)

  const scene =
    project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0] ?? null

  // Keep the active scene id in sync without mutating state during render.
  useEffect(() => {
    if (scene && scene.id !== activeSceneId) setActiveSceneId(scene.id)
  }, [scene, activeSceneId, setActiveSceneId])

  // Measure stage size for polygon coordinate conversion
  useEffect(() => {
    if (!stageRef.current) return
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setStageSize({ width: rect.width, height: rect.height })
    })
    obs.observe(stageRef.current)
    return () => obs.disconnect()
    // Re-attach when the stage mounts (the project loads after the first render) or the scene changes.
  }, [scene?.id])

  const pointerToNorm = useCallback((p: { clientX: number; clientY: number }) => {
    if (!stageRef.current) return { x: 0.5, y: 0.5 }
    const rect = stageRef.current.getBoundingClientRect()
    return {
      x: (p.clientX - rect.left) / rect.width,
      y: (p.clientY - rect.top) / rect.height,
    }
  }, [])

  const pointerToNormInside = useCallback((p: { clientX: number; clientY: number }) => {
    if (!stageRef.current) return { x: 0.5, y: 0.5 }
    const rect = stageRef.current.getBoundingClientRect()
    return {
      x: clamp01((p.clientX - rect.left) / rect.width),
      y: clamp01((p.clientY - rect.top) / rect.height),
    }
  }, [])

  if (!project) return null

  if (!scene) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <MousePointerClick className="size-8" />
        <p className="text-sm">Crea o elige una escena en la biblioteca para empezar.</p>
        {!libraryOpen && (
          <Button size="sm" variant="outline" className="hidden md:inline-flex" onClick={toggleLibrary}>
            <PanelLeftOpen className="size-4" /> Mostrar biblioteca
          </Button>
        )}
      </div>
    )
  }

  const background = project.assets.find((a) => a.id === scene.backgroundAssetId)
  const idleSprite = project.assets.find((a) => a.id === project.character.idleAssetId)
  const objectCount = (scene.sceneObjects ?? []).length
  const characterLayerZ = Math.max(0, Math.min(objectCount, scene.characterLayerZ ?? 0))

  // --- Hotspot handlers ---
  function handleHotspotDrawComplete(points: Point[]) {
    const hotspot: Hotspot = {
      id: crypto.randomUUID(),
      name: `Hotspot ${scene!.hotspots.length + 1}`,
      points,
      action: { type: "none" },
      locked: false,
    }
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === scene!.id ? { ...s, hotspots: [...s.hotspots, hotspot] } : s,
      ),
    }))
    setSelection({ type: "hotspot", hotspotId: hotspot.id })
    setToolMode("select")
  }

  /** Turn the traced outline into a foreground object made of the background's own pixels. */
  async function handleForegroundCut(points: Point[]) {
    setToolMode("select")
    const bg = project?.assets.find((a) => a.id === scene?.backgroundAssetId)
    if (!scene || !bg) return
    setCutError(null)
    try {
      const cut = await cutForeground(bg.dataUrl, points)
      const n = (scene.sceneObjects ?? []).filter((o) => o.name.startsWith("Primer plano")).length + 1
      const asset = await dataUrlToAsset(cut.dataUrl, "object", `${scene.name} · primer plano ${n}`)
      const obj: SceneObject = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        name: `Primer plano ${n}`,
        x: cut.x,
        y: cut.y,
        scale: cut.scale,
        // Click-through decoration: it only hides the character when it walks behind.
        locked: true,
        interactionMode: "none",
      }
      mutate((d) => ({
        ...d,
        assets: [...d.assets, asset],
        scenes: d.scenes.map((s) => {
          if (s.id !== scene.id) return s
          const objects = s.sceneObjects ?? []
          // Appended after the character slot, so it is drawn in front of the character.
          return { ...s, sceneObjects: [...objects, obj], characterLayerZ: Math.min(s.characterLayerZ ?? 0, objects.length) }
        }),
      }))
      setSelection({ type: "sceneObject", objectId: obj.id })
    } catch (err) {
      setCutError(err instanceof Error ? err.message : "No se pudo recortar")
    }
  }

  function updateHotspotPoints(hotspotId: string, points: Point[], live = false) {
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === scene!.id
          ? {
              ...s,
              hotspots: s.hotspots.map((h) =>
                h.id === hotspotId ? { ...h, points } : h,
              ),
            }
          : s,
      ),
    }), live ? liveOpts() : undefined)
  }

  function deleteSelectedHotspot() {
    if (selection.type !== "hotspot") return
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === scene!.id
          ? { ...s, hotspots: s.hotspots.filter((h) => h.id !== selection.hotspotId) }
          : s,
      ),
    }))
    setSelection({ type: "scene" })
  }

  // --- Character drag ---
  function handleCharacterDrag(e: React.PointerEvent) {
    if (!characterDrag) return
    const p = pointerToNorm(e)
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === scene!.id ? { ...s, characterStart: { x: p.x, y: p.y } } : s,
      ),
    }), liveOpts())
  }

  function handleSceneObjectDrag(e: React.PointerEvent) {
    if (resizingObject) {
      const delta = (resizingObject.startY - e.clientY) / 220
      const nextScale = Math.max(0.25, resizingObject.startScale + delta)
      updateSceneObject(resizingObject.objectId, { scale: nextScale }, true)
      return
    }
    if (!draggingObjectId) return
    const p = pointerToNorm(e)
    const nextX = dragOffset ? p.x - dragOffset.x : p.x
    const nextY = dragOffset ? p.y - dragOffset.y : p.y
    updateSceneObject(draggingObjectId, { x: nextX, y: nextY }, true)
  }

  function updateSceneObject(objectId: string, patch: Partial<SceneObject>, live = false) {
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === scene!.id
          ? {
              ...s,
              sceneObjects: (s.sceneObjects ?? []).map((o) =>
                o.id === objectId ? { ...o, ...patch } : o,
              ),
            }
          : s,
      ),
    }), live ? liveOpts() : undefined)
  }

  function removeSceneObject(objectId: string) {
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === scene!.id
          ? { ...s, sceneObjects: (s.sceneObjects ?? []).filter((o) => o.id !== objectId) }
          : s,
      ),
    }))
    setSelection({ type: "scene" })
  }

  function updateDepthWaypoint(
    waypointId: string,
    patch: Partial<Pick<DepthWaypoint, "x" | "y" | "scale" | "links" | "brightness" | "tint" | "tintStrength">>,
    live = false,
  ) {
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === scene!.id
          ? {
              ...s,
              depthWaypoints: (s.depthWaypoints ?? []).map((w) =>
                w.id === waypointId ? { ...w, ...patch } : w,
              ),
            }
          : s,
      ),
    }), live ? liveOpts() : undefined)
  }

  function removeDepthLink(aId: string, bId: string) {
    mutate((d) => ({
      ...d,
      scenes: d.scenes.map((s) => {
        if (s.id !== scene!.id) return s
        return {
          ...s,
          depthWaypoints: (s.depthWaypoints ?? []).map((w) => {
            if (w.id !== aId && w.id !== bId) return w
            return { ...w, links: (w.links ?? []).filter((id) => id !== (w.id === aId ? bId : aId)) }
          }),
        }
      }),
    }))
  }

  function handleDepthWaypointDrag(e: React.PointerEvent) {
    if (!draggingDepthWaypointId) return
    const p = pointerToNormInside(e)
    updateDepthWaypoint(draggingDepthWaypointId, { x: p.x, y: p.y }, true)
  }

  const selectedHotspot =
    selection.type === "hotspot"
      ? scene.hotspots.find((h) => h.id === selection.hotspotId)
      : null

  const selectedDepthWaypoint =
    selection.type === "depthWaypoint"
      ? (scene.depthWaypoints ?? []).find((w) => w.id === selection.waypointId)
      : null

  const selectedSceneObject =
    selection.type === "sceneObject"
      ? (scene.sceneObjects ?? []).find((o) => o.id === selection.objectId)
      : null


  // Editor mode for polygons
  const polygonEditMode = toolMode === "draw-hotspot"
  const fadeOverlayMode = toolMode === "draw-hotspot" || toolMode === "cut-foreground"
  // While drawing (hotspots, depth graph) the character and objects are locked: clicks go
  // through them to the tool, so you can trace over where they stand.
  const layersLocked = toolMode !== "select"

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Stage toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-2 overflow-x-auto">
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="hidden size-8 text-muted-foreground md:inline-flex"
            onClick={toggleLibrary}
            title={libraryOpen ? "Ocultar biblioteca" : "Mostrar biblioteca"}
            aria-pressed={libraryOpen}
          >
            {libraryOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </Button>
          <span className="truncate text-sm font-medium">{scene.name}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Select tool */}
          <Button
            size="sm"
            variant={toolMode === "select" ? "default" : "ghost"}
            onClick={() => setToolMode("select")}
            title="Select (S)"
          >
            <Move className="size-4" />
          </Button>

          {/* Draw hotspot */}
          <Button
            size="sm"
            variant={toolMode === "draw-hotspot" ? "default" : "ghost"}
            onClick={() => setToolMode("draw-hotspot")}
            disabled={!background}
            title="Draw Hotspot (H)"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Hotspot</span>
          </Button>

          {/* Walkable / depth tool */}
          <Button
            size="sm"
            variant={toolMode === "depth-link" ? "default" : "ghost"}
            onClick={() => setToolMode("depth-link")}
            disabled={!background}
            title="Depth graph tool"
          >
            <Route className="size-4" />
            <span className="hidden sm:inline">Depth</span>
          </Button>

          {/* Cut a foreground piece out of the background */}
          <Button
            size="sm"
            variant={toolMode === "cut-foreground" ? "default" : "ghost"}
            onClick={() => setToolMode("cut-foreground")}
            disabled={!background}
            title="Primer plano: recorta un trozo del fondo para que el personaje pase por detrás"
          >
            <Scissors className="size-4" />
            <span className="hidden sm:inline">Primer plano</span>
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          <Button
            size="sm"
            variant={backgroundOnly ? "default" : "ghost"}
            onClick={() => setBackgroundOnly((v) => !v)}
            title="Ocultar/mostrar overlays"
          >
            Fondo
          </Button>

          {/* Delete selected */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (selectedHotspot) deleteSelectedHotspot()
              else if (selectedDepthWaypoint) {
                mutate((d) => ({
                  ...d,
                  scenes: d.scenes.map((s) => {
                    if (s.id !== scene!.id) return s
                    const filtered = (s.depthWaypoints ?? []).filter((w) => w.id !== selectedDepthWaypoint.id)
                    return {
                      ...s,
                      depthWaypoints: filtered.map((w) => ({
                        ...w,
                        links: (w.links ?? []).filter((id) => id !== selectedDepthWaypoint.id),
                      })),
                    }
                  }),
                }))
                setSelection({ type: "scene" })
              }
              else if (selectedSceneObject) removeSceneObject(selectedSceneObject.id)
            }}
            disabled={!selectedHotspot && !selectedDepthWaypoint && !selectedSceneObject}
            title="Delete Selected (Del)"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>

          <div className="mx-1 hidden h-5 w-px bg-border lg:block" />
          <Button
            size="icon"
            variant="ghost"
            className="hidden size-8 text-muted-foreground lg:inline-flex"
            onClick={toggleInspector}
            title={inspectorOpen ? "Ocultar inspector" : "Mostrar inspector"}
            aria-pressed={inspectorOpen}
          >
            {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Stage */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-visible bg-[radial-gradient(circle_at_center,theme(colors.muted.DEFAULT)_0%,theme(colors.background)_70%)] p-4 [container-type:size]">
        <div
          ref={stageRef}
          onPointerMove={(e) => {
            handleCharacterDrag(e)
            handleSceneObjectDrag(e)
            handleDepthWaypointDrag(e)
          }}
          onPointerUp={() => {
            setCharacterDrag(false)
            setDraggingObjectId(null)
            setDragOffset(null)
            setResizingObject(null)
            setDraggingDepthWaypointId(null)
          }}
          onPointerLeave={() => {
            setDragOverStage(false)
          }}
          onDragOver={(e) => {
            const hasObject = !!e.dataTransfer.types?.includes("application/x-pixelquest-object-asset")
            if (!hasObject) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
            setDragOverStage(true)
          }}
          onDragLeave={() => setDragOverStage(false)}
          onDrop={(e) => {
            const assetId = e.dataTransfer.getData("application/x-pixelquest-object-asset")
            if (!assetId) return
            e.preventDefault()
            setDragOverStage(false)
            const p = pointerToNormInside(e)
            const asset = project.assets.find((a) => a.id === assetId && a.kind === "object")
            if (!asset) return

            const placed: SceneObject = {
              id: crypto.randomUUID(),
              assetId,
              name: asset.name,
              x: p.x,
              y: p.y,
              scale: 1,
              rotationDeg: 0,
              flipX: false,
              locked: false,
            }

            mutate((d) => ({
              ...d,
              scenes: d.scenes.map((s) =>
                s.id === scene!.id
                  ? { ...s, sceneObjects: [...(s.sceneObjects ?? []), placed] }
                  : s,
              ),
            }))
            setSelection({ type: "sceneObject", objectId: placed.id })
          }}
           onPointerDown={(e) => {
            const targetEl = e.target as Element
            const clickedStageBackground =
              e.target === stageRef.current || targetEl.tagName.toLowerCase() === "svg"
            // If clicking on SVG, only treat as background if it's the root SVG (not a child like line/g)
            const isSvgRoot = targetEl.tagName.toLowerCase() === "svg" && targetEl === e.target
            if (!clickedStageBackground || (targetEl.tagName.toLowerCase() === "svg" && !isSvgRoot)) {
              // Click on SVG child (line/g) or non-background: let children handle it
              return
            }

            if (toolMode === "select") {
              setSelection({ type: "scene" })
            } else if (toolMode === "depth-link") {
              const p = pointerToNormInside(e)
              const newPointId = crypto.randomUUID()
              mutate((d) => ({
                ...d,
                scenes: d.scenes.map((s) => {
                  if (s.id !== scene!.id) return s
                  // New points copy the size and lighting of the last point edited.
                  const look = newWaypointLook(s.id, s.depthWaypoints ?? [], linkStartWaypointId)
                  const next = [...(s.depthWaypoints ?? []), { id: newPointId, x: p.x, y: p.y, ...look, links: [] as string[] }]
                  if (!linkStartWaypointId) return { ...s, depthWaypoints: next }
                  return {
                    ...s,
                    depthWaypoints: next.map((w) => {
                      if (w.id === newPointId) return { ...w, links: [linkStartWaypointId] }
                      if (w.id === linkStartWaypointId) {
                        const set = new Set(w.links ?? [])
                        set.add(newPointId)
                        return { ...w, links: Array.from(set) }
                      }
                      return w
                    }),
                  }
                }),
              }))
              setSelection({ type: "depthWaypoint", waypointId: newPointId })
              setLinkStartWaypointId(newPointId)
            }
          }}
          className="relative isolate aspect-video w-[min(100cqw,calc(100cqh*16/9))] overflow-visible rounded-lg border border-border bg-muted shadow-2xl select-none"
        >
          {background ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={background.dataUrl || "/placeholder.svg"}
              alt={scene.name}
              className="pointer-events-none absolute inset-0 z-0 size-full rounded-lg object-cover"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <ImageOff className="size-7" />
                <p className="text-sm">No background. Pick one in the inspector.</p>
              </div>
            </div>
          )}

          {dragOverStage && (
            <div className="pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-dashed border-primary/70 bg-primary/10" />
          )}

          {/* Depth graph handles movement now */}

          {/* Placed scene objects */}
          {!backgroundOnly && (scene.sceneObjects ?? []).map((obj, depthIndex) => {
            const asset = project.assets.find((a) => a.id === obj.assetId)
            if (!asset) return null
            const isSelected = selection.type === "sceneObject" && selection.objectId === obj.id
            const objectHeight = Math.max(24, stageSize.height * 0.18 * obj.scale)
            const zOffset = depthIndex >= characterLayerZ ? 1 : 0
            const objectZ = 10 + depthIndex + zOffset
            const hotspotTopZ = 100 + (scene.hotspots?.length ?? 0)
            const maxAllowedObjectZ = Math.max(10, hotspotTopZ - 1)
            return (
              <div
                key={obj.id}
                onPointerDown={(e) => {
                  if (toolMode !== "select" || fadeOverlayMode) return
                  if (obj.locked) return
                  e.stopPropagation()
                  setSelection({ type: "sceneObject", objectId: obj.id })
                  beginDrag()
                  setDraggingObjectId(obj.id)
                  const anchor = pointerToNorm(e)
                  setDragOffset({ x: anchor.x - obj.x, y: anchor.y - obj.y })
                  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
                }}
                onLostPointerCapture={() => {
                  setDraggingObjectId(null)
                  setDragOffset(null)
                  setResizingObject(null)
                }}
                style={{
                  left: `${obj.x * 100}%`,
                  top: `${obj.y * 100}%`,
                  height: `${objectHeight}px`,
                  minWidth: `${Math.max(24, objectHeight * 0.4)}px`,
                  width: "max-content",
                  zIndex: Math.min(objectZ, maxAllowedObjectZ),
                  pointerEvents: layersLocked ? "none" : "auto",
                }}
                className={cn(
                  "absolute w-max -translate-x-1/2 -translate-y-full",
                  fadeOverlayMode && "opacity-40",
                  obj.locked ? "pointer-events-none cursor-default" : "cursor-grab active:cursor-grabbing",
                  isSelected && "drop-shadow-[0_0_0.35rem_rgba(250,204,21,0.8)]",
                )}
                title={`${obj.name} - drag to move`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.dataUrl || "/placeholder.svg"}
                  alt={obj.name}
                  style={{ transform: `scaleX(${obj.flipX ? -1 : 1}) rotate(${obj.rotationDeg ?? 0}deg)` }}
                  className={cn(
                    "pointer-events-none mx-auto block h-full w-auto max-w-none object-contain",
                    isSelected && "ring-2 ring-yellow-300/80 rounded-sm",
                  )}
                  draggable={false}
                />
                {isSelected && (
                  <div className="pointer-events-none absolute -left-2 -top-6 rounded-md border border-primary/40 bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary shadow">
                    z:{depthIndex + 1}{obj.locked ? " · 🔒" : ""}
                  </div>
                )}
                {isSelected && toolMode === "select" && !obj.locked && (
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      beginDrag()
                      setResizingObject({ objectId: obj.id, startY: e.clientY, startScale: obj.scale })
                      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
                    }}
                    onLostPointerCapture={() => {
                      setResizingObject(null)
                    }}
                    className="absolute -bottom-2 -right-2 size-5 rounded-full border border-primary bg-background text-[10px] text-primary shadow"
                    title="Arrastra para escalar proporcional"
                  >
                    ↕
                  </button>
                )}
              </div>
            )
          })}

          {/* Depth waypoint links */}
          {!backgroundOnly && (
            <svg className={cn("pointer-events-none absolute inset-0 z-[35] size-full", fadeOverlayMode && "opacity-35")}>
              {(scene.depthWaypoints ?? []).flatMap((wp) =>
                (wp.links ?? []).map((targetId) => {
                  const to = (scene.depthWaypoints ?? []).find((x) => x.id === targetId)
                  if (!to) return null
                  if (wp.id > to.id) return null
                  return (
                    <g key={`${wp.id}-${to.id}`}>
                      <line
                        x1={`${wp.x * 100}%`}
                        y1={`${wp.y * 100}%`}
                        x2={`${to.x * 100}%`}
                        y2={`${to.y * 100}%`}
                        stroke="transparent"
                        strokeWidth="10"
                        // only clickable when editing the graph (double-click removes a link)
                        className={toolMode === "depth-link" ? "pointer-events-auto cursor-pointer" : undefined}
                        onDoubleClick={(e) => {
                          if (toolMode !== "depth-link") return
                          e.stopPropagation()
                          removeDepthLink(wp.id, to.id)
                          setLinkStartWaypointId(null)
                        }}
                      />
                      <line
                        x1={`${wp.x * 100}%`}
                        y1={`${wp.y * 100}%`}
                        x2={`${to.x * 100}%`}
                        y2={`${to.y * 100}%`}
                        stroke="rgba(217,70,239,0.8)"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                    </g>
                  )
                })
              )}
              {toolMode === "depth-link" && linkStartWaypointId && (() => {
                const from = (scene.depthWaypoints ?? []).find((w) => w.id === linkStartWaypointId)
                if (!from) return null
                return (
                  <circle
                    cx={`${from.x * 100}%`}
                    cy={`${from.y * 100}%`}
                    r="8"
                    fill="rgba(217,70,239,0.35)"
                    stroke="rgba(217,70,239,1)"
                    strokeWidth="2"
                    className="pointer-events-auto"
                  />
                )
              })()}
            </svg>
          )}

          {/* Depth waypoints */}
          {!backgroundOnly && (scene.depthWaypoints ?? []).map((wp) => {
            const isSelected = selection.type === "depthWaypoint" && selection.waypointId === wp.id
            return (
            <div
              key={wp.id}
              onPointerDown={(e) => {
                if (toolMode !== "select" && toolMode !== "depth-link") return
                if (fadeOverlayMode) return
                e.stopPropagation()
                setSelection({ type: "depthWaypoint", waypointId: wp.id })
                beginDrag()
                setDraggingDepthWaypointId(wp.id)
                ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
              }}
              onClick={(e) => {
                if (toolMode !== "depth-link") return
                e.stopPropagation()
                if (!linkStartWaypointId) {
                  setLinkStartWaypointId(wp.id)
                  return
                }
                if (linkStartWaypointId === wp.id) return
                mutate((d) => ({
                  ...d,
                  scenes: d.scenes.map((s) => {
                    if (s.id !== scene!.id) return s
                    const next = (s.depthWaypoints ?? []).map((x) => {
                      if (x.id === wp.id) {
                        const set = new Set(x.links ?? [])
                        set.add(linkStartWaypointId)
                        return { ...x, links: Array.from(set) }
                      }
                      if (x.id === linkStartWaypointId) {
                        const set = new Set(x.links ?? [])
                        set.add(wp.id)
                        return { ...x, links: Array.from(set) }
                      }
                      return x
                    })
                    return { ...s, depthWaypoints: next }
                  }),
                }))
                setLinkStartWaypointId(null)
              }}
              onDoubleClick={(e) => {
                if (toolMode !== "depth-link") return
                e.stopPropagation()
                if (!linkStartWaypointId || linkStartWaypointId === wp.id) return
                mutate((d) => ({
                  ...d,
                  scenes: d.scenes.map((s) => {
                    if (s.id !== scene!.id) return s
                    const next = (s.depthWaypoints ?? []).map((x) => {
                      if (x.id === wp.id || x.id === linkStartWaypointId) {
                        return { ...x, links: (x.links ?? []).filter((id) => id !== (x.id === wp.id ? linkStartWaypointId : wp.id)) }
                      }
                      return x
                    })
                    return { ...s, depthWaypoints: next }
                  }),
                }))
                setLinkStartWaypointId(null)
              }}
              onLostPointerCapture={() => setDraggingDepthWaypointId(null)}
              style={{ left: `${wp.x * 100}%`, top: `${wp.y * 100}%`, zIndex: 40 }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing",
                fadeOverlayMode && "pointer-events-none opacity-40",
              )}
              title={`Depth point (${Math.round(wp.scale * 100)}%)`}
            >
              <div className={cn("size-4 rounded-full border-2 bg-fuchsia-500/90 shadow-[0_0_10px_rgba(217,70,239,0.8)]", isSelected ? "border-fuchsia-100" : "border-fuchsia-300")} />
              {isSelected && (
                <div className="mt-1 -ml-2 w-max rounded bg-background/90 px-1 py-0.5 text-[10px] text-fuchsia-300">
                  #{(scene.depthWaypoints ?? []).findIndex((x) => x.id === wp.id) + 1} · {Math.round(wp.scale * 100)}%
                </div>
              )}
            </div>
            )
          })}

          {/* Live preview: the character standing on the selected depth point, with its scale,
              brightness and tint, updating while the point is edited or dragged. */}
          {selectedDepthWaypoint && idleSprite && !backgroundOnly && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: `${selectedDepthWaypoint.x * 100}%`,
                top: `${selectedDepthWaypoint.y * 100}%`,
                height: `${project.character.scale * selectedDepthWaypoint.scale * 100}%`,
                transform: `translate(${-(project.character.pivotX ?? 0.5) * 100}%, ${-(project.character.pivotY ?? 1) * 100}%)`,
                zIndex: 38,
              }}
            >
              <CharacterSprite
                src={idleSprite.dataUrl}
                look={getDepthLook(selectedDepthWaypoint, scene.depthWaypoints ?? [])}
                className="block h-full w-auto max-w-none drop-shadow-lg"
              />
            </div>
          )}

          {/* Hotspots */}
          {!backgroundOnly && scene.hotspots.map((h, idx) => {
            const isSelected =
              selection.type === "hotspot" && selection.hotspotId === h.id
            // Migration: if hotspot has x/y/width/height (legacy), convert to points
            const points = h.points ?? rectToPolygon(
              (h as unknown as { x: number }).x ?? 0.4,
              (h as unknown as { y: number }).y ?? 0.4,
              (h as unknown as { width: number }).width ?? 0.2,
              (h as unknown as { height: number }).height ?? 0.2,
            )
            return (
              <PolygonEditor
                key={h.id}
                points={points}
                onChange={(pts, live) => updateHotspotPoints(h.id, pts, live)}
                onDragStart={beginDrag}
                stageWidth={stageSize.width}
                stageHeight={stageSize.height}
                mode={isSelected ? ((((h.locked ?? false) || fadeOverlayMode) ? "select" : "edit")) : "select"}
                fillColor={isSelected ? "rgba(255, 200, 0, 0.45)" : "rgba(255, 200, 0, 0.3)"}
                strokeColor={isSelected ? "rgba(255, 220, 0, 1)" : "rgba(255, 200, 0, 0.9)"}
                strokeWidth={isSelected ? 3 : 2}
                selected={isSelected}
                onSelect={() => {
                  if (fadeOverlayMode || toolMode === "depth-link") return
                  setSelection({ type: "hotspot", hotspotId: h.id })
                }}
                label={h.name}
                showVertices={isSelected}
                draggable={!fadeOverlayMode && !(h.locked ?? false) && toolMode === "select"}
                zIndex={70 + idx}
                dimmed={toolMode === "depth-link"}
              />
            )
          })}

          {/* Dim everything except background while drawing hotspot */}
          {toolMode === "draw-hotspot" && (
            <div className="pointer-events-none absolute inset-0 z-[65] bg-black/35" />
          )}

          {/* Tracing a foreground piece over the background */}
          {toolMode === "cut-foreground" && (
            <>
              <PolygonDrawer
                onComplete={handleForegroundCut}
                onCancel={() => setToolMode("select")}
                stageWidth={stageSize.width}
                stageHeight={stageSize.height}
                fillColor="rgba(56, 189, 248, 0.18)"
                strokeColor="rgba(56, 189, 248, 0.95)"
              />
              <div className="pointer-events-none absolute left-1/2 top-2 z-[90] -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 text-xs text-white">
                Traza el contorno de lo que debe quedar delante del personaje (columna, árbol…). Cierra en el primer punto.
              </div>
            </>
          )}
          {cutError && (
            <div className="absolute left-1/2 top-2 z-[90] -translate-x-1/2 rounded-md bg-destructive px-3 py-1.5 text-xs text-white" onClick={() => setCutError(null)}>
              {cutError}
            </div>
          )}

          {/* Drawing overlay for new hotspot */}
          {toolMode === "draw-hotspot" && (
            <PolygonDrawer
              onComplete={handleHotspotDrawComplete}
              onCancel={() => setToolMode("select")}
              stageWidth={stageSize.width}
              stageHeight={stageSize.height}
              fillColor="rgba(255, 200, 0, 0.2)"
              strokeColor="rgba(255, 200, 0, 0.9)"
            />
          )}

          {/* Walkable areas are legacy: movement uses the depth graph only */}

          {/* Character start marker */}
          {!backgroundOnly && (
          <div
            onPointerDown={(e) => {
              if (toolMode !== "select" || fadeOverlayMode) return
              e.stopPropagation()
              setSelection({ type: "character" })
              beginDrag()
              setCharacterDrag(true)
              ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            }}
            style={{
              left: `${scene.characterStart.x * 100}%`,
              top: `${scene.characterStart.y * 100}%`,
              height: `${project.character.scale * 100}%`,
              zIndex: Math.min(10 + characterLayerZ, Math.max(10, 99 + (scene.hotspots?.length ?? 0))),
              transform: `translate(${-(project.character.pivotX ?? 0.5) * 100}%, ${-(project.character.pivotY ?? 1) * 100}%)`,
              opacity: toolMode === "depth-link" ? 0.3 : fadeOverlayMode ? 0.4 : undefined,
            }}
            className={cn(
              "absolute cursor-grab active:cursor-grabbing",
              layersLocked && "pointer-events-none",
            )}
            title="Character start position - drag to move"
          >
            {selection.type === "character" && (
              <div
                className="pointer-events-none absolute z-[55] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-200 bg-fuchsia-500 shadow-[0_0_0_2px_rgba(236,72,153,0.35)]"
                style={{
                  left: `${(project.character.pivotX ?? 0.5) * 100}%`,
                  top: `${(project.character.pivotY ?? 1) * 100}%`,
                }}
              />
            )}
            {idleSprite ? (
              // Preview of the depth lighting (brightness / tint) at the start position.
              <CharacterSprite
                src={idleSprite.dataUrl || "/placeholder.svg"}
                look={getDepthLook(scene.characterStart, scene.depthWaypoints ?? [])}
                className="pointer-events-none block h-full w-auto object-contain drop-shadow-lg"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-end">
                <Crosshair className="size-5 text-primary" />
                <span className="rounded bg-background/80 px-1 text-[10px] text-foreground">start</span>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
