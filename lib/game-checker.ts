/**
 * "Verificar el juego": plays every option of a project headlessly, with the same rules as
 * play-mode.tsx, to find its endings and the actions that leave the player stuck.
 *
 * Two searches over game states (scene + flags + inventory + choices used):
 *  - a beam search that only follows the states that advance the most, to reach the endings fast
 *    even in a big game (and to show an example walkthrough to each one);
 *  - a best-first search up to a limit, to judge dead ends. A state is only reported as a dead end
 *    when everything after it was explored and none of it reaches an ending.
 */
import type { GameEffect, GameProject, Hotspot, LineCondition } from "./game-types"
import { availableChoices, conditionHolds, isLineVisible, resolveNext } from "./dialog-runtime"
import { conditionMet, questStarted } from "./quest-runtime"

export interface CheckReport {
  /** endings reached, each with the actions of one way to get there */
  endings: Array<{ text: string; steps: string[] }>
  /** endings the project defines that no search reached */
  missingEndings: string[]
  /** actions after which the game can no longer be finished (confirmed), most frequent first */
  deadEnds: Array<{ scene: string; action: string; count: number }>
  statesExplored: number
  /** true when the limit was not reached: every state of the game was explored */
  complete: boolean
  /** variables some condition asks for that never turn on */
  neverFlags: string[]
  neverScenes: string[]
  neverItems: string[]
  quests: Array<{ title: string; completable: boolean }>
}

interface S {
  scene: string
  flags: Record<string, boolean>
  inv: string[]
  used: string[]
  col: string[]
  steps: string[]
  qdone: string[]
  visited: string[]
  /** every flag that was ever on (search priority only, not part of the state) */
  ever: string[]
  end?: string
}
type Step = { s: S; label: string }

const clone = (s: S): S => ({
  ...s,
  flags: { ...s.flags },
  inv: [...s.inv],
  used: [...s.used],
  col: [...s.col],
  steps: [...s.steps],
  qdone: [...s.qdone],
  visited: [...s.visited],
  ever: [...s.ever],
})
const key = (s: S) =>
  [
    s.scene,
    Object.keys(s.flags).filter((k) => s.flags[k]).sort().join(","),
    [...s.inv].sort().join(","),
    [...s.used].sort().join(","),
    [...s.qdone].sort().join(","),
    s.end ?? "",
  ].join("|")
const score = (s: S) => s.qdone.length * 50 + s.col.length * 10 + s.ever.length * 3 + s.visited.length * 5

