"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import {
  Check,
  ChevronsUpDown,
  Download,
  FolderOpen,
  Globe,
  Image,
  LayoutGrid,
  Pencil,
  Plus,
  Save,
  SaveAll,
  Trash2,
  Upload,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useGameStore } from "@/lib/game-store"
import { exportAssetsJson, exportProjectJson } from "@/lib/project-files"
import { cn } from "@/lib/utils"
import { useProjectActions } from "./project-actions"

/** Project switcher + project/data actions, shown at the top of the sidebar. */
export function ProjectMenu({ collapsed }: { collapsed: boolean }) {
  const { project, projects, isNew, dirty, mutate } = useGameStore()
  const actions = useProjectActions()
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!project) return null
  const switchable = projects.filter((p) => !p.archived || p.id === project.id)

  function startRename() {
    setNameDraft(project!.name)
    setEditingName(true)
  }

  return (
    <>
      {editingName ? (
        <Input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            mutate((d) => ({ ...d, name: nameDraft.trim() || d.name }))
            setEditingName(false)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "Escape") setEditingName(false)
          }}
          className="h-9 text-sm"
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={project.name}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background/40 text-left text-sm transition-colors hover:bg-accent",
                collapsed ? "justify-center px-0" : "px-2",
              )}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded bg-primary/15 text-[11px] font-semibold text-primary">
                {project.name.trim().charAt(0).toUpperCase() || "P"}
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} className="w-60">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Proyecto</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/projects">
                <LayoutGrid className="size-4" /> Todos los proyectos
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderOpen className="size-4" /> Abrir proyecto
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {switchable.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => actions.openProject(p.id)} className="justify-between">
                    <span className="truncate">{p.name}</span>
                    {p.id === project.id && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={actions.newProject}>
              <Plus className="size-4" /> Nuevo proyecto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={actions.save} disabled={!dirty}>
              <Save className="size-4" /> {isNew ? "Guardar como…" : "Guardar"}
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </DropdownMenuItem>
            {!isNew && (
              <DropdownMenuItem onClick={actions.openSaveAs}>
                <SaveAll className="size-4" /> Guardar como…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={startRename}>
              <Pencil className="size-4" /> Renombrar
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Datos</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => actions.exportGame(project)}
              disabled={actions.busy.exportingGame || project.scenes.length === 0}
            >
              <Globe className="size-4" /> {actions.busy.exportingGame ? "Exportando juego…" : "Exportar juego (HTML)"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportProjectJson(project)}>
              <Download className="size-4" /> Exportar proyecto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAssetsJson(project)}>
              <Image className="size-4" /> Exportar assets
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()} disabled={actions.busy.importing}>
              <Upload className="size-4" /> {actions.busy.importing ? "Importando…" : "Importar JSON"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete(project)}>
              <Trash2 className="size-4" /> Eliminar proyecto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={actions.save}
        disabled={!dirty}
        title={
          isNew
            ? "Este proyecto aún no está guardado: elige un nombre (⌘S)"
            : dirty
              ? "Guardar cambios (⌘S)"
              : "Todos los cambios están guardados"
        }
        className={cn(
          "relative mt-1.5 flex h-8 w-full items-center gap-2 rounded-md text-xs transition-colors",
          collapsed ? "justify-center" : "px-2",
          dirty
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "text-muted-foreground hover:bg-accent disabled:hover:bg-transparent",
        )}
      >
        {dirty ? <Save className="size-3.5 shrink-0" /> : <Check className="size-3.5 shrink-0" />}
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{dirty ? (isNew ? "Guardar como…" : "Guardar") : "Guardado"}</span>
            <span className={cn("text-[10px]", dirty ? "opacity-70" : "opacity-50")}>⌘S</span>
          </>
        )}
      </button>

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
