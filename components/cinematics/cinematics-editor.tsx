"use client"

import { useRef, useState } from "react"
import { ArrowDown, ArrowUp, Film, Flag, Monitor, Play, Plus, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useGameStore } from "@/lib/game-store"
import type { Asset, Cinematic, CinematicSlide, GameProject } from "@/lib/game-types"
import { dataUrlToAsset } from "@/lib/image-utils"
import { CinematicPlayer } from "@/components/editor/cinematic-player"
import { confirmAction } from "@/components/ui/confirm-host"
import { cn } from "@/lib/utils"
import { CreditsEditor, TitleScreenEditor } from "./title-credits-editor"

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm"

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function videoAsset(dataUrl: string, name: string): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video")
    v.preload = "metadata"
    v.onloadedmetadata = () =>
      resolve({ id: crypto.randomUUID(), name, kind: "video", dataUrl, width: v.videoWidth, height: v.videoHeight })
    v.onerror = () => reject(new Error("No se pudo leer el video"))
    v.src = dataUrl
  })
}

/** Where a cinematic is shown, in words. */
function usages(project: GameProject, id: string): string[] {
  const out: string[] = []
  if (project.introCinematicId === id) out.push("al empezar el juego")
  for (const s of project.scenes) if (s.enterCinematicId === id) out.push(`al entrar a ${s.name}`)
  for (const d of project.dialogs)
    if (d.lines.some((l) => [...(l.effects ?? []), ...(l.choices ?? []).flatMap((c) => c.effects ?? [])].some((e) => e.type === "playCinematic" && e.cinematicId === id)))
      out.push(`en el diálogo ${d.name}`)
  return out
}

