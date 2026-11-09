"use client"

import { useState } from "react"
import { Check, ChevronDown, Copy, History, Loader2, Sparkles, Trash2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog as Modal,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Dialog, DialogLine, DialogVersion, GameProject } from "@/lib/game-types"
import { activateVersion, activeMeta, addVersion, deleteVersion } from "@/lib/dialog-versions"
import { generateDialogVersion } from "@/lib/ai-dialog"
import { PLAYER_SPEAKER } from "@/lib/protagonist"
import { cn } from "@/lib/utils"
import { confirmAction } from "@/components/ui/confirm-host"


const PROMPT_IDEAS = [
  "Hazlo más misterioso y breve",
  "Agrega una opción para intentar sobornar al personaje",
  "Dale más humor al diálogo",
  "Tradúcelo al inglés",
]

const dateFmt = new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" })

type Change = (fn: (d: Dialog) => Dialog) => void

/** "Editar con IA" button + modal: the current dialog is sent as context, the answer is saved as a new version. */
export function AiEditButton({ project, dialog, onChange }: { project: GameProject; dialog: Dialog; onChange: Change }) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ version: DialogVersion; summary?: string; dropped: string[] } | null>(null)

  function reset() {
    setPrompt("")
    setError(null)
    setResult(null)
  }

  async function generate() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const out = await generateDialogVersion({ project, dialog, prompt })
      const label = `IA: ${prompt.trim().slice(0, 40)}${prompt.trim().length > 40 ? "…" : ""}`
      // Built here (not inside the store updater, which React runs later) so we can show it right away.
      const version: DialogVersion = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        label,
        source: "ai",
        prompt: prompt.trim(),
        lines: out.lines,
      }
      onChange((d) => ({ ...d, versions: [version, ...(d.versions ?? []).filter((v) => v.id !== version.id)] }))
      setResult({ version, summary: out.summary, dropped: out.dropped })
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la versión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        <Sparkles className="size-4" /> Editar con IA
      </Button>

      <Modal open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar «{dialog.name}» con IA</DialogTitle>
            <DialogDescription>
              Se envía el diálogo actual (líneas, opciones, condiciones y efectos) junto con los objetos, escenas y
              variables del proyecto. El resultado se guarda como una <strong>nueva versión inactiva</strong>: la
              actual no cambia hasta que la actives.
            </DialogDescription>
          </DialogHeader>

          {!result ? (
            <div className="space-y-3">
              <Textarea
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate()
                }}
                placeholder="¿Qué quieres cambiar? Ej.: «Que el guardián sea más desconfiado y que pida la llave dorada antes de dejar pasar»"
                rows={4}
                disabled={loading}
              />
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    disabled={loading}
                    onClick={() => setPrompt(idea)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {idea}
                  </button>
                ))}
              </div>
              {error && <p className="break-words text-sm text-destructive">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {result.summary && <p className="text-sm">{result.summary}</p>}
              <LinesPreview lines={result.version.lines} />
              {result.dropped.length > 0 && (
                <p className="text-xs text-amber-300">
                  Se descartaron {result.dropped.length} referencia(s) inválida(s) que inventó la IA:{" "}
                  {result.dropped.slice(0, 4).join(", ")}
                  {result.dropped.length > 4 ? "…" : ""}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            {!result ? (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button onClick={generate} disabled={!prompt.trim() || loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {loading ? "Generando…" : "Generar versión"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={reset}>
                  Probar otra instrucción
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Dejarla inactiva
                </Button>
                <Button
                  onClick={() => {
                    onChange((d) => activateVersion(d, result.version.id))
                    setOpen(false)
                  }}
                >
                  <Check className="size-4" /> Activar esta versión
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Modal>
    </>
  )
}

/** Active + inactive versions of a dialog, with activate / preview / delete. */
export function VersionsPanel({ dialog, onChange }: { dialog: Dialog; onChange: Change }) {
  const [open, setOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const active = activeMeta(dialog)
  const inactive = dialog.versions ?? []

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <History className="size-4 text-muted-foreground" />
        <span className="font-medium">Versiones</span>
        <span className="text-xs text-muted-foreground">
          activa: {active.label} · {inactive.length} inactiva{inactive.length === 1 ? "" : "s"}
        </span>
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-border p-2">
          <VersionRow label={active.label} source={active.source} createdAt={active.createdAt} prompt={active.prompt} isActive>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              title="Guarda una copia de la versión activa para poder volver a ella"
              onClick={() =>
                onChange((d) => addVersion(d, d.lines, { label: `Copia de ${activeMeta(d).label}`, source: "manual" }).dialog)
              }
            >
              <Copy className="size-3.5" /> Guardar copia
            </Button>
          </VersionRow>

          {inactive.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No hay versiones inactivas. Usa «Editar con IA» o «Guardar copia».
            </p>
          )}
          {inactive.map((v) => (
            <div key={v.id}>
              <VersionRow label={v.label} source={v.source} createdAt={v.createdAt} prompt={v.prompt}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setPreviewId((p) => (p === v.id ? null : v.id))}
                >
                  {previewId === v.id ? "Ocultar" : "Ver"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange((d) => activateVersion(d, v.id))}>
                  Activar
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  title="Eliminar versión"
                  onClick={async () => {
                    if (await confirmAction(`¿Eliminar la versión «${v.label}»?`, { confirmLabel: "Eliminar", destructive: true }))
                      onChange((d) => deleteVersion(d, v.id))
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </VersionRow>
              {previewId === v.id && (
                <div className="mx-2 mb-2">
                  <LinesPreview lines={v.lines} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function VersionRow({
  label,
  source,
  createdAt,
  prompt,
  isActive,
  children,
}: {
  label: string
  source: "manual" | "ai"
  createdAt: number
  prompt?: string
  isActive?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", isActive ? "bg-primary/10" : "hover:bg-accent/50")}>
      {source === "ai" ? (
        <Sparkles className="size-3.5 shrink-0 text-amber-300" />
      ) : (
        <User className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={prompt ?? label}>
          {label}
          {isActive && (
            <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
              Activa
            </span>
          )}
        </p>
        {createdAt > 0 && <p className="text-[11px] text-muted-foreground">{dateFmt.format(createdAt)}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  )
}

function LinesPreview({ lines }: { lines: DialogLine[] }) {
  return (
    <ol className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border bg-background p-3 text-sm">
      {lines.map((l, i) => (
        <li key={l.id}>
          <span className="mr-2 font-mono text-xs text-muted-foreground">#{i + 1}</span>
          {l.speaker && <span className="font-medium">{l.speaker === PLAYER_SPEAKER ? "Protagonista" : l.speaker}: </span>}
          <span>{l.text}</span>
          {(l.choices ?? []).length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-7">
              {l.choices!.map((c) => (
                <li key={c.id} className="text-amber-200/90">
                  → {c.text}
                  {c.requiresFlag && <span className="ml-1 font-mono text-[11px] text-muted-foreground">[si {c.requiresFlag}]</span>}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}
