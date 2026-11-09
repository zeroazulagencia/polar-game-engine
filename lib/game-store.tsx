"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { get } from "idb-keyval"
import { diskStore } from "./disk-client"
import {
  createEmptyProject,
  type GameProject,
} from "./game-types"

/**
 * Saved projects and the unsaved working copy live as files in data/ (lib/disk-store.ts).
 * These are the old IndexedDB keys, read once to move a browser's projects onto disk.
 */
const LEGACY_STORE_KEY = "pixelquest:projects"
const LEGACY_DRAFT_KEY = "pixelquest:draft"
const MAX_HISTORY = 50

interface SavedState {
  projects: GameProject[]
  currentId: string | null
}

interface StoreState {
  /** saved projects (what the "Open project" list shows) */
  saved: GameProject[]
  /** the project being edited; may not be in `saved` yet (demo, new, imported) */
  working: GameProject | null
}

interface GameStoreValue {
  ready: boolean
  /** Set when the browser storage couldn't be read: nothing is written until a reload succeeds. */
  storageError: string | null
  /** Saved projects. */
  projects: GameProject[]
  /** The project being edited (working copy). */
  project: GameProject | null
  /** The working copy has never been saved (demo, new or imported project): saving needs a name. */
  isNew: boolean
  /** The working copy differs from its saved version (or was never saved). */
  dirty: boolean
  /** Write the working copy over its saved version. Returns false when it needs "Save as". */
  save: () => boolean
  /** Save the working copy as a new project with this name and keep editing it. */
  saveAs: (name: string) => void
  /** Drop unsaved changes (back to the saved version, or to another project if it was never saved). */
  discardChanges: () => void
  /** Open a saved project (unsaved changes of the current one are discarded; ask first in the UI). */
  selectProject: (id: string) => void
  /** Start a new, unsaved project. */
  createProject: (name?: string) => void
  /** Open a fully-formed project (demo, import) as a new unsaved working copy. */
  loadProject: (project: GameProject) => void
  deleteProject: (id: string) => void
  /** Rename / archive a saved project without opening it (kept in sync with the open copy). */
  updateSavedProject: (id: string, patch: Partial<Pick<GameProject, "name" | "archived">>) => void
  /** Save a copy of a saved project under a new name. */
  duplicateProject: (id: string) => void
  /**
   * Immutably update the current project. Pass `{ history: false }` for continuous
   * changes (drags) after calling `checkpoint()` once, so a whole drag is one undo step.
   */
  mutate: (updater: (draft: GameProject) => GameProject, opts?: { history?: boolean }) => void
  /** Save the current state as an undo step (call at the start of a drag). */
  checkpoint: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

const GameStoreContext = createContext<GameStoreValue | null>(null)

/**
 * A slow read must never be mistaken for "no projects" (that used to create an empty
 * project and overwrite the real ones), so a timeout is an error, not an empty result.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ])
}

export function GameStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>({ saved: [], working: null })
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  /** true only after a successful read: persistence is blocked otherwise. */
  const storageOk = useRef(false)
  const undoStack = useRef<GameProject[]>([])
  const redoStack = useRef<GameProject[]>([])
  const stateRef = useRef(state)
  stateRef.current = state
  const lastSaved = useRef<{ saved: GameProject[]; currentId: string | null } | null>(null)