export function CinematicsEditor() {
  const { project, mutate } = useGameStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  if (!project) return null
  const list = project.cinematics ?? []
  // the title screen and the credits are fixed entries above the cinematics
  const special = selectedId === "@title" || selectedId === "@credits" ? selectedId : null
  const selected = special ? undefined : (list.find((c) => c.id === selectedId) ?? list[0])

  function create() {
    const c: Cinematic = { id: crypto.randomUUID(), name: `Cinemática ${list.length + 1}`, slides: [{ id: crypto.randomUUID(), text: "" }] }
    mutate((d) => ({ ...d, cinematics: [...(d.cinematics ?? []), c] }))
    setSelectedId(c.id)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[240px_1fr]">
      <aside className="min-h-0 space-y-1 overflow-y-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
        {(
          [
            ["@title", Monitor, "Pantalla de título", project.titleScreen ? project.titleScreen.title || "solo la imagen" : "el juego arranca directo"],
            ["@credits", Flag, "Créditos y final", project.credits?.text.trim() ? `${project.credits.text.split("\n").filter((l) => l.trim()).length} líneas` : "sin créditos"],
          ] as const
        ).map(([key, Icon, label, hint]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelectedId(key)}
            className={cn("flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left", special === key ? "bg-primary/15" : "hover:bg-accent")}
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
            </span>
          </button>
        ))}
        <p className="px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cinemáticas</p>
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedId(c.id)}
            className={cn("flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left", selected?.id === c.id ? "bg-primary/15" : "hover:bg-accent")}
          >
            <Film className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{c.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {c.slides.length} diapositiva(s) · {usages(project, c.id)[0] ?? "no se usa todavía"}
              </span>
            </span>
          </button>
        ))}
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={create}>
          <Plus className="size-4" /> Nueva cinemática
        </Button>
      </aside>
      <section className="min-h-0 overflow-y-auto p-5">
        {special === "@title" ? (
          <TitleScreenEditor project={project} />
        ) : special === "@credits" ? (
          <CreditsEditor project={project} />
        ) : selected ? (
          <CinematicDetail key={selected.id} project={project} cinematic={selected} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="mx-auto max-w-md space-y-3 pt-10 text-center">
            <p className="text-sm text-muted-foreground">
              Una cinemática son diapositivas sobre negro: una imagen con un texto debajo, o un video. Sirven para la
              intro, los finales, los cambios de escena o un momento especial.
            </p>
            <Button onClick={create}>
              <Plus className="size-4" /> Crear la primera
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function CinematicDetail({ project, cinematic, onDeleted }: { project: GameProject; cinematic: Cinematic; onDeleted: () => void }) {
  const { mutate } = useGameStore()
  const [preview, setPreview] = useState(false)
  const id = cinematic.id
  const patch = (p: Partial<Cinematic>) => mutate((d) => ({ ...d, cinematics: (d.cinematics ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)) }))
  const setSlides = (slides: CinematicSlide[]) => patch({ slides })
  const slides = cinematic.slides
  const dialogsUsing = usages(project, id).filter((u) => u.startsWith("en el diálogo"))

  async function remove() {
    if (!(await confirmAction(`¿Eliminar «${cinematic.name}»? Donde se usaba, ya no se mostrará nada.`, { confirmLabel: "Eliminar", destructive: true }))) return
    mutate((d) => ({
      ...d,
      cinematics: (d.cinematics ?? []).filter((c) => c.id !== id),
      introCinematicId: d.introCinematicId === id ? null : d.introCinematicId,
      scenes: d.scenes.map((s) => (s.enterCinematicId === id ? { ...s, enterCinematicId: null } : s)),
    }))
    onDeleted()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Input value={cinematic.name} onChange={(e) => patch({ name: e.target.value })} className="h-9 text-base font-medium" aria-label="Nombre" />
        <Button onClick={() => setPreview(true)} disabled={!slides.length}>
          <Play className="size-4" /> Vista previa
        </Button>
        <Button variant="ghost" size="icon" className="text-destructive" title="Eliminar" onClick={remove}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* Where it plays */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-semibold">¿Cuándo se muestra?</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={project.introCinematicId === id}
            onChange={(e) => mutate((d) => ({ ...d, introCinematicId: e.target.checked ? id : d.introCinematicId === id ? null : d.introCinematicId }))}
          />
          Al empezar el juego (intro)
          {project.introCinematicId && project.introCinematicId !== id && (
            <span className="text-xs text-muted-foreground">— reemplaza a la intro actual</span>
          )}
        </label>
        <div className="space-y-1.5">
          <p className="text-sm">La primera vez que el jugador entra a:</p>
          <div className="flex flex-wrap gap-1.5">
            {project.scenes
              .filter((s) => !s.cutscene)
              .map((s) => {
                const on = s.enterCinematicId === id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      mutate((d) => ({ ...d, scenes: d.scenes.map((x) => (x.id === s.id ? { ...x, enterCinematicId: on ? null : id } : x)) }))
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    title={s.enterCinematicId && !on ? "Esa escena ya tiene otra cinemática: se reemplaza" : undefined}
                  >
                    {s.name}
                  </button>
                )
              })}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm">En un momento concreto (un final, un cambio de escena, una acción):</p>
          <p className="text-xs text-muted-foreground">
            En Diálogos, agrega el efecto «Mostrar cinemática» a una línea o a una opción. Se muestra al pasar esa línea;
            si la misma línea cambia de escena o termina el juego, la cinemática cubre el cambio.
          </p>
          {dialogsUsing.length > 0 && <p className="text-xs text-emerald-400">Ya se usa {dialogsUsing.join(", ")}.</p>}
        </div>
      </div>

      {/* Slides */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">Diapositivas</p>
        {slides.map((sl, i) => (
          <SlideCard
            key={sl.id}
            project={project}
            slide={sl}
            index={i}
            count={slides.length}
            onPatch={(p) => setSlides(slides.map((x) => (x.id === sl.id ? { ...x, ...p } : x)))}
            onMove={(to) => {
              const arr = [...slides]
              const [it] = arr.splice(i, 1)
              arr.splice(to, 0, it)
              setSlides(arr)
            }}
            onRemove={() => setSlides(slides.filter((x) => x.id !== sl.id))}
          />
        ))}
        <Button variant="outline" onClick={() => setSlides([...slides, { id: crypto.randomUUID(), text: "" }])}>
          <Plus className="size-4" /> Añadir diapositiva
        </Button>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-6" onClick={() => setPreview(false)}>
          <div className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-lg border border-border" onClick={(e) => e.stopPropagation()}>
            <CinematicPlayer cinematic={cinematic} project={project} onDone={() => setPreview(false)} />
          </div>
          <button type="button" className="absolute right-4 top-4 text-white/70 hover:text-white" onClick={() => setPreview(false)} title="Cerrar">
            <X className="size-5" />
          </button>
        </div>
      )}
    </div>
  )
}

