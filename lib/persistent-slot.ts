"use client"

import { useSyncExternalStore } from "react"
import { del, get, set } from "idb-keyval"

/**
 * A value that outlives the component showing it: kept in module memory (survives moving
 * between views) and, if `persist`, in IndexedDB (survives a reload). Used for AI previews
 * so leaving the generator by mistake — even mid-generation — doesn't lose the result.
 */
export function createSlot<T>(key: string, opts: { persist?: boolean } = {}) {
  let value: T | null = null
  let loaded = !opts.persist
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())

  function load() {
    if (loaded) return
    loaded = true
    get(key)
      .then((stored) => {
        // Don't override something set while the read was in flight.
        if (value === null && stored != null) {
          value = stored as T
          emit()
        }
      })
      .catch(() => {})
  }

  return {
    get: () => value,
    set(next: T | null) {
      value = next
      emit()
      if (opts.persist) (next == null ? del(key) : set(key, next)).catch(() => {})
    },
    subscribe(listener: () => void) {
      load()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type Slot<T> = ReturnType<typeof createSlot<T>>

export function useSlot<T>(slot: Slot<T>): T | null {
  return useSyncExternalStore(slot.subscribe, slot.get, () => null)
}
