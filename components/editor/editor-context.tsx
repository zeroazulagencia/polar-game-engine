"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type Selection =
  | { type: "none" }
  | { type: "scene" }
  | { type: "hotspot"; hotspotId: string }
  | { type: "walkable"; walkableId: string }
  | { type: "depthWaypoint"; waypointId: string }
  | { type: "sceneObject"; objectId: string }
  | { type: "character" }

interface EditorUIValue {
  activeSceneId: string | null
  setActiveSceneId: (id: string | null) => void
  selection: Selection
  setSelection: (s: Selection) => void
  /** Side columns of the editor (desktop); closing them enlarges the stage. */
  libraryOpen: boolean
  inspectorOpen: boolean
  toggleLibrary: () => void
  toggleInspector: () => void
}

const PANELS_KEY = "pixelquest:editor-panels:v1"

const EditorUIContext = createContext<EditorUIValue | null>(null)

export function EditorUIProvider({ children }: { children: ReactNode }) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>({ type: "none" })
  const [panels, setPanels] = useState({ library: true, inspector: true })

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PANELS_KEY) ?? "null")
      if (saved && typeof saved.library === "boolean" && typeof saved.inspector === "boolean") setPanels(saved)
    } catch {}
  }, [])

  const togglePanel = useCallback((key: "library" | "inspector") => {
    setPanels((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])
  const toggleLibrary = useCallback(() => togglePanel("library"), [togglePanel])
  const toggleInspector = useCallback(() => togglePanel("inspector"), [togglePanel])

  const value = useMemo(
    () => ({
      activeSceneId,
      setActiveSceneId,
      selection,
      setSelection,
      libraryOpen: panels.library,
      inspectorOpen: panels.inspector,
      toggleLibrary,
      toggleInspector,
    }),
    [activeSceneId, selection, panels, toggleLibrary, toggleInspector],
  )

  return <EditorUIContext.Provider value={value}>{children}</EditorUIContext.Provider>
}

export function useEditorUI() {
  const ctx = useContext(EditorUIContext)
  if (!ctx) throw new Error("useEditorUI must be used within EditorUIProvider")
  return ctx
}
