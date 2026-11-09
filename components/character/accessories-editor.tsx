"use client"

import { useState } from "react"
import { Crosshair, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { useGameStore } from "@/lib/game-store"
import type { CharacterAccessory, GameProject } from "@/lib/game-types"
import { trackPoint } from "@/lib/image-utils"
import { ConditionPicker, Native } from "@/components/editor/inspector-parts"

/**
 * Things the protagonist wears while a condition holds (a fake mustache, a hat). Placed on the
 * standing sprite; "Ajustar a cada fotograma" follows that spot through the walk animations.
 */
export function AccessoriesEditor({ project }: { project: GameProject }) {
  const { mutate } = useGameStore()
  const c = project.character
  const list = c.accessories ?? []
  const images = project.assets.filter((a) => a.kind === "object" || a.kind === "sprite")
  const setList = (next: CharacterAccessory[]) =>
    mutate((d) => ({ ...d, character: { ...d.character, accessories: next.length ? next : undefined } }))
  const patch = (i: number, p: Partial<CharacterAccessory>) => setList(list.map((a, j) => (j === i ? { ...a, ...p } : a)))

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div>
        <p className="text-sm font-medium">Accesorios</p>
        <p className="text-[11px] text-muted-foreground">
          Algo que el personaje se pone mientras se cumple una condición: un bigote, un sombrero. Se dibuja encima y se
          mueve con él.
        </p>
      </div>
      {list.map((acc, i) => (
        <AccessoryRow key={acc.id} project={project} acc={acc} images={images} onPatch={(p) => patch(i, p)} onRemove={() => setList(list.filter((_, j) => j !== i))} />
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={!images.length}
        onClick={() =>
          setList([
            ...list,
            { id: crypto.randomUUID(), assetId: images[0].id, when: { kind: "flag", id: "" }, x: 0.5, y: 0.3, height: 0.1 },
          ])
        }
      >
        <Plus className="size-4" /> Añadir accesorio
      </Button>
    </div>
  )
}

function AccessoryRow({
  project,
  acc,
  images,
  onPatch,
  onRemove,
}: {
  project: GameProject
  acc: CharacterAccessory
  images: GameProject["assets"]
  onPatch: (p: Partial<CharacterAccessory>) => void
  onRemove: () => void
}) {
  const c = project.character
  const asset = (id: string | null | undefined) => project.assets.find((a) => a.id === id)
  const idle = asset(c.idleAssetId)
  const img = asset(acc.assetId)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const left = c.directions?.left
  const frames = [
    ...c.walkAssetIds.map((id) => ({ id, mirrored: false })),
    ...(left ? [left.idleAssetId, ...left.walkAssetIds].filter((x): x is string => !!x).map((id) => ({ id, mirrored: true })) : []),
  ]
  const tracked = Object.keys(acc.at ?? {}).length
  // Moving it by hand invalidates the per-frame positions measured from the old spot.
  const move = (p: Partial<CharacterAccessory>) => onPatch({ ...p, at: undefined })

  async function track() {
    if (!idle) return
    setBusy(true)
    setMsg(null)
    try {
      const at = await trackPoint(
        idle.dataUrl,
        { x: acc.x, y: acc.y },
        frames.flatMap((f) => {
          const a = asset(f.id)
          return a ? [{ id: f.id, src: a.dataUrl, mirrored: f.mirrored }] : []
        }),
      )
      onPatch({ at: { [idle.id]: { x: acc.x, y: acc.y }, ...at } })
      setMsg(`Listo: ${Object.keys(at).length} fotogramas ajustados. Revísalo en Jugar.`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo ajustar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex items-center gap-1.5">
        <Native value={acc.assetId} onChange={(assetId) => onPatch({ assetId })}>
          {images.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Native>
        <Button size="icon" variant="ghost" className="size-8 shrink-0" title="Quitar" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Placement on the standing sprite */}
      {idle && (
        <div className="relative mx-auto h-48 w-fit rounded bg-[repeating-conic-gradient(#0000_0_25%,#ffffff10_0_50%)] bg-[length:16px_16px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={idle.dataUrl} alt="" className="h-full w-auto" draggable={false} />
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img.dataUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ left: `${acc.x * 100}%`, top: `${acc.y * 100}%`, height: `${acc.height * 100}%`, transform: "translate(-50%, -50%)" }}
            />
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Horizontal", "x", 0, 1],
            ["Vertical", "y", 0, 1],
            ["Tamaño", "height", 0.02, 0.5],
          ] as const
        ).map(([label, k, min, max]) => (
          <div key={k} className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              {label} {Math.round(acc[k] * 100)}%
            </p>
            <Slider value={[acc[k]]} min={min} max={max} step={0.005} onValueChange={([v]) => (k === "height" ? onPatch({ height: v }) : move({ [k]: v }))} />
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">Lo lleva puesto</p>
        <ConditionPicker value={acc.when} onChange={(when) => when && onPatch({ when })} alwaysLabel="(elige cuándo)" />
        <p className="text-[11px] text-muted-foreground">
          Lo normal: un objeto del inventario cuyo diálogo de uso activa o desactiva la variable («Ponérmelo» /
          «Quitármelo»).
        </p>
      </div>

      <div className="space-y-1">
        <Button size="sm" variant="outline" disabled={busy || !frames.length} onClick={track}>
          <Crosshair className="size-4" /> {busy ? "Ajustando…" : "Ajustar a cada fotograma"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {tracked
            ? `Ajustado en ${tracked} fotogramas. Si lo mueves, hay que ajustarlo de nuevo.`
            : "Al caminar la cabeza se mueve: esto busca el mismo punto en cada fotograma (también los de la izquierda)."}
        </p>
        {msg && <p className="text-[11px] text-emerald-400">{msg}</p>}
      </div>
    </div>
  )
}

