"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  ImageOff,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ViewHeader } from "@/components/app-shell/view-header"
import { ExportGameSubmenu } from "@/components/app-shell/export-game-menu"
import { useProjectActions } from "@/components/app-shell/project-actions"
import { useGameStore } from "@/lib/game-store"
import type { GameProject } from "@/lib/game-types"
import { exportProjectJson, projectSizeMB } from "@/lib/project-files"
import { cn } from "@/lib/utils"

type Filter = "active" | "archived"
type Sort = "recent" | "name"

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" })
function timeAgo(ts: number) {
  const s = Math.round((ts - Date.now()) / 1000)
  const steps: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
  ]
  let value = s
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return rtf.format(value, unit)
    value = Math.round(value / size)
  }
  return rtf.format(value, "year")
}

export function ProjectsView() {
  const router = useRouter()
  const { project: open, projects, isNew, dirty } = useGameStore()
  const actions = useProjectActions()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<Filter>("active")
  const [sort, setSort] = useState<Sort>("recent")
  const [query, setQuery] = useState("")

  const counts = {
    active: projects.filter((p) => !p.archived).length,
    archived: projects.filter((p) => p.archived).length,
  }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects
      .filter((p) => (filter === "archived" ? p.archived : !p.archived))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "es") : b.updatedAt - a.updatedAt))
  }, [projects, filter, sort, query])

  return (
    <>
      <ViewHeader
        icon={LayoutGrid}
        title="Proyectos"
        description="Abre, organiza y comparte tus aventuras. Se guardan como archivos en la carpeta data/ del proyecto."
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={actions.busy.importing}>
              <Upload className="size-4" /> Importar
            </Button>
            <Button size="sm" onClick={() => actions.newProject()}>
              <Plus className="size-4" /> Nuevo proyecto
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 p-6">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg bg-muted p-0.5 text-sm">
              {(["active", "archived"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-md px-3 py-1 transition-colors",
                    filter === f ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f === "active" ? "Activos" : "Archivados"}
                  <span className="ml-1.5 text-xs text-muted-foreground">{counts[f]}</span>
                </button>
              ))}
            </div>
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar proyecto…" className="h-9 pl-8" />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Ordenar"
            >
              <option value="recent">Más recientes</option>
              <option value="name">Nombre (A–Z)</option>
            </select>
          </div>

          {/* The open project when it has never been saved (demo, new, imported) */}
          {isNew && open && filter === "active" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <Save className="size-4 shrink-0 text-amber-300" />
              <p className="min-w-0 flex-1">
                <span className="font-medium">«{open.name}»</span> está abierto pero nunca se ha guardado.
              </p>
              <Button size="sm" variant="outline" onClick={() => router.push("/")}>
                Ir al editor
              </Button>
              <Button size="sm" onClick={actions.save}>
                <Save className="size-4" /> Guardar como…
              </Button>
            </div>
          )}

          {list.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              {query
                ? "Ningún proyecto coincide con la búsqueda."
                : filter === "archived"
                  ? "No tienes proyectos archivados."
                  : "Todavía no tienes proyectos guardados."}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((p) => {
                const isOpen = p.id === open?.id
                return (
                  <ProjectCard
                    key={p.id}
                    // Show the open project's live state (it may have unsaved edits).
                    project={isOpen && open ? open : p}
                    isOpen={isOpen}
                    unsaved={isOpen && dirty}
                    onOpen={() => actions.openProject(p.id, () => router.push("/"))}
                  />
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void actions.importFile(file)
          e.target.value = ""
        }}
      />
    </>
  )
}

function ProjectCard({
  project,
  isOpen,
  unsaved,
  onOpen,
}: {
  project: GameProject
  isOpen: boolean
  unsaved: boolean
  onOpen: () => void
}) {
  const { updateSavedProject, duplicateProject } = useGameStore()
  const actions = useProjectActions()
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(project.name)

  const startScene = project.scenes.find((s) => s.id === project.startSceneId) ?? project.scenes[0]
  const cover = project.assets.find((a) => a.id === startScene?.backgroundAssetId)
  const stats = [
    `${project.scenes.length} escena${project.scenes.length === 1 ? "" : "s"}`,
    `${project.dialogs.length} diálogo${project.dialogs.length === 1 ? "" : "s"}`,
    (project.quests?.length ?? 0) > 0 && `${project.quests!.length} objetivo${project.quests!.length === 1 ? "" : "s"}`,
  ].filter(Boolean)

  function commitRename() {
    const name = nameDraft.trim()
    if (name && name !== project.name) updateSavedProject(project.id, { name })
    setRenaming(false)
  }

  return (
    <li
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors",
        isOpen ? "border-primary/60" : "border-border hover:border-foreground/20",
        project.archived && "opacity-70",
      )}
    >
      <button type="button" onClick={onOpen} className="relative aspect-video overflow-hidden bg-muted" title="Abrir en el editor">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.dataUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <ImageOff className="size-6" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          {isOpen && <Badge className="bg-primary text-primary-foreground">Abierto</Badge>}
          {unsaved && <Badge className="bg-amber-500 text-black">Sin guardar</Badge>}
          {project.archived && <Badge className="bg-black/70 text-white">Archivado</Badge>}
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {renaming ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename()
              if (e.key === "Escape") setRenaming(false)
            }}
            className="h-8 text-sm font-medium"
          />
        ) : (
          <p className="truncate font-medium" title={project.name}>
            {project.name}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{stats.join(" · ")}</p>
        <p className="text-xs text-muted-foreground/70">
          {projectSizeMB(project).toFixed(1)} MB · editado {timeAgo(project.updatedAt)}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button size="sm" variant={isOpen ? "outline" : "default"} className="h-8 flex-1" onClick={onOpen}>
            {isOpen ? "Ir al editor" : "Abrir"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8" aria-label="Más acciones">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  setNameDraft(project.name)
                  setRenaming(true)
                }}
              >
                <Pencil className="size-4" /> Renombrar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateProject(project.id)}>
                <Copy className="size-4" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateSavedProject(project.id, { archived: !project.archived })}>
                {project.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {project.archived ? "Desarchivar" : "Archivar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <ExportGameSubmenu project={project} />
              <DropdownMenuItem onClick={() => exportProjectJson(project)}>
                <Download className="size-4" /> Exportar proyecto (JSON)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete(project)}>
                <Trash2 className="size-4" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold shadow", className)}>{children}</span>
}