function SlideCard({
  project,
  slide,
  index,
  count,
  onPatch,
  onMove,
  onRemove,
}: {
  project: GameProject
  slide: CinematicSlide
  index: number
  count: number
  onPatch: (p: Partial<CinematicSlide>) => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const { mutate } = useGameStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const images = project.assets.filter((a) => a.kind !== "video")
  const videos = project.assets.filter((a) => a.kind === "video")
  const video = slide.videoAssetId ? project.assets.find((a) => a.id === slide.videoAssetId) : undefined
  const image = slide.imageAssetId ? project.assets.find((a) => a.id === slide.imageAssetId) : undefined
  const mode = slide.videoAssetId ? "video" : "image"

  async function upload(file: File) {
    setBusy(true)
    try {
      const url = await readFile(file)
      const name = file.name.replace(/\.[^.]+$/, "")
      const asset = file.type.startsWith("video/") ? await videoAsset(url, name) : await dataUrlToAsset(url, "background", name)
      mutate((d) => ({ ...d, assets: [...d.assets, asset] }))
      onPatch(asset.kind === "video" ? { videoAssetId: asset.id, imageAssetId: null } : { imageAssetId: asset.id, videoAssetId: null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border border-border bg-card p-3 sm:grid-cols-[220px_1fr]">
      {/* What the player sees: black, the picture and the text under it (or the video) */}
      <div className="flex aspect-video flex-col items-center justify-center gap-1 overflow-hidden rounded bg-black p-2">
        {video ? (
          <video src={video.dataUrl} muted className="max-h-full max-w-full" />
        ) : (
          <>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.dataUrl} alt="" className="max-h-[62%] max-w-full object-contain" />
            )}
            {slide.text && <p className="line-clamp-2 text-center font-serif text-[9px] text-white/80">{slide.text}</p>}
            {!image && !slide.text && <p className="text-[11px] text-white/40">Vacía</p>}
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">Diapositiva {index + 1}</span>
          <div className="ml-auto flex">
            <Button size="icon" variant="ghost" className="size-7" disabled={index === 0} onClick={() => onMove(index - 1)} title="Subir">
              <ArrowUp className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" disabled={index === count - 1} onClick={() => onMove(index + 1)} title="Bajar">
              <ArrowDown className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={onRemove} title="Quitar">
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex rounded-md bg-muted p-0.5 text-xs">
          {(
            [
              ["image", "Imagen con texto"],
              ["video", "Video"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => onPatch(m === "video" ? { videoAssetId: videos[0]?.id ?? null } : { videoAssetId: null })}
              className={cn("flex-1 rounded px-2 py-1", mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "image" ? (
          <>
            <select value={slide.imageAssetId ?? ""} onChange={(e) => onPatch({ imageAssetId: e.target.value || null })} className={selectClass} aria-label="Imagen">
              <option value="">Sin imagen (solo texto)</option>
              {images.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Textarea value={slide.text ?? ""} onChange={(e) => onPatch({ text: e.target.value })} placeholder="El texto que se lee debajo de la imagen…" rows={3} className="text-sm" />
          </>
        ) : (
          <select value={slide.videoAssetId ?? ""} onChange={(e) => onPatch({ videoAssetId: e.target.value || null })} className={selectClass} aria-label="Video">
            {!videos.length && <option value="">Sube un video (MP4)</option>}
            {videos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> {busy ? "Subiendo…" : mode === "video" ? "Subir video" : "Subir imagen"}
          </Button>
          {mode === "image" && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Pasa sola a los
              <Input
                type="number"
                min={1}
                value={slide.seconds ?? ""}
                onChange={(e) => onPatch({ seconds: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
                placeholder="—"
                className="h-7 w-14 text-xs"
              />
              segundos (vacío: espera un clic)
            </label>
          )}
          {mode === "video" && <span className="text-xs text-muted-foreground">Pasa sola cuando termina el video.</span>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={mode === "video" ? "video/mp4" : "image/*"}
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (f) await upload(f)
          }}
        />
      </div>
    </div>
  )
}
