"use client"

import Link from "next/link"

import { useRef, useState } from "react"
import {
  ImagePlus,
  Layers,
  MessageSquare,
  Music,
  Package,
  Play,
  Square,
  User,
  Plus,
  Trash2,
  Star,
  Upload,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useGameStore } from "@/lib/game-store"
import { useEditorUI } from "./editor-context"
import { fileToAsset } from "@/lib/image-utils"
import type { AssetKind, Dialog, InventoryItem, SoundSpec } from "@/lib/game-types"
import { cn } from "@/lib/utils"

export function LibraryPanel() {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <Tabs defaultValue="scenes" className="flex h-full flex-col gap-0">
        <TabsList className="m-2 grid grid-cols-6">
          <TabsTrigger value="scenes" title="Scenes">
            <Layers className="size-4" />
          </TabsTrigger>
          <TabsTrigger value="assets" title="Assets">
            <ImagePlus className="size-4" />
          </TabsTrigger>
          <TabsTrigger value="items" title="Inventory items">
            <Package className="size-4" />
          </TabsTrigger>
          <TabsTrigger value="dialogs" title="Dialogs">
            <MessageSquare className="size-4" />
          </TabsTrigger>
          <TabsTrigger value="character" title="Character">
            <User className="size-4" />
          </TabsTrigger>
          <TabsTrigger value="sounds" title="Sonidos">
            <Music className="size-4" />
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <div className="p-2">
            <TabsContent value="scenes" className="mt-0">
              <ScenesSection />
            </TabsContent>
            <TabsContent value="assets" className="mt-0">
              <AssetsSection />
            </TabsContent>
            <TabsContent value="items" className="mt-0">
              <ItemsSection />
            </TabsContent>
            <TabsContent value="dialogs" className="mt-0">
              <DialogsSection />
            </TabsContent>
            <TabsContent value="character" className="mt-0">
              <CharacterSection />
            </TabsContent>
            <TabsContent value="sounds" className="mt-0">
              <SoundsSection />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  )
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {action}
    </div>
  )
}

/* ---------------- Scenes ---------------- */

