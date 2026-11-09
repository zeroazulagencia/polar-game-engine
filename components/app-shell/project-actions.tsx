"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { Save } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useGameStore } from "@/lib/game-store"
import type { GameProject } from "@/lib/game-types"
import { readImportFile, slugifyName } from "@/lib/project-files"
import { applyContentPack, describePack } from "@/lib/content-pack"
import { downloadStandaloneGame, packageGame, type PackageTarget } from "@/lib/export-game"
import { confirmAction, notify } from "@/components/ui/confirm-host"

interface ProjectActions {
  /** Save, or ask for a name when the project was never saved. Also bound to Cmd/Ctrl+S. */
  save: () => void
  openSaveAs: () => void
  /** Open a saved project (after the unsaved-changes guard), then run `then`. */
  openProject: (id: string, then?: () => void) => void
  newProject: () => void
  /** Import a project (opens it) or an assets pack (added to the open project). */
  importFile: (file: File) => Promise<void>
  /** As a web page (downloaded) or packaged for a system (written to dist/). */
  exportGame: (project: GameProject, target?: "html" | PackageTarget) => Promise<void>
  requestDelete: (project: GameProject) => void
  /** exportingGame: what is being exported right now */
  busy: { importing: boolean; exportingGame: false | "html" | PackageTarget }
}

const Ctx = createContext<ProjectActions | null>(null)

export function useProjectActions() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useProjectActions must be used within ProjectActionsProvider")
  return ctx
}

/**
 * Project-level actions shared by the sidebar menu and the Projects view, including the
 * "unsaved changes" guard before replacing the open project and the "Save as" dialog.
 */