  // Load saved projects and any unsaved working copy once.
  useEffect(() => {
    let active = true
    ;(async () => {
      let saved: GameProject[] = []
      let working: GameProject | null = null
      try {
        const [disk, diskDraft] = await withTimeout(
          Promise.all([diskStore.readProjects(), diskStore.readDraft()]),
          20000,
        )
        let stored: SavedState | undefined = disk
        let draft = diskDraft
        // Nothing on disk yet: bring over what this browser had in IndexedDB.
        const migrating = !disk.initialized
        if (migrating) {
          const [legacy, legacyDraft] = await withTimeout(
            Promise.all([
              get(LEGACY_STORE_KEY) as Promise<SavedState | undefined>,
              get(LEGACY_DRAFT_KEY) as Promise<{ project: GameProject } | undefined>,
            ]),
            20000,
          ).catch(() => [undefined, undefined] as const)
          stored = legacy
          draft = legacyDraft?.project ?? null
        }
        saved = stored?.projects ?? []
        working = draft ?? saved.find((p) => p.id === stored?.currentId) ?? saved[0] ?? null
        if (working && !migrating) {
          // What we just read is already on disk: don't write it back on start.
          lastSaved.current = { saved, currentId: stored?.currentId ?? working.id }
        } else if (!working) {
          // Storage read fine and is really empty: start with a fresh (saved) project.
          const seed = createEmptyProject("Mi primera aventura")
          saved = [seed]
          working = seed
        }
        storageOk.current = true
      } catch (err) {
        // Couldn't read: work on a temporary project and never write, so stored projects stay intact.
        console.log("[v0] failed to read projects:", err)
        storageOk.current = false
        working = createEmptyProject("Proyecto temporal")
        saved = []
        if (active) {
          setStorageError(
            "No se pudieron leer los proyectos de la carpeta data/. Para no sobrescribirlos, los cambios no se guardarán: revisa que el servidor esté corriendo y recarga la página.",
          )
        }
      }
      if (active) {
        setState({ saved, working })
        setReady(true)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const savedVersion = state.working ? state.saved.find((p) => p.id === state.working!.id) : undefined
  const isNew = !!state.working && !savedVersion
  // Immutable updates: an untouched working copy is the very same object as its saved version.
  const dirty = isNew || (!!state.working && state.working !== savedVersion)

  // Persist the saved list (only changes on save / delete / switching project).
  useEffect(() => {
    if (!ready || !storageOk.current) return
    const currentId = state.working?.id ?? null
    const prev = lastSaved.current
    if (prev?.saved === state.saved && prev.currentId === currentId) return
    lastSaved.current = { saved: state.saved, currentId }
    // Untouched projects keep their object identity: only send the ones that changed.
    const changed = state.saved.filter((p) => !prev?.saved.includes(p))
    diskStore
      .writeProjects(
        state.saved.map((p) => p.id),
        currentId,
        changed,
      )
      .catch((err) => {
        console.log("[v0] failed to persist projects:", err)
        // Resend everything next time instead of trusting a write that didn't happen.
        lastSaved.current = null
      })
  }, [ready, state.saved, state.working])

  // Back up the working copy while it has unsaved changes (debounced).
  useEffect(() => {
    if (!ready || !storageOk.current) return
    const id = setTimeout(() => {
      diskStore.writeDraft(dirty && state.working ? state.working : null).catch((err) => console.log("[v0] failed to persist draft:", err))
    }, 400)
    return () => clearTimeout(id)
  }, [ready, dirty, state.working])

  const resetHistory = () => {
    undoStack.current = []
    redoStack.current = []
  }

  // State is updated immutably, so history keeps references instead of deep copies:
  // snapshots share every unchanged object (including the large image data URLs).
  const pushUndo = useCallback((prev: GameProject | null) => {
    if (!prev) return
    // React StrictMode runs state updaters twice in dev: never stack the same snapshot twice.
    if (undoStack.current[undoStack.current.length - 1] === prev) return
    undoStack.current.push(prev)
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
  }, [])

  const save = useCallback(() => {
    const { saved, working } = stateRef.current
    if (!working || !saved.some((p) => p.id === working.id)) return false
    setState((s) => ({ ...s, saved: s.saved.map((p) => (p.id === working.id ? working : p)) }))
    return true
  }, [])

  const saveAs = useCallback((name: string) => {
    setState((s) => {
      if (!s.working) return s
      const neverSaved = !s.saved.some((p) => p.id === s.working!.id)
      const copy: GameProject = {
        ...s.working,
        // "Save as" on a saved project forks it; a never-saved one just gets its first save.
        id: neverSaved ? s.working.id : crypto.randomUUID(),
        name: name.trim() || s.working.name,
        updatedAt: Date.now(),
      }
      return { saved: [...s.saved, copy], working: copy }
    })
    resetHistory()
  }, [])

  const selectProject = useCallback((id: string) => {
    setState((s) => {
      const target = s.saved.find((p) => p.id === id)
      return target ? { ...s, working: target } : s
    })
    resetHistory()
  }, [])

  const discardChanges = useCallback(() => {
    setState((s) => {
      if (!s.working) return s
      const savedCopy = s.saved.find((p) => p.id === s.working!.id)
      if (savedCopy) return { ...s, working: savedCopy }
      const fallback = s.saved[0]
      if (fallback) return { ...s, working: fallback }
      const seed = createEmptyProject("Mi primera aventura")
      return { saved: [seed], working: seed }
    })
    resetHistory()
  }, [])

  const createProject = useCallback((name?: string) => {
    setState((s) => ({ ...s, working: createEmptyProject(name || "Nueva aventura") }))
    resetHistory()
  }, [])

  const loadProject = useCallback((project: GameProject) => {
    setState((s) => ({
      ...s,
      // Never let an import silently overwrite a saved project with the same id.
      working: s.saved.some((p) => p.id === project.id) ? { ...project, id: crypto.randomUUID() } : project,
    }))
    resetHistory()
  }, [])

  const deleteProject = useCallback((id: string) => {
    setState((s) => {
      const saved = s.saved.filter((p) => p.id !== id)
      if (s.working?.id !== id) return { ...s, saved }
      const next = saved[0] ?? createEmptyProject("Mi primera aventura")
      return { saved: saved.length ? saved : [next], working: next }
    })
    resetHistory()
  }, [])

  const updateSavedProject = useCallback(
    (id: string, patch: Partial<Pick<GameProject, "name" | "archived">>) => {
      setState((s) => {
        const old = s.saved.find((p) => p.id === id)
        if (!old) return s
        const updated = { ...old, ...patch }
        let working = s.working
        if (working?.id === id) {
          // An untouched open copy stays "saved"; an edited one keeps its edits plus the patch.
          working = working === old ? updated : { ...working, ...patch }
        }
        return { saved: s.saved.map((p) => (p.id === id ? updated : p)), working }
      })
    },
    [],
  )

  const duplicateProject = useCallback((id: string) => {
    setState((s) => {
      const src = s.saved.find((p) => p.id === id)
      if (!src) return s
      const copy: GameProject = {
        ...src,
        id: crypto.randomUUID(),
        name: `${src.name} (copia)`,
        archived: false,
        updatedAt: Date.now(),
      }
      const idx = s.saved.indexOf(src)
      return { ...s, saved: [...s.saved.slice(0, idx + 1), copy, ...s.saved.slice(idx + 1)] }
    })
  }, [])

  const mutate = useCallback(
    (updater: (draft: GameProject) => GameProject, opts?: { history?: boolean }) => {
      setState((s) => {
        if (!s.working) return s
        if (opts?.history !== false) pushUndo(s.working)
        return { ...s, working: { ...updater(s.working), updatedAt: Date.now() } }
      })
    },
    [pushUndo],
  )

  const checkpoint = useCallback(() => {
    pushUndo(stateRef.current.working)
  }, [pushUndo])

  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    setState((s) => {
      if (s.working && redoStack.current[redoStack.current.length - 1] !== s.working) redoStack.current.push(s.working)
      if (redoStack.current.length > MAX_HISTORY) redoStack.current.shift()
      return { ...s, working: prev }
    })
  }, [])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    setState((s) => {
      if (s.working && undoStack.current[undoStack.current.length - 1] !== s.working) undoStack.current.push(s.working)
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
      return { ...s, working: next }
    })
  }, [])

  return (
    <GameStoreContext.Provider
      value={{
        ready,
        storageError,
        projects: state.saved,
        project: state.working,
        isNew,
        dirty,
        save,
        saveAs,
        discardChanges,
        selectProject,
        createProject,
        loadProject,
        deleteProject,
        updateSavedProject,
        duplicateProject,
        mutate,
        checkpoint,
        undo,
        redo,
        canUndo: undoStack.current.length > 0,
        canRedo: redoStack.current.length > 0,
      }}
    >
      {children}
    </GameStoreContext.Provider>
  )
}

export function useGameStore() {
  const ctx = useContext(GameStoreContext)
  if (!ctx) throw new Error("useGameStore must be used within GameStoreProvider")
  return ctx
}
