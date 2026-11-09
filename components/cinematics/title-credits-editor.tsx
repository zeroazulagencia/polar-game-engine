"use client"

import { useRef, useState, type ReactNode } from "react"
import { Play, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useGameStore } from "@/lib/game-store"
import type { Credits, GameProject, TitleScreen } from "@/lib/game-types"
import { dataUrlToAsset } from "@/lib/image-utils"
import { TitleScreenView } from "@/components/editor/title-screen"
import { CreditsRoll } from "@/components/editor/credits-roll"

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm"

/** The game seen at 16:9 over the page, closed with a click outside or the cross. */
function PreviewFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-6" onClick={onClose}>
      <div className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-lg border border-border [container-type:size]" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <button type="button" className="absolute right-4 top-4 text-white/70 hover:text-white" onClick={onClose} title="Cerrar">
        <X className="size-5" />
      </button>
    </div>
  )
}

function MusicSelect({ project, value, onChange, none }: { project: GameProject; value?: string | null; onChange: (id: string | null) => void; none: string }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={selectClass} aria-label="Música">
      <option value="">{none}</option>
      {(project.sounds ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  )
}

export function TitleScreenEditor({ project }: { project: GameProject }) {
  const { mutate } = useGameStore()
  const [preview, setPreview] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const t = project.titleScreen
  const patch = (p: Partial<TitleScreen>) => mutate((d) => ({ ...d, titleScreen: { title: d.name, ...d.titleScreen, ...p } }))
  const images = project.assets.filter((a) => a.kind !== "video")

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-semibold">Pantalla de título</h2>
        <Button onClick={() => setPreview(true)} disabled={!t}>
          <Play className="size-4" /> Vista previa
        </Button>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={!!t}
          onChange={(e) => mutate((d) => ({ ...d, titleScreen: e.target.checked ? { title: d.name } : null }))}
        />
        <span>
          El juego empieza en una pantalla de título
          <span className="block text-xs text-muted-foreground">
            Con «Nueva partida», «Continuar» (si hay una partida guardada) y «Créditos». La intro se muestra al elegir
            «Nueva partida». Sin pantalla de título, el juego arranca directo en la primera escena.
          </span>
        </span>
      </label>

      {t && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Imagen de fondo</p>
            <div className="flex gap-2">
              <select value={t.backgroundAssetId ?? ""} onChange={(e) => patch({ backgroundAssetId: e.target.value || null })} className={selectClass} aria-label="Imagen de fondo">
                <option value="">Negro</option>
                {images.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> Subir
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                if (!f) return
                const r = new FileReader()
                r.onload = async () => {
                  const asset = await dataUrlToAsset(r.result as string, "background", f.name.replace(/\.[^.]+$/, ""))
                  mutate((d) => ({ ...d, assets: [...d.assets, asset], titleScreen: { title: d.name, ...d.titleScreen, backgroundAssetId: asset.id } }))
                }
                r.readAsDataURL(f)
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Título</p>
              <Input value={t.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Vacío si la imagen ya trae el título" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Subtítulo</p>
              <Input value={t.subtitle ?? ""} onChange={(e) => patch({ subtitle: e.target.value || undefined })} placeholder="Opcional" />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Música</p>
            <MusicSelect project={project} value={t.musicTrackId} onChange={(musicTrackId) => patch({ musicTrackId })} none="Sin música" />
          </div>
        </div>
      )}

      {preview && t && (
        <PreviewFrame onClose={() => setPreview(false)}>
          <TitleScreenView project={project} canContinue onNew={() => setPreview(false)} onContinue={() => setPreview(false)} onCredits={() => setPreview(false)} />
        </PreviewFrame>
      )}
    </div>
  )
}

export function CreditsEditor({ project }: { project: GameProject }) {
  const { mutate } = useGameStore()
  const [preview, setPreview] = useState(false)
  const c = project.credits
  const patch = (p: Partial<Credits>) => mutate((d) => ({ ...d, credits: { text: "", ...d.credits, ...p } }))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-semibold">Créditos y pantalla final</h2>
        <Button onClick={() => setPreview(true)} disabled={!c?.text.trim()}>
          <Play className="size-4" /> Vista previa
        </Button>
      </div>

      <div className="space-y-1.5 rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">Título de la pantalla final</p>
        <Input value={project.endTitle ?? ""} onChange={(e) => mutate((d) => ({ ...d, endTitle: e.target.value || undefined }))} placeholder="🎉 ¡Juego completado!" />
        <p className="text-xs text-muted-foreground">
          Se muestra cuando termina el juego, con el texto del final debajo. Desde ahí el jugador puede ver los créditos.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Créditos</p>
          <p className="text-xs text-muted-foreground">
            Un nombre por línea. Una línea que empieza con «# » es un encabezado (# Guion, # Música). Una línea vacía deja
            un espacio. Suben solos sobre negro; un clic los termina.
          </p>
        </div>
        <Textarea value={c?.text ?? ""} onChange={(e) => patch({ text: e.target.value })} rows={14} className="font-mono text-sm" placeholder={"# Una aventura de\nTu nombre\n\n# Guion\n…"} />
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Música</p>
          <MusicSelect project={project} value={c?.musicTrackId} onChange={(musicTrackId) => patch({ musicTrackId })} none="La de la escena donde terminó" />
        </div>
      </div>

      {preview && (
        <PreviewFrame onClose={() => setPreview(false)}>
          <CreditsRoll project={project} onDone={() => setPreview(false)} />
        </PreviewFrame>
      )}
    </div>
  )
}
