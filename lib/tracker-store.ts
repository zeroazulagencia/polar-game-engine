"use client"

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { get } from "idb-keyval"
import { diskStore } from "./disk-client"

/** Roadmap items and bugs for the engine itself (app-wide, not per game project). */
export type TrackerKind = "roadmap" | "bug"
export type TrackerStatus = "todo" | "doing" | "done"
export type TrackerPriority = "high" | "medium" | "low"

export interface TrackerItem {
  id: string
  kind: TrackerKind
  title: string
  notes?: string
  status: TrackerStatus
  priority: TrackerPriority
  createdAt: number
  updatedAt: number
}

export const STATUS_LABELS: Record<TrackerKind, Record<TrackerStatus, string>> = {
  roadmap: { todo: "Pendiente", doing: "En progreso", done: "Hecho" },
  bug: { todo: "Abierto", doing: "En progreso", done: "Resuelto" },
}

export const PRIORITY_LABELS: Record<TrackerPriority, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
}

/** Old IndexedDB key, only read to migrate a browser's list into data/tracker.json. */
const STORE_KEY = "pixelquest-tracker-v1"

/** A new project's list starts empty: it is for the game being made, not for the engine. */
function seedItems(): TrackerItem[] {
  return []
}

function useTrackerState() {
  const [items, setItems] = useState<TrackerItem[]>([])
  const [ready, setReady] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        // A slow read must not look like "empty" (it would overwrite the saved list with the seed).
        // Stored in data/tracker.json; the first time, bring over this browser's IndexedDB list.
        const load = async () =>
          (await diskStore.readTracker<TrackerItem>()) ?? ((await get(STORE_KEY).catch(() => undefined)) as TrackerItem[] | undefined)
        const stored = await Promise.race([
          load(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000)),
        ])
        if (active) {
          setItems(stored ?? seedItems())
          setReady(true)
        }
      } catch {
        // Show the seed but never persist (ready stays false), so the stored list survives.
        if (active) setItems(seedItems())
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      diskStore.writeTracker(items).catch((err) => {
        console.log("[v0] failed to persist tracker:", err)
      })
    }, 300)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [items, ready])

  const addItem = useCallback(
    (kind: TrackerKind, title: string, priority: TrackerPriority, notes?: string) => {
      const now = Date.now()
      setItems((prev) => [
        { id: crypto.randomUUID(), kind, title, notes, status: "todo", priority, createdAt: now, updatedAt: now },
        ...prev,
      ])
    },
    [],
  )

  const updateItem = useCallback((id: string, patch: Partial<Omit<TrackerItem, "id" | "kind">>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch, updatedAt: Date.now() } : it)))
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  return { items, ready, addItem, updateItem, removeItem }
}

export type Tracker = ReturnType<typeof useTrackerState>

const TrackerContext = createContext<Tracker | null>(null)

export function TrackerProvider({ children }: { children: ReactNode }) {
  return createElement(TrackerContext.Provider, { value: useTrackerState() }, children)
}

export function useTracker() {
  const ctx = useContext(TrackerContext)
  if (!ctx) throw new Error("useTracker must be used within TrackerProvider")
  return ctx
}

/** Markdown export, handy for pasting into an issue or a chat. */
export function trackerToMarkdown(items: TrackerItem[]): string {
  const section = (kind: TrackerKind, heading: string) => {
    const rows = items.filter((it) => it.kind === kind)
    if (rows.length === 0) return `## ${heading}\n\n_(vacío)_\n`
    const lines = rows.map((it) => {
      const box = it.status === "done" ? "[x]" : "[ ]"
      const meta = `${STATUS_LABELS[kind][it.status]} · ${PRIORITY_LABELS[it.priority]}`
      const notes = it.notes ? `\n  ${it.notes}` : ""
      return `- ${box} ${it.title} _(${meta})_${notes}`
    })
    return `## ${heading}\n\n${lines.join("\n")}\n`
  }
  return `${section("roadmap", "Roadmap")}\n${section("bug", "Bugs")}`
}