export function checkGame(project: GameProject, opts: { limit?: number; beamWidth?: number; onProgress?: (n: number) => void } = {}): CheckReport {
  const limit = opts.limit ?? 60000
  const beamWidth = opts.beamWidth ?? 300
  const dialogs = new Map(project.dialogs.map((d) => [d.id, d]))
  const items = new Set(project.items.map((i) => i.id))
  const scenes = new Map(project.scenes.map((s) => [s.id, s]))
  const quests = project.quests ?? []

  const goScene = (s: S, id: string) => {
    s.scene = id
    if (!s.visited.includes(id)) s.visited.push(id)
  }
  const give = (s: S, id: string) => {
    if (!items.has(id) || s.inv.includes(id)) return
    s.inv.push(id)
    if (!s.col.includes(id)) s.col.push(id)
  }
  /** `leaving`: only scene changes / endings (true), only the rest (false), all (null). Returns true when it leaves. */
  const fx = (s: S, effects: GameEffect[] | undefined, leaving: boolean | null): boolean => {
    let closed = false
    for (const e of effects ?? []) {
      const isLeave = e.type === "goToScene" || e.type === "endGame"
      if ((leaving === true && !isLeave) || (leaving === false && isLeave)) continue
      if (e.type === "setFlag" && e.flag) {
        s.flags[e.flag] = e.value
        if (e.value && !s.ever.includes(e.flag)) s.ever.push(e.flag)
      } else if (e.type === "giveItem") give(s, e.itemId)
      else if (e.type === "removeItem") s.inv = s.inv.filter((x) => x !== e.itemId)
      else if (e.type === "goToScene" && e.sceneId) {
        goScene(s, e.sceneId)
        closed = true
      } else if (e.type === "endGame") {
        s.end = e.text || "Fin"
        closed = true
      }
    }
    return closed
  }
  const runQuests = (s: S) => {
    for (let pass = 0; pass < 5; pass++) {
      let changed = false
      for (const q of quests) {
        const w = { flags: s.flags, inventory: s.inv, visitedScenes: s.visited }
        if (!questStarted(q, w) || s.qdone.includes(q.id)) continue
        let all = q.steps.length > 0
        for (const st of q.steps) {
          const met = s.steps.includes(st.id) || conditionMet(st.when, w)
          if (met && !s.steps.includes(st.id)) s.steps.push(st.id)
          if (!met) all = false
        }
        if (all) {
          s.qdone.push(q.id)
          fx(s, q.rewards, null)
          changed = true
        }
      }
      if (!changed) break
    }
  }

  /** Every way a dialog can play out. */
  const runDialog = (start: S, dialogId: string): Array<{ s: S; path: string[] }> => {
    const out: Array<{ s: S; path: string[] }> = []
    const dl = dialogs.get(dialogId)
    if (!dl?.lines.length) return out
    const seen = new Set<string>()
    const enter = (s: S, idx: number, path: string[]) => {
      while (dl.lines[idx] && !isLineVisible(dl.lines[idx], { flags: s.flags, inventory: s.inv })) idx++
      const line = dl.lines[idx]
      if (!line) return void out.push({ s, path })
      const k = idx + "#" + key(s)
      if (seen.has(k) || path.length > 12) return void out.push({ s, path })
      seen.add(k)
      fx(s, line.effects, false)
      const ch = availableChoices(line, { flags: s.flags, inventory: s.inv, usedChoices: s.used, sceneId: s.scene })
      if (ch.length) {
        for (const c of ch) {
          const t = clone(s)
          if (c.once) t.used.push(c.id)
          const np = [...path, c.text]
          if (fx(t, c.effects, null)) {
            out.push({ s: t, path: np })
            continue
          }
          const to = resolveNext(dl, idx, c.next ?? "end")
          if (to === null) out.push({ s: t, path: np })
          else enter(t, to, np)
        }
        return
      }
      if (fx(s, line.effects, true)) return void out.push({ s, path })
      const to = resolveNext(dl, idx, line.next)
      if (to === null) out.push({ s, path })
      else enter(s, to, path)
    }
    enter(clone(start), 0, [])
    return out
  }

  /** What the player can do from a state, with the resulting states. */
  const actions = (s: S): Step[] => {
    const res: Step[] = []
    const sc = scenes.get(s.scene)
    if (!sc) return res
    const W = { flags: s.flags, inventory: s.inv }
    const act = (name: string, a: Hotspot["action"] | undefined, consumes: string | null | undefined) => {
      if (!a) return
      const t = clone(s)
      if (consumes && t.inv.includes(consumes)) t.inv = t.inv.filter((x) => x !== consumes)
      if (a.type === "goToScene" && a.targetSceneId) {
        goScene(t, a.targetSceneId)
        res.push({ s: t, label: name })
      } else if (a.type === "pickup" && a.itemId) {
        give(t, a.itemId)
        res.push({ s: t, label: name })
      } else if (a.type === "endGame") {
        t.end = a.endGameText || "Fin"
        res.push({ s: t, label: name })
      } else if (a.type === "dialog" && a.dialogId) {
        for (const o of runDialog(t, a.dialogId)) res.push({ s: o.s, label: name + (o.path.length ? " → " + o.path.join(" / ") : "") })
      }
    }
    for (const h of sc.hotspots) {
      if (h.hideWhenCollected && s.col.includes(h.action?.itemId ?? "")) continue
      if (!conditionHolds(h.visibleIf, W)) continue
      const blocked = (h.requiresItem && !s.inv.includes(h.requiresItem)) || (h.requiresFlag && !s.flags[h.requiresFlag])
      if (blocked) {
        if (h.blockedDialog) act(`${h.name} (bloqueado)`, { type: "dialog", dialogId: h.blockedDialog }, null)
        continue
      }
      act(h.name, h.action, h.consumesItem)
    }
    for (const o of sc.sceneObjects ?? []) {
      if (!o.action || !o.interactionMode || o.interactionMode === "none") continue
      if (o.hideWhenItem && s.inv.includes(o.hideWhenItem)) continue
      if (!conditionHolds(o.visibleIf, W)) continue
      act(o.name, o.action, o.action.consumesItem)
    }
    for (const id of s.inv) {
      const it = project.items.find((i) => i.id === id)
      if (it?.useDialogId) act(`Usar ${it.name}`, { type: "dialog", dialogId: it.useDialogId }, null)
    }
    // Interludes play their dialog and put the player back where they were (or where it sends them).
    const out: Step[] = []
    for (const r of res) {
      const cut = scenes.get(r.s.scene)?.cutscene
      if (!cut) {
        out.push(r)
        continue
      }
      for (const o of runDialog(r.s, cut.dialogId)) {
        if (o.s.scene === r.s.scene) o.s.scene = s.scene
        out.push({ s: o.s, label: `${r.label} → interludio` })
      }
    }
    for (const r of out) runQuests(r.s)
    return out
  }

  const startId = project.startSceneId ?? project.scenes[0]?.id
  const start: S = { scene: startId ?? "", flags: {}, inv: [], used: [], col: [], steps: [], qdone: [], visited: startId ? [startId] : [], ever: [] }
  runQuests(start)
  const everFlags = new Set<string>()
  const everScenes = new Set<string>()
  const everItems = new Set<string>()
  const everQuests = new Set<string>()
  const note = (s: S) => {
    s.ever.forEach((f) => everFlags.add(f))
    s.visited.forEach((v) => everScenes.add(v))
    s.col.forEach((i) => everItems.add(i))
    s.qdone.forEach((q) => everQuests.add(q))
  }
  let work = 0
  const tick = () => {
    if (++work % 500 === 0) opts.onProgress?.(work)
  }

  // --- 1. Beam search: the endings and one way to each ---
  const endings = new Map<string, string[]>()
  {
    const parent = new Map<string, { from: string; label: string }>()
    const states = new Map<string, S>([[key(start), start]])
    let frontier = [key(start)]
    for (let depth = 0; depth < 5000 && frontier.length; depth++) {
      const next: string[] = []
      for (const k of frontier) {
        const s = states.get(k)!
        for (const a of actions(s)) {
          tick()
          const nk = key(a.s)
          if (states.has(nk)) continue
          states.set(nk, a.s)
          parent.set(nk, { from: k, label: `[${scenes.get(s.scene)?.name ?? s.scene}] ${a.label}` })
          note(a.s)
          if (a.s.end) {
            if (!endings.has(a.s.end)) {
              const steps: string[] = []
              for (let c = nk; parent.has(c); c = parent.get(c)!.from) steps.push(parent.get(c)!.label)
              endings.set(a.s.end, steps.reverse())
            }
          } else next.push(nk)
        }
      }
      next.sort((a, b) => score(states.get(b)!) - score(states.get(a)!))
      frontier = next.slice(0, beamWidth)
      if (states.size > limit * 3) break
    }
  }

  // --- 2. Best-first search up to the limit: confirmed dead ends ---
  const states = new Map<string, S>()
  const edges = new Map<string, Array<{ to: string; label: string }>>()
  const k0 = key(start)
  states.set(k0, start)
  const buckets = new Map<number, string[]>()
  const push = (k: string) => {
    const sc = Math.round(score(states.get(k)!))
    if (!buckets.has(sc)) buckets.set(sc, [])
    buckets.get(sc)!.push(k)
  }
  const pop = () => {
    const top = Math.max(...buckets.keys())
    const b = buckets.get(top)!
    const k = b.pop()!
    if (!b.length) buckets.delete(top)
    return k
  }
  push(k0)
  while (buckets.size && states.size < limit) {
    const k = pop()
    const s = states.get(k)!
    if (s.end) {
      edges.set(k, [])
      if (!endings.has(s.end)) endings.set(s.end, [])
      continue
    }
    const es: Array<{ to: string; label: string }> = []
    for (const a of actions(s)) {
      tick()
      const nk = key(a.s)
      es.push({ to: nk, label: `[${scenes.get(s.scene)?.name ?? s.scene}] ${a.label}` })
      if (!states.has(nk)) {
        states.set(nk, a.s)
        note(a.s)
        push(nk)
      }
    }
    edges.set(k, es)
  }
  const complete = buckets.size === 0
  // Reverse graph: what can still reach an ending ("good") or a state not explored yet ("unknown").
  const rev = new Map<string, string[]>()
  for (const [k, es] of edges) for (const e of es) (rev.get(e.to) ?? rev.set(e.to, []).get(e.to)!).push(k)
  const spread = (seeds: string[]) => {
    const out = new Set(seeds)
    const q = [...seeds]
    while (q.length) for (const pk of rev.get(q.pop()!) ?? []) if (!out.has(pk)) (out.add(pk), q.push(pk))
    return out
  }
  const good = spread([...states.keys()].filter((k) => states.get(k)!.end))
  const unknown = spread([...states.keys()].filter((k) => !edges.has(k)))
  const dead = new Set([...edges.keys()].filter((k) => !good.has(k) && !unknown.has(k)))
  const byAction = new Map<string, { scene: string; action: string; count: number }>()
  for (const [k, es] of edges) {
    if (dead.has(k)) continue
    for (const e of es) {
      if (!dead.has(e.to)) continue
      const scene = scenes.get(states.get(k)!.scene)?.name ?? ""
      const action = e.label.replace(/^\[[^\]]*\] /, "")
      const id = scene + "|" + action
      const cur = byAction.get(id) ?? { scene, action, count: 0 }
      cur.count++
      byAction.set(id, cur)
    }
  }

  // --- What the project asks for but the searches never saw ---
  const read = new Set<string>()
  const cond = (c: LineCondition | null | undefined) => c?.kind === "flag" && c.id && read.add(c.id)
  const declaredEndings = new Set<string>()
  for (const d of project.dialogs)
    for (const l of d.lines) {
      cond(l.showIf)
      for (const c of l.choices ?? []) if (c.requiresFlag) read.add(c.requiresFlag)
      for (const e of [...(l.effects ?? []), ...(l.choices ?? []).flatMap((c) => c.effects ?? [])])
        if (e.type === "endGame") declaredEndings.add(e.text || "Fin")
    }
  for (const s of project.scenes) {
    for (const h of s.hotspots) {
      if (h.requiresFlag) read.add(h.requiresFlag)
      cond(h.visibleIf)
      if (h.action?.type === "endGame") declaredEndings.add(h.action.endGameText || "Fin")
    }
    for (const o of s.sceneObjects ?? []) {
      cond(o.visibleIf)
      o.stops?.forEach((st) => cond(st.when))
    }
    s.backgroundVariants?.forEach((v) => cond(v.when))
  }
  for (const q of quests) {
    if (q.startFlag) read.add(q.startFlag)
    for (const st of q.steps) if (st.when.type === "flag") read.add(st.when.flag)
  }

  return {
    endings: [...endings].map(([text, steps]) => ({ text, steps })),
    missingEndings: [...declaredEndings].filter((t) => !endings.has(t)),
    deadEnds: [...byAction.values()].sort((a, b) => b.count - a.count).slice(0, 40),
    statesExplored: edges.size,
    complete,
    neverFlags: [...read].filter((f) => !everFlags.has(f)).sort(),
    neverScenes: project.scenes.filter((s) => !everScenes.has(s.id) && !s.cutscene).map((s) => s.name),
    neverItems: project.items.filter((i) => !everItems.has(i.id)).map((i) => i.name),
    quests: quests.map((q) => ({ title: q.title, completable: everQuests.has(q.id) })),
  }
}
