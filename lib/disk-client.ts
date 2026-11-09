"use client"

import type { GameProject } from "./game-types"

/** Browser side of lib/disk-store.ts: projects and the tracker are files in data/. */
async function call<T>(what: string, init?: { method: "PUT"; body: unknown }): Promise<T> {
  const res = await fetch(`/api/storage/${what}`, {
    method: init?.method ?? "GET",
    headers: init ? { "Content-Type": "application/json" } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as T
}

export const diskStore = {
  /** `initialized` is false until the first write: nothing on disk yet (migrate from the browser). */
  readProjects: () =>
    call<{ initialized: boolean; projects: GameProject[]; currentId: string | null }>("projects"),
  writeProjects: (ids: string[], currentId: string | null, changed: GameProject[]) =>
    call("projects", { method: "PUT", body: { ids, currentId, changed } }),
  readDraft: () => call<{ project: GameProject | null }>("draft").then((r) => r.project),
  writeDraft: (project: GameProject | null) => call("draft", { method: "PUT", body: { project } }),
  readTracker: <T>() => call<{ items: T[] | null }>("tracker").then((r) => r.items),
  writeTracker: (items: unknown[]) => call("tracker", { method: "PUT", body: { items } }),
}