export function ProjectActionsProvider({ children }: { children: ReactNode }) {
  const store = useGameStore()
  const { project, isNew, dirty } = store

  const [busy, setBusy] = useState<ProjectActions["busy"]>({ importing: false, exportingGame: false })
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsName, setSaveAsName] = useState("")
  /** action waiting for the user to save or discard the current changes */
  const [pending, setPending] = useState<(() => void) | null>(null)
  /** action to run once the "Save as" dialog completes */
  const afterSaveAs = useRef<(() => void) | null>(null)
  const [toDelete, setToDelete] = useState<GameProject | null>(null)

  function openSaveAs(then?: () => void) {
    if (!project) return
    afterSaveAs.current = then ?? null
    setSaveAsName(isNew ? project.name : `${project.name} (copia)`)
    setSaveAsOpen(true)
  }

  function save() {
    if (!store.save()) openSaveAs()
  }

  function confirmSaveAs() {
    store.saveAs(saveAsName)
    setSaveAsOpen(false)
    const then = afterSaveAs.current
    afterSaveAs.current = null
    then?.()
  }

  /** Run `action` now, or after the user decides what to do with unsaved changes. */
  function guard(action: () => void) {
    if (dirty) setPending(() => action)
    else action()
  }

  // App-wide shortcuts: Cmd/Ctrl+S save, Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo.
  const saveRef = useRef(save)
  saveRef.current = save
  const { undo, redo } = store
  const historyRef = useRef({ undo, redo })
  historyRef.current = { undo, redo }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase() // with Shift held the key arrives as "Z"
      if (key === "s") {
        e.preventDefault()
        saveRef.current()
        return
      }
      if (key === "z") {
        // Text fields keep their own native undo.
        const t = e.target
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t as HTMLElement)?.isContentEditable) return
        e.preventDefault()
        if (e.shiftKey) historyRef.current.redo()
        else historyRef.current.undo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const actions: ProjectActions = {
    save,
    openSaveAs: () => openSaveAs(),
    openProject: (id, then) => {
      if (id === project?.id) return then?.()
      guard(() => {
        store.selectProject(id)
        then?.()
      })
    },
    newProject: () => guard(() => store.createProject("Nueva aventura")),
    importFile: async (file) => {
      setBusy((b) => ({ ...b, importing: true }))
      try {
        const imported = await readImportFile(file)
        if (imported.kind === "project") {
          guard(() => store.loadProject(imported.project))
        } else if (imported.kind === "content") {
          if (!project) throw new Error("Abre primero el proyecto al que quieres agregar este contenido.")
          const what = describePack(imported.pack)
          if (!(await confirmAction(`Agregar a «${project.name}»: ${what}?\nSe actualizan los que tengan el mismo id; nada más se borra.`, { confirmLabel: "Agregar" }))) return
          store.mutate((d) => applyContentPack(d, imported.pack))
          await notify(`Listo: se agregaron ${what}. Recuerda guardar (⌘S).`, "Contenido agregado")
        } else {
          store.mutate((d) => {
            const ids = new Set(d.assets.map((a) => a.id))
            const assets = imported.assets.map((a) => (ids.has(a.id) ? { ...a, id: crypto.randomUUID() } : a))
            return { ...d, assets: [...d.assets, ...assets] }
          })
        }
      } catch (err) {
        await notify(err instanceof Error ? err.message : "No se pudo importar el archivo.", "No se pudo importar")
      } finally {
        setBusy((b) => ({ ...b, importing: false }))
      }
    },
    exportGame: async (p, target = "html") => {
      setBusy((b) => ({ ...b, exportingGame: target }))
      try {
        if (target === "html") await downloadStandaloneGame(p, slugifyName(p.name))
        else {
          const { files, androidProjectOnly } = await packageGame(p, target)
          await notify(
            androidProjectOnly
              ? `Proyecto de Android listo en ${files.join(", ")}.\nPara sacar el APK, ábrelo con Android Studio (Build → Generate APKs). Si instalas Android Studio, la próxima vez el APK sale solo.`
              : `Listo: ${files.join(", ")}.\nSe abrió la carpeta. Es un .zip: quien lo reciba lo descomprime y abre el juego.`,
            "Juego empaquetado",
          )
        }
      } catch (err) {
        await notify(err instanceof Error ? err.message : "No se pudo exportar el juego.", "No se pudo exportar")
      } finally {
        setBusy((b) => ({ ...b, exportingGame: false }))
      }
    },
    requestDelete: (p) => setToDelete(p),
    busy,
  }

  return (
    <Ctx.Provider value={actions}>
      {children}

      {/* Save as */}
      <Dialog
        open={saveAsOpen}
        onOpenChange={(o) => {
          setSaveAsOpen(o)
          if (!o) afterSaveAs.current = null
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar como</DialogTitle>
            <DialogDescription>
              {isNew
                ? "Este proyecto aún no está en tu lista. Ponle un nombre para guardarlo."
                : "Se guardará una copia con este nombre y seguirás editando la copia."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (saveAsName.trim()) confirmSaveAs()
            }}
            className="space-y-4"
          >
            <Input
              autoFocus
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="Nombre del proyecto"
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSaveAsOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!saveAsName.trim()}>
                <Save className="size-4" /> Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes guard */}
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar los cambios de «{project?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {isNew
                ? "Este proyecto nunca se ha guardado. Si no lo guardas, se perderá."
                : "Tienes cambios sin guardar. Si los descartas, el proyecto vuelve a su última versión guardada."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                const action = pending
                setPending(null)
                store.discardChanges()
                action?.()
              }}
            >
              Descartar
            </Button>
            <AlertDialogAction
              onClick={() => {
                const action = pending
                setPending(null)
                if (!store.save()) openSaveAs(action ?? undefined)
                else action?.()
              }}
            >
              {isNew ? "Guardar como…" : "Guardar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{toDelete?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Su carpeta se moverá a data/.trash/, fuera de la lista y de git. Si quieres conservarlo en el
              proyecto, archívalo en lugar de eliminarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => toDelete && store.deleteProject(toDelete.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  )
}
