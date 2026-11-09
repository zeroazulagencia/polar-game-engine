"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, GitBranch, MessageSquare, Plus, Search, Trash2, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useGameStore } from "@/lib/game-store"
import {
  collectFlags,
  type Dialog,
  type DialogChoice,
  type DialogLine,
  type DialogNext,
  type GameProject,
} from "@/lib/game-types"
import { cn } from "@/lib/utils"
import { EffectsEditor, selectClass } from "./effects-editor"
import { AiEditButton, VersionsPanel } from "./dialog-versions"
import { DIALOG_PRESETS, PRESET_PREFIX } from "@/lib/dialog-style"
import { PLAYER_SPEAKER, protagonistName } from "@/lib/protagonist"
import { confirmAction } from "@/components/ui/confirm-host"

const FLAG_LIST_ID = "dialog-flag-list"

export function DialogEditor() {
  const { project, mutate } = useGameStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  // Deep link: /dialogs?d=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("d")
    if (id) setSelectedId(id)
  }, [])

  const dialogs = project?.dialogs ?? []
  const selected = dialogs.find((d) => d.id === selectedId) ?? dialogs[0] ?? null
  const flags = useMemo(() => (project ? collectFlags(project) : []), [project])
  const visible = dialogs.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()))

  if (!project) return null

  function select(id: string) {
    setSelectedId(id)
    window.history.replaceState(null, "", `?d=${id}`)
  }

  function addDialog() {
    const dialog: Dialog = {
      id: crypto.randomUUID(),
      name: `Diálogo ${dialogs.length + 1}`,
      lines: [{ id: crypto.randomUUID(), speaker: "Narrador", text: "" }],
    }
    mutate((d) => ({ ...d, dialogs: [...d.dialogs, dialog] }))
    select(dialog.id)
  }

  function updateDialog(id: string, fn: (d: Dialog) => Dialog) {
    mutate((p) => ({ ...p, dialogs: p.dialogs.map((d) => (d.id === id ? fn(d) : d)) }))
  }

  async function deleteDialog(id: string) {
    const dl = dialogs.find((d) => d.id === id)
    if (!dl || !(await confirmAction(`¿Eliminar el diálogo «${dl.name}»?`, { confirmLabel: "Eliminar", destructive: true }))) return
    mutate((p) => ({ ...p, dialogs: p.dialogs.filter((d) => d.id !== id) }))
    setSelectedId(null)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[260px_1fr]">
      <datalist id={FLAG_LIST_ID}>
        {flags.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      {/* Dialog list */}
      <aside className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
        <div className="flex shrink-0 items-center gap-2 p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="h-8 pl-7 text-sm"
            />
          </div>
          <Button size="icon" className="size-8 shrink-0" onClick={addDialog} title="Nuevo diálogo">
            <Plus className="size-4" />
          </Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {visible.map((d) => {
            const branches = d.lines.filter((l) => (l.choices?.length ?? 0) > 0).length
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => select(d.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    selected?.id === d.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <MessageSquare className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {d.lines.length}
                    {branches > 0 && (
                      <>
                        {" · "}
                        <GitBranch className="inline size-3" />
                        {branches}
                      </>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
          {dialogs.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">Todavía no hay diálogos.</li>
          )}
        </ul>
      </aside>

      {/* Selected dialog */}
      <section className="min-h-0 overflow-y-auto">
        {selected ? (
          <DialogBody
            key={selected.id}
            project={project}
            dialog={selected}
            onChange={(fn) => updateDialog(selected.id, fn)}
            onDelete={() => deleteDialog(selected.id)}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
            <div className="space-y-3">
              <MessageSquare className="mx-auto size-6" />
              <p>Crea un diálogo para empezar.</p>
              <Button size="sm" onClick={addDialog}>
                <Plus className="size-4" /> Nuevo diálogo
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function DialogBody({
  project,
  dialog,
  onChange,
  onDelete,
}: {
  project: GameProject
  dialog: Dialog
  onChange: (fn: (d: Dialog) => Dialog) => void
  onDelete: () => void
}) {
  const setLines = (fn: (lines: DialogLine[]) => DialogLine[]) => onChange((d) => ({ ...d, lines: fn(d.lines) }))
  const updateLine = (id: string, patch: Partial<DialogLine>) =>
    setLines((lines) => lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  function addLine() {
    setLines((lines) => [...lines, { id: crypto.randomUUID(), speaker: lines.at(-1)?.speaker ?? "", text: "" }])
  }

  function removeLine(id: string) {
    // Jumps that pointed at the removed line now end the dialog.
    const fix = (n: DialogNext | null | undefined) => (n === id ? "end" : n)
    setLines((lines) =>
      lines
        .filter((l) => l.id !== id)
        .map((l) => ({ ...l, next: fix(l.next), choices: l.choices?.map((c) => ({ ...c, next: fix(c.next) })) })),
    )
  }

  function moveLine(idx: number, dir: -1 | 1) {
    setLines((lines) => {
      const to = idx + dir
      if (to < 0 || to >= lines.length) return lines
      const next = [...lines]
      ;[next[idx], next[to]] = [next[to], next[idx]]
      return next
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Input
          value={dialog.name}
          onChange={(e) => onChange((d) => ({ ...d, name: e.target.value }))}
          className="h-9 text-base font-semibold"
          aria-label="Nombre del diálogo"
        />
        <Button size="icon" variant="ghost" className="size-9 shrink-0 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Eliminar diálogo">
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">Estilo del cuadro:</span>
        <select
          value={dialog.styleId ?? ""}
          onChange={(e) => onChange((d) => ({ ...d, styleId: e.target.value || null }))}
          className={`${selectClass} min-w-0 flex-1`}
          aria-label="Estilo del cuadro de diálogo"
        >
          <option value="">Predeterminado del proyecto</option>
          <optgroup label="Predefinidos">
            {DIALOG_PRESETS.map((p) => (
              <option key={p.id} value={PRESET_PREFIX + p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {(project.dialogStyles ?? []).length > 0 && (
            <optgroup label="Mis estilos">
              {project.dialogStyles!.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <VersionsPanel dialog={dialog} onChange={onChange} />
        </div>
        <AiEditButton project={project} dialog={dialog} onChange={onChange} />
      </div>

      <p className="text-xs text-muted-foreground">
        Las líneas se muestran en orden. Agrega <strong>opciones</strong> a una línea para que el jugador elija; cada
        opción puede requerir una variable u objeto, aplicar efectos y saltar a otra línea.
      </p>

      <ol className="space-y-3">
        {dialog.lines.map((line, idx) => (
          <LineCard
            key={line.id}
            project={project}
            dialog={dialog}
            line={line}
            idx={idx}
            onPatch={(patch) => updateLine(line.id, patch)}
            onRemove={() => removeLine(line.id)}
            onMove={(dir) => moveLine(idx, dir)}
          />
        ))}
      </ol>

      <Button variant="outline" className="w-full" onClick={addLine}>
        <Plus className="size-4" /> Agregar línea
      </Button>
    </div>
  )
}

function lineLabel(line: DialogLine, idx: number) {
  const text = line.text.trim() || "(sin texto)"
  const who = line.speaker === PLAYER_SPEAKER ? "Protagonista" : line.speaker
  return `#${idx + 1} ${who ? `${who}: ` : ""}${text.length > 40 ? `${text.slice(0, 40)}…` : text}`
}

function NextSelect({
  dialog,
  value,
  onChange,
  defaultLabel,
  excludeId,
}: {
  dialog: Dialog
  value: DialogNext | null | undefined
  onChange: (v: DialogNext | null) => void
  defaultLabel: string
  excludeId?: string
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      className={`${selectClass} min-w-0 flex-1`}
      aria-label="Ir a"
    >
      <option value="">{defaultLabel}</option>
      <option value="end">Terminar diálogo</option>
      {dialog.lines.map((l, i) =>
        l.id === excludeId ? null : (
          <option key={l.id} value={l.id}>
            {lineLabel(l, i)}
          </option>
        ),
      )}
    </select>
  )
}

type ConditionMode = "always" | "flag" | "noflag" | "item" | "noitem"

/** "Show this line only if…": a flag on/off or an item present/missing; otherwise it is skipped. */
function LineConditionRow({
  project,
  line,
  onPatch,
}: {
  project: GameProject
  line: DialogLine
  onPatch: (patch: Partial<DialogLine>) => void
}) {
  const c = line.showIf
  const mode: ConditionMode = !c ? "always" : c.kind === "flag" ? (c.negate ? "noflag" : "flag") : c.negate ? "noitem" : "item"
  const setMode = (m: ConditionMode) => {
    if (m === "always") return onPatch({ showIf: null })
    const kind = m === "flag" || m === "noflag" ? "flag" : "item"
    const id = c?.kind === kind ? c.id : kind === "item" ? (project.items[0]?.id ?? "") : ""
    onPatch({ showIf: { kind, id, negate: m === "noflag" || m === "noitem" } })
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Mostrar</span>
      <select value={mode} onChange={(e) => setMode(e.target.value as ConditionMode)} className={`${selectClass} w-44`}>
        <option value="always">siempre</option>
        <option value="flag">si la variable está activa</option>
        <option value="noflag">si la variable NO está activa</option>
        <option value="item">si tiene el objeto</option>
        <option value="noitem">si NO tiene el objeto</option>
      </select>
      {c?.kind === "flag" && (
        <Input
          value={c.id}
          list={FLAG_LIST_ID}
          onChange={(e) => onPatch({ showIf: { ...c, id: e.target.value.replace(/\s+/g, "_") } })}
          placeholder="nombre_variable"
          className="h-7 w-48 text-xs"
        />
      )}
      {c?.kind === "item" && (
        <select value={c.id} onChange={(e) => onPatch({ showIf: { ...c, id: e.target.value } })} className={`${selectClass} w-48`}>
          {project.items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
            </option>
          ))}
        </select>
      )}
      {c && <span className="text-muted-foreground">(si no, se salta esta línea)</span>}
    </div>
  )
}

function LineCard({
  project,
  dialog,
  line,
  idx,
  onPatch,
  onRemove,
  onMove,
}: {
  project: GameProject
  dialog: Dialog
  line: DialogLine
  idx: number
  onPatch: (patch: Partial<DialogLine>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const choices = line.choices ?? []
  const [showEffects, setShowEffects] = useState((line.effects?.length ?? 0) > 0)
  const isLast = idx === dialog.lines.length - 1

  const updateChoice = (id: string, patch: Partial<DialogChoice>) =>
    onPatch({ choices: choices.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  return (
    <li className="rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3 p-3">
        <span className="mt-1.5 w-7 shrink-0 text-right font-mono text-xs text-muted-foreground">#{idx + 1}</span>
        <div className="min-w-0 flex-1 space-y-2">
          {line.speaker === PLAYER_SPEAKER ? (
            <button
              type="button"
              onClick={() => onPatch({ speaker: "" })}
              title="Es el protagonista: su nombre se edita en Personaje. Clic para escribir otro nombre."
              className="flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 text-sm font-medium"
            >
              <User className="size-3.5 text-primary" />
              {protagonistName(project)}
              <span className="text-xs font-normal text-muted-foreground">· protagonista</span>
              <X className="size-3 text-muted-foreground" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Input
                value={line.speaker}
                onChange={(e) => onPatch({ speaker: e.target.value })}
                placeholder="Quién habla"
                className="h-8 w-56 text-sm font-medium"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs text-muted-foreground"
                title="Lo dice el protagonista (su nombre viene de Personaje)"
                onClick={() => onPatch({ speaker: PLAYER_SPEAKER })}
              >
                <User className="size-3.5" /> Protagonista
              </Button>
            </div>
          )}
          <Textarea
            value={line.text}
            onChange={(e) => onPatch({ text: e.target.value })}
            placeholder="Texto de la línea… (usa {protagonista} para su nombre)"
            rows={2}
            className="resize-y text-sm"
          />
        </div>
        <div className="flex shrink-0 flex-col gap-0.5">
          <IconBtn title="Subir" onClick={() => onMove(-1)} disabled={idx === 0}>
            <ArrowUp className="size-3.5" />
          </IconBtn>
          <IconBtn title="Bajar" onClick={() => onMove(1)} disabled={isLast}>
            <ArrowDown className="size-3.5" />
          </IconBtn>
          <IconBtn title="Eliminar línea" onClick={onRemove} danger>
            <Trash2 className="size-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/60 px-3 py-2.5 pl-[3.25rem]">
        <LineConditionRow project={project} line={line} onPatch={onPatch} />

        {/* Effects when the line is shown */}
        {showEffects ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Al mostrar esta línea</p>
            <EffectsEditor
              project={project}
              effects={line.effects}
              onChange={(effects) => onPatch({ effects })}
              flagListId={FLAG_LIST_ID}
            />
          </div>
        ) : null}

        {/* Choices or plain continuation */}
        {choices.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Opciones del jugador</p>
            {choices.map((c, ci) => (
              <ChoiceRow
                key={c.id}
                project={project}
                dialog={dialog}
                choice={c}
                index={ci}
                onPatch={(patch) => updateChoice(c.id, patch)}
                onRemove={() => onPatch({ choices: choices.filter((x) => x.id !== c.id) })}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">Después:</span>
            <NextSelect
              dialog={dialog}
              value={line.next}
              onChange={(next) => onPatch({ next })}
              defaultLabel={isLast ? "Terminar diálogo (última línea)" : "Siguiente línea"}
              excludeId={line.id}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              onPatch({
                choices: [...choices, { id: crypto.randomUUID(), text: "", next: isLast ? "end" : null }],
              })
            }
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <GitBranch className="size-3.5" /> Agregar opción
          </button>
          {!showEffects && (
            <button
              type="button"
              onClick={() => setShowEffects(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" /> Efecto al mostrar
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function ChoiceRow({
  project,
  dialog,
  choice,
  index,
  onPatch,
  onRemove,
}: {
  project: GameProject
  dialog: Dialog
  choice: DialogChoice
  index: number
  onPatch: (patch: Partial<DialogChoice>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(
    !!choice.requiresFlag ||
      !!choice.requiresItem ||
      !!choice.requiresScene ||
      !!choice.hideInScene ||
      (choice.effects?.length ?? 0) > 0,
  )
  return (
    <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-2">
      <div className="flex items-center gap-2">
        <span className="w-4 shrink-0 text-xs text-amber-200/70">{index + 1}.</span>
        <Input
          value={choice.text}
          onChange={(e) => onPatch({ text: e.target.value })}
          placeholder="Lo que dice el jugador…"
          className="h-8 min-w-0 flex-1 text-sm"
        />
        <span className="shrink-0 text-xs text-muted-foreground">→</span>
        <div className="flex w-56 shrink-0">
          <NextSelect
            dialog={dialog}
            value={choice.next ?? "end"}
            onChange={(next) => onPatch({ next: next ?? "end" })}
            defaultLabel="Terminar diálogo"
          />
        </div>
        <IconBtn title="Quitar opción" onClick={onRemove} danger>
          <X className="size-3.5" />
        </IconBtn>
      </div>

      {open ? (
        <div className="mt-2 space-y-2 pl-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Solo si</span>
            <Input
              value={choice.requiresFlag ?? ""}
              list={FLAG_LIST_ID}
              onChange={(e) => onPatch({ requiresFlag: e.target.value.replace(/\s+/g, "_") || null })}
              placeholder="variable activa"
              className="h-7 w-40 font-mono text-xs"
            />
            <span className="text-muted-foreground">y tiene</span>
            <select
              value={choice.requiresItem ?? ""}
              onChange={(e) => onPatch({ requiresItem: e.target.value || null })}
              className={`${selectClass} h-7 w-40`}
              aria-label="Objeto requerido"
            >
              <option value="">(cualquier inventario)</option>
              {project.items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">en</span>
            <select
              value={choice.requiresScene ?? ""}
              onChange={(e) => onPatch({ requiresScene: e.target.value || null })}
              className={`${selectClass} h-7 w-40`}
              aria-label="Solo en la escena"
            >
              <option value="">(cualquier escena)</option>
              {project.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">salvo en</span>
            <select
              value={choice.hideInScene ?? ""}
              onChange={(e) => onPatch({ hideInScene: e.target.value || null })}
              className={`${selectClass} h-7 w-40`}
              aria-label="Oculta en la escena"
            >
              <option value="">(ninguna)</option>
              {project.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <Checkbox checked={!!choice.once} onCheckedChange={(v) => onPatch({ once: v === true })} />
              Una sola vez
            </label>
          </div>
          <EffectsEditor
            project={project}
            effects={choice.effects}
            onChange={(effects) => onPatch({ effects })}
            flagListId={FLAG_LIST_ID}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 pl-6 text-xs text-muted-foreground hover:text-foreground"
        >
          + Condiciones y efectos
        </button>
      )}
    </div>
  )
}

function IconBtn({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-30",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
