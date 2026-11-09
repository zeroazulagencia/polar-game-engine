"use client"

import { useRef, useState } from "react"
import { Crop, ImagePlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Asset } from "@/lib/game-types"
import { cropRegion, referenceSlot, type StudioReference } from "@/lib/studio-reference"
import { useSlot } from "@/lib/persistent-slot"

type Rect = { x: number; y: number; w: number; h: number }

/**
 * Reference image for the next generation: pick an asset (or arrive from the Library) and,
 * optionally, drag a rectangle over it to send only that part.
 */
export function ReferencePicker({ assets }: { assets: Asset[] }) {
  const reference = useSlot(referenceSlot)
  const [rect, setRect] = useState<Rect | null>(null)
  const [cropping, setCropping] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  const pos = (e: React.PointerEvent) => {
    const b = boxRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)),
      y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)),
    }
  }

  function choose(asset: Asset | undefined) {
    setRect(null)
    referenceSlot.set(asset ? { assetId: asset.id, name: asset.name, dataUrl: asset.dataUrl } : null)
  }

  async function usePart() {
    if (!reference || !rect) return
    setCropping(true)
    try {
      const dataUrl = await cropRegion(reference.dataUrl, rect)
      const next: StudioReference = { ...reference, dataUrl, name: `${reference.name.replace(/ \(parte\)$/, "")} (parte)`, partial: true }
      referenceSlot.set(next)
      setRect(null)
    } finally {
      setCropping(false)
    }
  }

  function restoreFull() {
    const asset = assets.find((a) => a.id === reference?.assetId)
    if (asset) choose(asset)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={reference?.assetId ?? ""}
          onChange={(e) => choose(assets.find((a) => a.id === e.target.value))}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Sin referencia (crear desde cero)</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {reference && (
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => choose(undefined)} title="Quitar referencia">
            <X className="size-4" />
          </Button>
        )}
      </div>

      {reference ? (
        <>
          <div
            ref={boxRef}
            className="relative cursor-crosshair select-none overflow-hidden rounded-md border border-border bg-[repeating-conic-gradient(#ffffff0d_0_25%,transparent_0_50%)] bg-[length:16px_16px]"
            onPointerDown={(e) => {
              const p = pos(e)
              drag.current = p
              setRect({ x: p.x, y: p.y, w: 0, h: 0 })
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!drag.current) return
              const p = pos(e)
              const s = drag.current
              setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
            }}
            onPointerUp={() => {
              drag.current = null
              setRect((r) => (r && r.w > 0.02 && r.h > 0.02 ? r : null))
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reference.dataUrl} alt={reference.name} className="pointer-events-none block max-h-56 w-full object-contain" draggable={false} />
            {rect && (
              <div
                className="pointer-events-none absolute border-2 border-sky-400 bg-sky-400/15"
                style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rect ? (
              <Button size="sm" variant="outline" onClick={usePart} disabled={cropping}>
                <Crop className="size-4" /> Usar solo esta parte
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {reference.partial ? "Se envía solo la parte recortada." : "Se envía completa. Arrastra encima para elegir solo una parte."}
              </span>
            )}
            {reference.partial && reference.assetId && (
              <Button size="sm" variant="ghost" onClick={restoreFull}>
                Usar completa
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImagePlus className="size-3.5" /> Opcional: la IA crea el asset a partir de una imagen tuya (o de una parte).
        </p>
      )}
    </div>
  )
}
