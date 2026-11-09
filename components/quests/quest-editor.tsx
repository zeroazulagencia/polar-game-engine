"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Plus, Search, Target, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useGameStore } from "@/lib/game-store"
import { collectFlags, type GameProject, type Quest, type QuestCondition, type QuestStep } from "@/lib/game-types"
import { cn } from "@/lib/utils"
import { EffectsEditor, selectClass } from "@/components/dialogs/effects-editor"
import { confirmAction } from "@/components/ui/confirm-host"

const FLAG_LIST_ID = "quest-flag-list"

export function QuestEditor() {
  const { project, mutate } = useGameStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("q")
    if (id) setSelectedId(id)
  }, [])

  const quests = project?.quests ?? []
  const selected = quests.find((q) => q.id === selectedId) ?? quests[0] ?? null
  const flags = useMemo(() => (project ? collectFlags(project) : []), [project])
  const visible = quests.filter((q) => q.title.toLowerCase().includes(query.trim().toLowerCase()))

  if (!project) return null

  function select(id: string) {
    setSelectedId(id)
    window.history.replaceState(null, "", `?q=${id}`)
  }

  function setQuests(fn: (q: Quest[]) => Quest[]) {
    mutate((p) => ({ ...p, quests: fn(p.quests ?? []) }))
  }

  function addQuest() {
    const quest: Quest = {
      id: crypto.randomUUID(),
      title: `Objetivo ${quests.length + 1}`,
      steps: [{ id: crypto.randomUUID(), text: "", when: { type: "flag", flag: "" } }],
    }
    setQuests((q) => [...q, quest])
    select(quest.id)
  }

  async function deleteQuest(id: string) {
    const q = quests.find((x) => x.id === id)
    if (!q || !(await confirmAction(`¿Eliminar el objetivo «${q.title}»?`, { confirmLabel: "Eliminar", destructive: true }))) return
    setQuests((list) => list.filter((x) => x.id !== id))
    setSelectedId(null)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[260px_1fr]">
      <datalist id={FLAG_LIST_ID}>
        {flags.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <aside className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
        <div className="flex shrink-0 items-center gap-2 p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="h-8 pl-7 text-sm" />
          </div>
          <Button size="icon" className="size-8 shrink-0" onClick={addQuest} title="Nuevo objetivo">
            <Plus className="size-4" />
          </Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {visible.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => select(q.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  selected?.id === q.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                <Target className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{q.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground/70">{q.steps.length}</span>
              </button>
            </li>
          ))}
          {quests.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">Todavía no hay objetivos.</li>
          )}
        </ul>
      </aside>

      <section className="min-h-0 overflow-y-auto">
        {selected ? (
          <QuestBody
            key={selected.id}
            project={project}
            quest={selected}
            onChange={(fn) => setQuests((list) => list.map((q) => (q.id === selected.id ? fn(q) : q)))}
            onDelete={() => deleteQuest(selected.id)}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
            <div className="space-y-3">
              <Target className="mx-auto size-6" />
              <p>Los objetivos guían al jugador y se completan solos según lo que hace en el juego.</p>
              <Button size="sm" onClick={addQuest}>
                <Plus className="size-4" /> Nuevo objetivo
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function QuestBody({
  project,
  quest,
  onChange,
  onDelete,
}: {
  project: GameProject
  quest: Quest
  onChange: (fn: (q: Quest) => Quest) => void
  onDelete: () => void
}) {
  const patch = (p: Partial<Quest>) => onChange((q) => ({ ...q, ...p }))
  const setSteps = (fn: (s: QuestStep[]) => QuestStep[]) => onChange((q) => ({ ...q, steps: fn(q.steps) }))

  function moveStep(idx: number, dir: -1 | 1) {
    setSteps((steps) => {
      const to = idx + dir
      if (to < 0 || to >= steps.length) return steps
      const next = [...steps]
      ;[next[idx], next[to]] = [next[to], next[idx]]
      return next
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={quest.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="h-9 text-base font-semibold"
            aria-label="Título del objetivo"
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="Eliminar objetivo"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <Textarea
          value={quest.description ?? ""}
          onChange={(e) => patch({ description: e.target.value || undefined })}
          placeholder="Descripción que verá el jugador en su diario (opcional)"
          rows={2}
          className="text-sm"
        />
      </div>

      <Section title="Cuándo empieza">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={quest.startFlag == null ? "always" : "flag"}
            onChange={(e) => patch({ startFlag: e.target.value === "always" ? null : "" })}
            className={selectClass}
            aria-label="Inicio"
          >
            <option value="always">Desde el inicio del juego</option>
            <option value="flag">Cuando se active una variable</option>
          </select>
          {quest.startFlag != null && (
            <Input
              value={quest.startFlag}
              list={FLAG_LIST_ID}
              onChange={(e) => patch({ startFlag: e.target.value.replace(/\s+/g, "_") })}
              placeholder="nombre_variable"
              className="h-8 w-56 font-mono text-xs"
            />
          )}
        </div>
      </Section>

      <Section title="Pasos" hint="Cada paso se marca solo cuando se cumple su condición, en cualquier orden.">
        <ol className="space-y-2">
          {quest.steps.map((st, idx) => (
            <li key={st.id} className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5">
              <span className="mt-2 w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{idx + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={st.text}
                  onChange={(e) => setSteps((s) => s.map((x) => (x.id === st.id ? { ...x, text: e.target.value } : x)))}
                  placeholder="Lo que verá el jugador, ej. «Encuentra una fuente de luz»"
                  className="h-8 text-sm"
                />
                <ConditionEditor
                  project={project}
                  value={st.when}
                  onChange={(when) => setSteps((s) => s.map((x) => (x.id === st.id ? { ...x, when } : x)))}
                />
              </div>
              <div className="flex shrink-0 flex-col">
                <SmallBtn title="Subir" onClick={() => moveStep(idx, -1)} disabled={idx === 0}>
                  <ArrowUp className="size-3.5" />
                </SmallBtn>
                <SmallBtn title="Bajar" onClick={() => moveStep(idx, 1)} disabled={idx === quest.steps.length - 1}>
                  <ArrowDown className="size-3.5" />
                </SmallBtn>
                <SmallBtn title="Eliminar paso" onClick={() => setSteps((s) => s.filter((x) => x.id !== st.id))} danger>
                  <Trash2 className="size-3.5" />
                </SmallBtn>
              </div>
            </li>
          ))}
        </ol>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setSteps((s) => [...s, { id: crypto.randomUUID(), text: "", when: { type: "flag", flag: "" } }])}
        >
          <Plus className="size-4" /> Agregar paso
        </Button>
      </Section>

      <Section title="Recompensa al completarlo" hint="Opcional. Se aplica una sola vez.">
        <EffectsEditor
          project={project}
          effects={quest.rewards}
          onChange={(rewards) => patch({ rewards })}
          flagListId={FLAG_LIST_ID}
        />
      </Section>
    </div>
  )
}

function ConditionEditor({
  project,
  value,
  onChange,
}: {
  project: GameProject
  value: QuestCondition
  onChange: (c: QuestCondition) => void
}) {
  function changeType(type: QuestCondition["type"]) {
    if (type === "flag") onChange({ type, flag: "" })
    if (type === "item") onChange({ type, itemId: project.items[0]?.id ?? "" })
    if (type === "scene") onChange({ type, sceneId: project.scenes[0]?.id ?? "" })
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">Se cumple cuando</span>
      <select
        value={value.type}
        onChange={(e) => changeType(e.target.value as QuestCondition["type"])}
        className={`${selectClass} w-44 shrink-0`}
        aria-label="Tipo de condición"
      >
        <option value="flag">la variable está activa</option>
        <option value="item">tiene el objeto</option>
        <option value="scene">visitó la escena</option>
      </select>
      {value.type === "flag" && (
        <Input
          value={value.flag}
          list={FLAG_LIST_ID}
          onChange={(e) => onChange({ type: "flag", flag: e.target.value.replace(/\s+/g, "_") })}
          placeholder="nombre_variable"
          className="h-8 min-w-0 flex-1 font-mono text-xs"
        />
      )}
      {value.type === "item" && (
        <select
          value={value.itemId}
          onChange={(e) => onChange({ type: "item", itemId: e.target.value })}
          className={`${selectClass} min-w-0 flex-1`}
          aria-label="Objeto"
        >
          {project.items.length === 0 && <option value="">(sin objetos en el proyecto)</option>}
          {project.items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
            </option>
          ))}
        </select>
      )}
      {value.type === "scene" && (
        <select
          value={value.sceneId}
          onChange={(e) => onChange({ type: "scene", sceneId: e.target.value })}
          className={`${selectClass} min-w-0 flex-1`}
          aria-label="Escena"
        >
          {project.scenes.map((sc) => (
            <option key={sc.id} value={sc.id}>
              {sc.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function SmallBtn({
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
        "grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-30",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
