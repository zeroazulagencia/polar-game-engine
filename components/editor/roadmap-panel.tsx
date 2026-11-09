"use client"

import { useState } from "react"
import { Bug, Check, ClipboardCopy, ListChecks, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  trackerToMarkdown,
  type TrackerItem,
  type TrackerKind,
  type TrackerPriority,
  type TrackerStatus,
  type Tracker,
  useTracker,
} from "@/lib/tracker-store"
import { confirmAction } from "@/components/ui/confirm-host"

const STATUS_ORDER: TrackerStatus[] = ["doing", "todo", "done"]
const PRIORITY_ORDER: TrackerPriority[] = ["high", "medium", "low"]

const STATUS_STYLES: Record<TrackerStatus, string> = {
  todo: "border-border bg-secondary text-foreground",
  doing: "border-sky-500/40 bg-sky-500/15 text-sky-200",
  done: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
}

const PRIORITY_STYLES: Record<TrackerPriority, string> = {
  high: "border-red-500/40 bg-red-500/15 text-red-200",
  medium: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  low: "border-border bg-secondary text-muted-foreground",
}

const selectClass = "h-7 rounded-md border px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function RoadmapPanel() {
  const tracker = useTracker()
  const [tab, setTab] = useState<TrackerKind>("roadmap")
  const [copied, setCopied] = useState(false)
  const { items } = tracker

  const count = (kind: TrackerKind) => items.filter((it) => it.kind === kind && it.status !== "done").length

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(trackerToMarkdown(items))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.log("[v0] failed to copy tracker markdown:", err)
    }
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TrackerKind)} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <TabsList>
          <TabsTrigger value="roadmap">
            <ListChecks className="size-4" /> Roadmap
            <span className="text-muted-foreground">{count("roadmap")}</span>
          </TabsTrigger>
          <TabsTrigger value="bug">
            <Bug className="size-4" /> Bugs
            <span className="text-muted-foreground">{count("bug")}</span>
          </TabsTrigger>
        </TabsList>
        <Button size="sm" variant="ghost" onClick={copyMarkdown} title="Copiar todo como Markdown">
          {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
          {copied ? "Copiado" : "Markdown"}
        </Button>
      </div>

      {(["roadmap", "bug"] as const).map((kind) => (
        <TabsContent key={kind} value={kind} className="min-h-0 flex-1 overflow-auto p-4">
          <TrackerList kind={kind} tracker={tracker} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function TrackerList({ kind, tracker }: { kind: TrackerKind; tracker: Tracker }) {
  const { items, ready, addItem, updateItem, removeItem } = tracker
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<TrackerPriority>(kind === "bug" ? "high" : "medium")
  const [showDone, setShowDone] = useState(true)

  const rows = items
    .filter((it) => it.kind === kind && (showDone || it.status !== "done"))
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
        b.createdAt - a.createdAt,
    )
  const doneCount = items.filter((it) => it.kind === kind && it.status === "done").length

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    addItem(kind, t, priority)
    setTitle("")
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "bug" ? "Describe el bug…" : "Nueva mejora…"}
          className="h-8"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TrackerPriority)}
          className={cn(selectClass, "h-8 border-input bg-background")}
          aria-label="Prioridad"
        >
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={!title.trim()}>
          <Plus className="size-4" /> Agregar
        </Button>
      </form>

      {doneCount > 0 && (
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className="self-start text-xs text-muted-foreground hover:text-foreground"
        >
          {showDone ? "Ocultar" : "Mostrar"} {STATUS_LABELS[kind].done.toLowerCase()}s ({doneCount})
        </button>
      )}

      {!ready ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {kind === "bug" ? "Sin bugs abiertos." : "Sin elementos en el roadmap."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((it) => (
            <TrackerRow
              key={it.id}
              item={it}
              onChange={(patch) => updateItem(it.id, patch)}
              onRemove={() => removeItem(it.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function TrackerRow({
  item,
  onChange,
  onRemove,
}: {
  item: TrackerItem
  onChange: (patch: Partial<Pick<TrackerItem, "title" | "notes" | "status" | "priority">>) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(item.title)
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "")
  const done = item.status === "done"

  function save() {
    const t = titleDraft.trim()
    onChange({ title: t || item.title, notes: notesDraft.trim() || undefined })
    setEditing(false)
  }

  return (
    <li className={cn("group rounded-lg border border-border bg-card p-3", done && "opacity-60")}>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="h-8" autoFocus />
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Notas: pasos para reproducir, contexto…"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={save}>
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => {
              setTitleDraft(item.title)
              setNotesDraft(item.notes ?? "")
              setEditing(true)
            }}
            className="min-w-0 flex-1 text-left"
            title="Editar"
          >
            <p className={cn("text-sm text-foreground", done && "line-through")}>{item.title}</p>
            {item.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.notes}</p>}
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <select
              value={item.priority}
              onChange={(e) => onChange({ priority: e.target.value as TrackerPriority })}
              className={cn(selectClass, PRIORITY_STYLES[item.priority])}
              aria-label="Prioridad"
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
            <select
              value={item.status}
              onChange={(e) => onChange({ status: e.target.value as TrackerStatus })}
              className={cn(selectClass, STATUS_STYLES[item.status])}
              aria-label="Estado"
            >
              {(["todo", "doing", "done"] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[item.kind][s]}
                </option>
              ))}
            </select>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
              onClick={async () => {
                if (await confirmAction(`¿Eliminar «${item.title}»?`, { confirmLabel: "Eliminar", destructive: true })) onRemove()
              }}
              title="Eliminar"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