function ScenesSection() {
  const { project, mutate } = useGameStore()
  const { activeSceneId, setActiveSceneId, setSelection } = useEditorUI()
  if (!project) return null

  function addScene() {
    const id = crypto.randomUUID()
    mutate((d) => ({
      ...d,
      scenes: [
        ...d.scenes,
        {
          id,
          name: `Scene ${d.scenes.length + 1}`,
          backgroundAssetId: null,
          hotspots: [],
          walkableAreas: [],
          sceneObjects: [],
          characterLayerZ: 0,
          depthWaypoints: [
            { id: crypto.randomUUID(), x: 0.5, y: 0.2, scale: 0.6, links: [] },
            { id: crypto.randomUUID(), x: 0.5, y: 0.85, scale: 1, links: [] },
          ],
          characterStart: { x: 0.5, y: 0.8 },
        },
      ],
      startSceneId: d.startSceneId ?? id,
    }))
    setActiveSceneId(id)
    setSelection({ type: "scene" })
  }

  return (
    <div>
      <SectionHeader
        title="Scenes"
        action={
          <Button size="icon" variant="ghost" className="size-7" onClick={addScene}>
            <Plus className="size-4" />
          </Button>
        }
      />
      {project.scenes.length === 0 && (
        <EmptyHint icon={<Layers className="size-5" />} label="No scenes yet. Add one to start." />
      )}
      <div className="flex flex-col gap-1">
        {project.scenes.map((scene) => {
          const bg = project.assets.find((a) => a.id === scene.backgroundAssetId)
          return (
            <button
              key={scene.id}
              onClick={() => {
                setActiveSceneId(scene.id)
                setSelection({ type: "scene" })
              }}
              className={cn(
                "group flex items-center gap-2 rounded-md border p-1.5 text-left transition-colors",
                activeSceneId === scene.id
                  ? "border-primary/60 bg-primary/10"
                  : "border-transparent hover:bg-accent",
              )}
            >
              <div className="size-10 shrink-0 overflow-hidden rounded bg-muted">
                {bg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bg.dataUrl || "/placeholder.svg"} alt="" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-muted-foreground">
                    <Layers className="size-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{scene.name}</p>
                <p className="text-xs text-muted-foreground">{scene.hotspots.length} hotspots</p>
              </div>
              {project.startSceneId === scene.id && (
                <Star className="size-3.5 shrink-0 fill-primary text-primary" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Assets ---------------- */

function AssetsSection() {
  const { project, mutate } = useGameStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<AssetKind>("background")
  if (!project) return null

  async function onFiles(files: FileList | null) {
    if (!files) return
    const assets = await Promise.all(Array.from(files).map((f) => fileToAsset(f, kind)))
    mutate((d) => ({ ...d, assets: [...d.assets, ...assets] }))
  }

  const groups: { kind: AssetKind; label: string }[] = [
    { kind: "background", label: "Backgrounds" },
    { kind: "sprite", label: "Character sprites" },
    { kind: "object", label: "Objects" },
  ]

  return (
    <div>
      <SectionHeader
        title="Assets"
        action={
          <Link href="/library" className="text-[11px] text-muted-foreground hover:text-foreground">
            Biblioteca completa →
          </Link>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ""
        }}
      />
      <div className="mb-3 grid grid-cols-3 gap-1">
        {groups.map((g) => (
          <Button
            key={g.kind}
            size="sm"
            variant={kind === g.kind ? "default" : "secondary"}
            className="text-xs"
            onClick={() => setKind(g.kind)}
          >
            {g.label.split(" ")[0]}
          </Button>
        ))}
      </div>
      <Button className="mb-3 w-full" variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload className="size-4" /> Upload {kind}
      </Button>

      {(() => {
        const selectedGroup = groups.find((g) => g.kind === kind) ?? groups[0]
        const items = project.assets.filter((a) => a.kind === selectedGroup.kind)

        if (project.assets.length === 0) {
          return (
            <EmptyHint
              icon={<ImagePlus className="size-5" />}
              label="Upload backgrounds, sprites and objects."
            />
          )
        }

        if (items.length === 0) {
          return (
            <EmptyHint
              icon={<ImagePlus className="size-5" />}
              label={`No ${selectedGroup.label.toLowerCase()} yet.`}
            />
          )
        }

        return (
          <div className="mb-4">
            <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">{selectedGroup.label}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {items.map((a) => (
                <div
                  key={a.id}
                  draggable={a.kind === "object"}
                  onDragStart={(e) => {
                    if (a.kind !== "object") return
                    e.dataTransfer.setData("application/x-pixelquest-object-asset", a.id)
                    e.dataTransfer.effectAllowed = "copy"
                  }}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.dataUrl || "/placeholder.svg"} alt={a.name} className="size-full object-contain" />
                  <button
                    onClick={() =>
                      mutate((d) => ({ ...d, assets: d.assets.filter((x) => x.id !== a.id) }))
                    }
                    className="absolute right-1 top-1 hidden rounded bg-background/80 p-1 text-destructive group-hover:block"
                    title="Delete asset"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                  <span className="absolute inset-x-0 bottom-0 truncate bg-background/70 px-1 py-0.5 text-[10px]">
                    {a.name}
                  </span>
                  {a.kind === "object" && (
                    <span className="pointer-events-none absolute left-1 top-1 rounded bg-background/80 px-1 py-0.5 text-[9px] text-muted-foreground">
                      drag
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/* ---------------- Items ---------------- */

function ItemsSection() {
  const { project, mutate } = useGameStore()
  if (!project) return null

  function addItem() {
    const item: InventoryItem = {
      id: crypto.randomUUID(),
      name: `Item ${project!.items.length + 1}`,
      assetId: null,
    }
    mutate((d) => ({ ...d, items: [...d.items, item] }))
  }

  const objectAssets = project.assets.filter((a) => a.kind === "object")

  return (
    <div>
      <SectionHeader
        title="Inventory items"
        action={
          <Button size="icon" variant="ghost" className="size-7" onClick={addItem}>
            <Plus className="size-4" />
          </Button>
        }
      />
      <InventoryButtonPicker />
      {project.items.length === 0 && (
        <EmptyHint icon={<Package className="size-5" />} label="Items the player can collect." />
      )}
      <div className="flex flex-col gap-2">
        {project.items.map((item) => {
          const asset = project.assets.find((a) => a.id === item.assetId)
          return (
            <div key={item.id} className="rounded-md border border-border bg-card p-2">
              <div className="flex items-center gap-2">
                <div className="size-9 shrink-0 overflow-hidden rounded bg-muted">
                  {asset ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.dataUrl || "/placeholder.svg"} alt="" className="size-full object-contain" />
                  ) : (
                    <div className="grid size-full place-items-center text-muted-foreground">
                      <Package className="size-4" />
                    </div>
                  )}
                </div>
                <Input
                  value={item.name}
                  onChange={(e) =>
                    mutate((d) => ({
                      ...d,
                      items: d.items.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x)),
                    }))
                  }
                  className="h-8"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 text-destructive"
                  onClick={() =>
                    mutate((d) => ({ ...d, items: d.items.filter((x) => x.id !== item.id) }))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <select
                value={item.assetId ?? ""}
                onChange={(e) =>
                  mutate((d) => ({
                    ...d,
                    items: d.items.map((x) =>
                      x.id === item.id ? { ...x, assetId: e.target.value || null } : x,
                    ),
                  }))
                }
                className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">No image</option>
                {objectAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                value={item.useDialogId ?? ""}
                onChange={(e) =>
                  mutate((d) => ({
                    ...d,
                    items: d.items.map((x) => (x.id === item.id ? { ...x, useDialogId: e.target.value || null } : x)),
                  }))
                }
                className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                title="Diálogo que se abre al tocar el objeto en el inventario durante el juego"
              >
                <option value="">Al usarlo: nada</option>
                {project.dialogs.map((dl) => (
                  <option key={dl.id} value={dl.id}>
                    Al usarlo: {dl.name}
                  </option>
                ))}
              </select>
              {item.useDialogId && (
                <label
                  className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
                  title="En el juego sale como un botón propio al lado del inventario, no dentro de él"
                >
                  <input
                    type="checkbox"
                    checked={!!item.quickAccess}
                    onChange={(e) =>
                      mutate((d) => ({
                        ...d,
                        items: d.items.map((x) => (x.id === item.id ? { ...x, quickAccess: e.target.checked } : x)),
                      }))
                    }
                  />
                  Botón propio junto al inventario
                </label>
              )}
              {item.useDialogId && (project.sounds ?? []).length > 0 && (
                <select
                  value={item.useSoundId ?? ""}
                  onChange={(e) =>
                    mutate((d) => ({
                      ...d,
                      items: d.items.map((x) => (x.id === item.id ? { ...x, useSoundId: e.target.value || null } : x)),
                    }))
                  }
                  className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  title="Sonido que suena al usar el objeto"
                >
                  <option value="">Sonido al usarlo: ninguno</option>
                  {(project.sounds ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      Sonido al usarlo: {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Image of the in-game inventory button (any sprite or object of the library). */
function InventoryButtonPicker() {
  const { project, mutate } = useGameStore()
  if (!project) return null
  const icon = project.assets.find((a) => a.id === project.inventoryIconAssetId)
  const images = project.assets.filter((a) => a.kind !== "background")
  return (
    <div className="mb-3 rounded-md border border-border bg-card p-2">
      <p className="mb-1.5 text-xs font-medium">Botón del inventario</p>
      <div className="flex items-center gap-2">
        <div className="size-9 shrink-0 overflow-hidden rounded bg-muted">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon.dataUrl} alt="" className="size-full object-contain" />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground">
              <Package className="size-4" />
            </div>
          )}
        </div>
        <select
          value={project.inventoryIconAssetId ?? ""}
          onChange={(e) => mutate((d) => ({ ...d, inventoryIconAssetId: e.target.value || null }))}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          title="Imagen del botón que abre el inventario durante el juego"
        >
          <option value="">Icono de bolsa (por defecto)</option>
          {images.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Sale abajo a la izquierda de la escena; al pulsarlo abre el inventario flotante. Sube la imagen como objeto en la
        Biblioteca.
      </p>
    </div>
  )
}

/* ---------------- Dialogs ---------------- */

function DialogsSection() {
  const { project } = useGameStore()
  if (!project) return null

  return (
    <div>
      <SectionHeader
        title="Dialogs"
        action={
          <Button asChild size="icon" variant="ghost" className="size-7" title="Abrir editor de diálogos">
            <Link href="/dialogs">
              <Plus className="size-4" />
            </Link>
          </Button>
        }
      />
      {project.dialogs.length === 0 && (
        <EmptyHint icon={<MessageSquare className="size-5" />} label="Conversations and text boxes." />
      )}
      <div className="flex flex-col gap-1">
        {project.dialogs.map((dialog) => (
          <Link
            key={dialog.id}
            href={`/dialogs?d=${dialog.id}`}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm hover:bg-accent"
          >
            <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{dialog.name}</span>
            <span className="text-[11px] text-muted-foreground">{dialog.lines.length}</span>
          </Link>
        ))}
      </div>
      <Button asChild variant="outline" size="sm" className="mt-3 w-full">
        <Link href="/dialogs">Abrir editor de diálogos</Link>
      </Button>
    </div>
  )
}

/* ---------------- Character ---------------- */

function CharacterSection() {
  const { project, mutate } = useGameStore()
  const { setSelection } = useEditorUI()
  if (!project) return null

  const sprites = project.assets.filter((a) => a.kind === "sprite")
  const { character } = project

  function toggleWalk(assetId: string) {
    mutate((d) => {
      const has = d.character.walkAssetIds.includes(assetId)
      return {
        ...d,
        character: {
          ...d.character,
          walkAssetIds: has
            ? d.character.walkAssetIds.filter((x) => x !== assetId)
            : [...d.character.walkAssetIds, assetId],
        },
      }
    })
  }

  function removeWalk(assetId: string) {
    mutate((d) => ({
      ...d,
      character: {
        ...d.character,
        walkAssetIds: d.character.walkAssetIds.filter((x) => x !== assetId),
      },
    }))
  }

  function moveWalk(assetId: string, dir: -1 | 1) {
    mutate((d) => {
      const arr = [...d.character.walkAssetIds]
      const idx = arr.indexOf(assetId)
      if (idx < 0) return d
      const next = idx + dir
      if (next < 0 || next >= arr.length) return d
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return { ...d, character: { ...d.character, walkAssetIds: arr } }
    })
  }

  return (
    <div onClick={() => setSelection({ type: "character" })}>
      <SectionHeader title="Character" />
      {sprites.length === 0 && (
        <EmptyHint
          icon={<User className="size-5" />}
          label="Upload sprite assets first, then assign them here."
        />
      )}

      <div className="mb-3 rounded-md border border-border bg-card p-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Dirección inicial</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant={(character.startFacing ?? 1) === -1 ? "default" : "outline"}
            onClick={() => mutate((d) => ({ ...d, character: { ...d.character, startFacing: -1 } }))}
          >
            Izquierda
          </Button>
          <Button
            size="sm"
            variant={(character.startFacing ?? 1) === 1 ? "default" : "outline"}
            onClick={() => mutate((d) => ({ ...d, character: { ...d.character, startFacing: 1 } }))}
          >
            Derecha
          </Button>
        </div>
      </div>

      <div className="mb-3 rounded-md border border-border bg-card p-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Animación caminar (ms por frame)</p>
        <Input
          type="number"
          min={60}
          max={500}
          step={10}
          value={character.walkFrameMs ?? 200}
          onChange={(e) => {
            const raw = Number(e.target.value)
            const v = Number.isFinite(raw) ? Math.max(60, Math.min(500, raw)) : 140
            mutate((d) => ({ ...d, character: { ...d.character, walkFrameMs: v } }))
          }}
          className="h-8"
        />
      </div>

      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-muted-foreground">Idle sprite</p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive"
          onClick={() => mutate((d) => ({ ...d, character: { ...d.character, idleAssetId: null } }))}
          disabled={!character.idleAssetId}
        >
          Quitar idle
        </Button>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-1.5">
        {sprites.map((a) => (
          <button
            key={a.id}
            onClick={() =>
              mutate((d) => ({ ...d, character: { ...d.character, idleAssetId: a.id } }))
            }
            className={cn(
              "relative aspect-square overflow-hidden rounded-md border bg-muted",
              character.idleAssetId === a.id ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <img src={a.dataUrl || "/placeholder.svg"} alt={a.name} className="size-full object-contain" />
          </button>
        ))}
      </div>

      <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">
        Walk frames (tap para agregar/quitar)
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {sprites.map((a) => {
          const idx = character.walkAssetIds.indexOf(a.id)
          return (
            <button
              key={a.id}
              onClick={() => toggleWalk(a.id)}
              className={cn(
                "relative aspect-square overflow-hidden rounded-md border bg-muted",
                idx >= 0 ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <img src={a.dataUrl || "/placeholder.svg"} alt={a.name} className="size-full object-contain" />
              {idx >= 0 && (
                <Badge className="absolute left-0.5 top-0.5 size-4 justify-center p-0 text-[10px]">
                  {idx + 1}
                </Badge>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 space-y-1 rounded-md border border-border bg-card p-2">
        <p className="text-xs font-medium text-muted-foreground">Secuencia de caminar</p>
        {character.walkAssetIds.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin frames de caminar.</p>
        )}
        {character.walkAssetIds.map((id, i, arr) => {
          const a = sprites.find((s) => s.id === id)
          if (!a) return null
          return (
            <div key={`${id}-${i}`} className="flex items-center gap-1 rounded border border-border bg-background px-1 py-1">
              <span className="w-4 text-center text-[10px] text-muted-foreground">{i + 1}</span>
              <div className="size-7 overflow-hidden rounded bg-muted">
                <img src={a.dataUrl || "/placeholder.svg"} alt={a.name} className="size-full object-contain" />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs">{a.name}</span>
              <Button size="icon" variant="ghost" className="size-6" disabled={i === 0} onClick={() => moveWalk(id, -1)}>
                ↑
              </Button>
              <Button size="icon" variant="ghost" className="size-6" disabled={i === arr.length - 1} onClick={() => moveWalk(id, 1)}>
                ↓
              </Button>
              <Button size="icon" variant="ghost" className="size-6 text-destructive" onClick={() => removeWalk(id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EmptyHint({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-3 py-8 text-center text-muted-foreground">
      {icon}
      <p className="text-xs text-balance">{label}</p>
    </div>
  )
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Music and sound effects: upload, listen, loop and volume, and the game-wide sounds. */
function SoundsSection() {
  const { project, mutate } = useGameStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [playing, setPlaying] = useState<{ id: string; audio: HTMLAudioElement } | null>(null)
  if (!project) return null
  const sounds = project.sounds ?? []

  async function addFiles(files: FileList | null) {
    const added: SoundSpec[] = []
    for (const f of Array.from(files ?? [])) {
      added.push({ id: crypto.randomUUID(), name: f.name.replace(/\.[^.]+$/, ""), dataUrl: await readAsDataUrl(f), volume: 0.8, loop: false })
    }
    if (added.length) mutate((d) => ({ ...d, sounds: [...(d.sounds ?? []), ...added] }))
  }
  function patch(id: string, p: Partial<SoundSpec>) {
    mutate((d) => ({ ...d, sounds: (d.sounds ?? []).map((s) => (s.id === id ? { ...s, ...p } : s)) }))
  }
  function toggle(s: SoundSpec) {
    playing?.audio.pause()
    if (playing?.id === s.id) return setPlaying(null)
    const audio = new Audio(s.dataUrl)
    audio.volume = s.volume
    audio.onended = () => setPlaying(null)
    audio.play().catch(() => {})
    setPlaying({ id: s.id, audio })
  }
  const pick = (key: "pickupSoundId" | "doorSoundId", label: string, hint: string) => (
    <label className="mt-1.5 block text-xs" title={hint}>
      <span className="text-muted-foreground">{label}</span>
      <select
        value={project[key] ?? ""}
        onChange={(e) => mutate((d) => ({ ...d, [key]: e.target.value || null }))}
        className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Ninguno</option>
        {sounds.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div>
      <SectionHeader
        title="Sonidos"
        action={
          <Button size="icon" variant="ghost" className="size-7" onClick={() => fileRef.current?.click()} title="Subir audio">
            <Upload className="size-4" />
          </Button>
        }
      />
      <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      <div className="mb-3 rounded-md border border-border bg-card p-2">
        <p className="text-xs font-medium">Sonidos del juego</p>
        {pick("pickupSoundId", "Al conseguir un objeto", "Suena cada vez que el jugador recibe un objeto")}
        {pick("doorSoundId", "Al cruzar una puerta", "Suena al pasar por una puerta a otra escena")}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          La música de cada escena se elige en el inspector de la escena; el sonido de un objeto usable, en Objetos.
        </p>
      </div>
      {sounds.length === 0 && <EmptyHint icon={<Music className="size-5" />} label="Sube música y efectos (mp3, wav, ogg)." />}
      <div className="flex flex-col gap-2">
        {sounds.map((s) => (
          <div key={s.id} className="rounded-md border border-border bg-card p-2">
            <div className="flex items-center gap-1.5">
              <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => toggle(s)} title={playing?.id === s.id ? "Parar" : "Escuchar"}>
                {playing?.id === s.id ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
              </Button>
              <Input value={s.name} onChange={(e) => patch(s.id, { name: e.target.value })} className="h-7 min-w-0 flex-1 text-sm" />
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => mutate((d) => ({ ...d, sounds: (d.sounds ?? []).filter((x) => x.id !== s.id) }))}
                title="Quitar"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={s.loop} onChange={(e) => patch(s.id, { loop: e.target.checked })} />
                En bucle
              </label>
              <span className="ml-auto">Volumen</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.volume}
                onChange={(e) => patch(s.id, { volume: Number(e.target.value) })}
                className="w-24"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
