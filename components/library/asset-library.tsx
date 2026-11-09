"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { referenceSlot } from "@/lib/studio-reference"
import {
  Copy,
  Download,
  Eraser,
  ImagePlus,
  ImageIcon,
  Images,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ViewHeader } from "@/components/app-shell/view-header"
import { useGameStore } from "@/lib/game-store"
import type { Asset, AssetKind } from "@/lib/game-types"
import { cropToAspect, dataUrlToAsset, fileToAsset, isGameAspect, removeGreenScreen } from "@/lib/image-utils"
import { assetSizeKB, assetUsages } from "@/lib/asset-usage"
import { editAssetWithAI, outpaintBackground } from "@/lib/ai-asset-generator"
import { slugifyName } from "@/lib/project-files"
import { cn } from "@/lib/utils"
import { confirmAction } from "@/components/ui/confirm-host"

const KIND_LABELS: Record<AssetKind, string> = { background: "Fondo", sprite: "Personaje", object: "Objeto", video: "Video" }
type Filter = "all" | AssetKind

const checker = "bg-[repeating-conic-gradient(#ffffff0d_0_25%,transparent_0_50%)] bg-[length:16px_16px]"

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** All the project's images: browse, see where each is used, replace, edit with AI, duplicate, delete. */
export function AssetLibrary() {
  const { project, mutate } = useGameStore()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [unusedOnly, setUnusedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploadKind, setUploadKind] = useState<AssetKind>("background")
  const uploadRef = useRef<HTMLInputElement>(null)

  const usages = useMemo(() => {
    const map = new Map<string, string[]>()
    if (project) for (const a of project.assets) map.set(a.id, assetUsages(project, a.id))
    return map
  }, [project])

  if (!project) return null

  const counts = {
    all: project.assets.length,
    background: project.assets.filter((a) => a.kind === "background").length,
    sprite: project.assets.filter((a) => a.kind === "sprite").length,
    object: project.assets.filter((a) => a.kind === "object").length,
    video: project.assets.filter((a) => a.kind === "video").length,
  }
  const q = query.trim().toLowerCase()
  const list = project.assets.filter(
    (a) =>
      (filter === "all" || a.kind === filter) &&
      (!q || a.name.toLowerCase().includes(q)) &&
      (!unusedOnly || (usages.get(a.id)?.length ?? 0) === 0),
  )
  const selected = project.assets.find((a) => a.id === selectedId) ?? null

  async function handleUpload(files: FileList) {
    const kind = filter === "all" ? uploadKind : filter
    const assets = await Promise.all(Array.from(files).map((f) => fileToAsset(f, kind)))
    mutate((d) => ({ ...d, assets: [...d.assets, ...assets] }))
    if (assets[0]) setSelectedId(assets[0].id)
  }

  return (
    <>
      <ViewHeader
        icon={Images}
        title="Biblioteca de assets"
        description="Todas las imágenes del proyecto: dónde se usan, reemplazarlas, editarlas con IA o subir nuevas."
        actions={
          <>
            {filter === "all" && (
              <select
                value={uploadKind}
                onChange={(e) => setUploadKind(e.target.value as AssetKind)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Tipo de los archivos a subir"
              >
                <option value="background">Subir como fondo</option>
                <option value="sprite">Subir como personaje</option>
                <option value="object">Subir como objeto</option>
              </select>
            )}
            <Button size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
              <Upload className="size-4" /> Subir
            </Button>
            <Button size="sm" asChild>
              <Link href="/studio">
                <Wand2 className="size-4" /> Generar con IA
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Gallery */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg bg-muted p-0.5 text-sm">
                {(["all", "background", "sprite", "object", "video"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-md px-3 py-1 transition-colors",
                      filter === f ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f === "all" ? "Todos" : `${KIND_LABELS[f]}s`}
                    <span className="ml-1.5 text-xs text-muted-foreground">{counts[f]}</span>
                  </button>
                ))}
              </div>
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre…" className="h-9 pl-8" />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={unusedOnly} onChange={(e) => setUnusedOnly(e.target.checked)} />
                Solo sin usar
              </label>
            </div>

            {list.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                {project.assets.length === 0 ? "Todavía no hay assets. Sube imágenes o genéralas con IA." : "Ningún asset coincide."}
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {list.map((a) => {
                  const used = usages.get(a.id)?.length ?? 0
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(a.id)}
                        className={cn(
                          "group w-full overflow-hidden rounded-lg border text-left transition-colors",
                          selectedId === a.id ? "border-primary" : "border-border hover:border-foreground/30",
                        )}
                      >
                        <div className={cn("relative aspect-square", checker)}>
                          {a.kind === "video" ? (
                            <video src={a.dataUrl} muted preload="metadata" className="size-full object-cover" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={a.dataUrl}
                              alt={a.name}
                              loading="lazy"
                              decoding="async"
                              className={cn("size-full", a.kind === "background" ? "object-cover" : "object-contain p-2")}
                            />
                          )}
                          <span
                            className={cn(
                              "absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              used ? "bg-black/70 text-white" : "bg-amber-500 text-black",
                            )}
                          >
                            {used ? `En uso · ${used}` : "Sin usar"}
                          </span>
                        </div>
                        <div className="p-2">
                          <p className="truncate text-sm">{a.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {KIND_LABELS[a.kind]} · {a.width}×{a.height}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Detail */}
        {selected && (
          <AssetDetail
            key={selected.id}
            asset={selected}
            usages={usages.get(selected.id) ?? []}
            onClose={() => setSelectedId(null)}
            onSelect={setSelectedId}
          />
        )}
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleUpload(e.target.files)
          e.target.value = ""
        }}
      />
    </>
  )
}

function AssetDetail({
  asset,
  usages,
  onClose,
  onSelect,
}: {
  asset: Asset
  usages: string[]
  onClose: () => void
  onSelect: (id: string | null) => void
}) {
  const { mutate } = useGameStore()
  const router = useRouter()
  const replaceRef = useRef<HTMLInputElement>(null)
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)

  const patch = (p: Partial<Asset>) =>
    mutate((d) => ({ ...d, assets: d.assets.map((a) => (a.id === asset.id ? { ...a, ...p } : a)) }))

  async function replaceWith(dataUrl: string) {
    const next = await dataUrlToAsset(dataUrl, asset.kind, asset.name)
    // Same id: every scene, object, item or character frame using it updates automatically.
    patch({ dataUrl: next.dataUrl, width: next.width, height: next.height })
  }

  async function saveAsNew(dataUrl: string) {
    const next = await dataUrlToAsset(dataUrl, asset.kind, `${asset.name} (IA)`)
    mutate((d) => ({ ...d, assets: [...d.assets, next] }))
    onSelect(next.id)
  }

  async function runAiEdit() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const out = await editAssetWithAI({ ...asset, prompt })
      setResult(out.dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo editar la imagen")
    } finally {
      setLoading(false)
    }
  }

  function download() {
    const a = document.createElement("a")
    a.href = asset.dataUrl
    a.download = `${slugifyName(asset.name)}.png`
    a.click()
  }

  async function remove() {
    const msg = usages.length
      ? `«${asset.name}» se usa en ${usages.length} lugar(es):\n\n${usages.join("\n")}\n\nEsos lugares quedarán sin imagen. ¿Eliminarlo igual?`
      : `¿Eliminar «${asset.name}»?`
    if (!(await confirmAction(msg, { confirmLabel: "Eliminar", destructive: true }))) return
    mutate((d) => ({ ...d, assets: d.assets.filter((a) => a.id !== asset.id) }))
    onSelect(null)
  }

  return (
    <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm font-medium">Detalle</p>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" title="Cerrar">
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 p-4">
        {/* Preview (before/after when there is an AI result) */}
        {result ? (
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Antes", asset.dataUrl],
              ["Después", result],
            ].map(([label, src]) => (
              <div key={label}>
                <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
                <div
                  className={cn(
                    "overflow-hidden rounded-md border border-border",
                    asset.kind === "background" ? "aspect-video" : "aspect-square",
                    checker,
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={label} className="size-full object-contain" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn("flex aspect-video items-center justify-center overflow-hidden rounded-md border border-border", checker)}>
            {asset.kind === "video" ? (
              <video src={asset.dataUrl} controls className="max-h-full max-w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.dataUrl} alt={asset.name} className="max-h-full max-w-full object-contain" />
            )}
          </div>
        )}

        <div className="space-y-2">
          <Input value={asset.name} onChange={(e) => patch({ name: e.target.value })} className="h-8 text-sm" aria-label="Nombre" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <select
              value={asset.kind}
              onChange={(e) => patch({ kind: e.target.value as AssetKind })}
              className="h-7 rounded border border-input bg-background px-1.5 text-xs"
              aria-label="Tipo"
            >
              <option value="background">Fondo</option>
              <option value="sprite">Personaje</option>
              <option value="object">Objeto</option>
            </select>
            <span>
              {asset.width}×{asset.height} · {assetSizeKB(asset.dataUrl)} KB
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Dónde se usa</p>
          {usages.length ? (
            <ul className="space-y-1 text-sm">
              {usages.map((u) => (
                <li key={u} className="flex items-start gap-1.5">
                  <ImageIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> {u}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-amber-300">No se usa en ninguna parte.</p>
          )}
        </div>

        {/* Backgrounds must be 16:9 to fill the game screen without cropping */}
        {asset.kind === "background" && !isGameAspect(asset.width, asset.height) && !result && (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm font-medium text-amber-100">Este fondo no es 16:9</p>
            <p className="text-xs text-amber-100/80">
              El escenario del juego es 16:9: así se recortará {asset.width / asset.height > 16 / 9 ? "a los lados" : "arriba y abajo"}.
              Ajústalo para ver exactamente lo que se mostrará.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={fixing}
                onClick={async () => setResult(await cropToAspect(asset.dataUrl))}
                title="Gratis: corta al centro"
              >
                Recortar a 16:9
              </Button>
              {asset.width / asset.height < 16 / 9 && (
                <Button
                  size="sm"
                  disabled={fixing}
                  title="La IA dibuja los costados que faltan, sin perder nada de la imagen"
                  onClick={async () => {
                    setFixing(true)
                    setError(null)
                    try {
                      const out = await outpaintBackground(asset.dataUrl)
                      setResult(await cropToAspect(out.dataUrl))
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "No se pudo extender el fondo")
                    } finally {
                      setFixing(false)
                    }
                  }}
                >
                  {fixing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {fixing ? "Extendiendo… (~1 min)" : "Extender con IA"}
                </Button>
              )}
            </div>
            {error && <p className="break-words text-xs text-destructive">{error}</p>}
          </div>
        )}

        {/* Characters and objects drawn on a green screen: make the background transparent */}
        {asset.kind !== "background" && !result && (
          <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
            <p className="text-sm font-medium">Quitar fondo verde</p>
            <p className="text-xs text-muted-foreground">
              Para personajes y objetos generados sobre fondo verde liso: lo vuelve transparente y recorta los bordes.
              Gratis; revisa el resultado antes de guardarlo.
            </p>
            <Button size="sm" variant="outline" onClick={async () => setResult(await removeGreenScreen(asset.dataUrl))}>
              <Eraser className="size-4" /> Quitar fondo verde
            </Button>
          </div>
        )}

        {/* AI edit */}
        <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-4 text-amber-300" /> Editar con IA
          </p>
          {result ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Reemplazar actualiza la imagen en todos los lugares donde se usa. «Guardar como nuevo» conserva el
                original.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => replaceWith(result).then(() => setResult(null))}>
                  Reemplazar original
                </Button>
                <Button size="sm" variant="outline" onClick={() => saveAsNew(result)}>
                  Guardar como nuevo
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                  Descartar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runAiEdit()
                }}
                placeholder={
                  asset.kind === "background"
                    ? "Ej.: «que sea de noche, con luna llena»"
                    : "Ej.: «cambia la antorcha por una linterna»"
                }
                rows={3}
                disabled={loading}
                className="text-sm"
              />
              <Button size="sm" className="w-full" onClick={runAiEdit} disabled={!prompt.trim() || loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                {loading ? "Editando… (puede tardar ~1 min)" : "Generar versión editada"}
              </Button>
              {error && <p className="break-words text-xs text-destructive">{error}</p>}
            </>
          )}
        </div>

        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            referenceSlot.set({ assetId: asset.id, name: asset.name, dataUrl: asset.dataUrl })
            router.push("/studio")
          }}
          title="Abre el generador con esta imagen como referencia (puedes elegir solo una parte)"
        >
          <ImagePlus className="size-4" /> Usar como referencia para generar otro
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => replaceRef.current?.click()} title="Sube otra imagen en su lugar; se actualiza donde se use">
            <RefreshCw className="size-4" /> Reemplazar…
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const copy: Asset = { ...asset, id: crypto.randomUUID(), name: `${asset.name} (copia)` }
              mutate((d) => ({ ...d, assets: [...d.assets, copy] }))
              onSelect(copy.id)
            }}
          >
            <Copy className="size-4" /> Duplicar
          </Button>
          <Button size="sm" variant="outline" onClick={download}>
            <Download className="size-4" /> Descargar
          </Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={remove}>
            <Trash2 className="size-4" /> Eliminar
          </Button>
        </div>
      </div>

      <input
        ref={replaceRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) await replaceWith(await readFile(file))
        }}
      />
    </aside>
  )
}
