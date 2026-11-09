"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, X, Package, Volume2, VolumeX, BookOpen, CheckCircle2, Circle, Save, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useGameStore } from "@/lib/game-store"
import type {
  CharacterDirection,
  DialogChoice,
  FaceOnArrive,
  GameEffect,
  GameProject,
  Hotspot,
  HotspotAction,
  InventoryItem,
  Point,
  Scene,
  SceneObject,
} from "@/lib/game-types"
import { availableChoices, conditionHolds, isLineVisible, resolveNext } from "@/lib/dialog-runtime"
import { DialogBox, type DialogBoxHandle } from "@/components/dialogs/dialog-box"
import { CharacterShadow } from "./character-shadow"
import { LivingSprite, PROTAGONIST_BREATH, PROTAGONIST_BREATH_MS } from "./living-sprite"
import { CinematicPlayer } from "./cinematic-player"
import { CreditsRoll } from "./credits-roll"
import { TitleScreenView } from "./title-screen"
import { getDepthLook } from "@/lib/depth-look"
import { displaySpeaker, fillPlayerName } from "@/lib/protagonist"
import { DEFAULT_VERTICAL_ANGLE, directionFromVector, resolveAnimation } from "@/lib/character-anim"
import { resolveDialogStyle } from "@/lib/dialog-style"
import { conditionMet, questStarted, type QuestWorld } from "@/lib/quest-runtime"
import { pointInPolygon, polygonToSvgPath, rectToPolygon } from '@/lib/geometry'
import { graphEdges, nearestOnGraph, planRoute } from '@/lib/depth-path'
import { getAudioEngine } from '@/lib/audio-engine'

const NO_QUESTS: NonNullable<GameProject["quests"]> = []
const WALK_SPEED = 0.45
const DEFAULT_FRAME_MS = 200

/** "Obtuviste X": the item's picture and name pop up in the middle of the scene and fade. */
function ItemReveal({ name, src, onDone }: { name: string; src?: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const anim = ref.current?.animate(
      [
        { opacity: 0, transform: "scale(0.6)" },
        { opacity: 1, transform: "scale(1.08)", offset: 0.12 },
        { opacity: 1, transform: "scale(1)", offset: 0.2 },
        { opacity: 1, transform: "scale(1)", offset: 0.8 },
        { opacity: 0, transform: "scale(1) translateY(-12px)" },
      ],
      { duration: 2600, easing: "ease-out", fill: "forwards" },
    )
    if (!anim) return
    anim.onfinish = () => done.current()
    return () => anim.cancel()
  }, [])
  return (
    <div className="pointer-events-none absolute inset-0 z-[90] grid place-items-center">
      <div ref={ref} className="flex w-[min(80%,620px)] flex-col items-center gap-2 text-center" style={{ fontFamily: '"Nunito", system-ui, sans-serif' }}>
        <div className="relative grid size-[min(28cqh,180px)] place-items-center">
          <div className="absolute inset-0 rounded-full bg-amber-200/30 blur-2xl" />
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="relative max-h-full max-w-full object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]" />
          ) : (
            <Package className="relative size-16 text-white" />
          )}
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200 drop-shadow">Obtuviste</p>
        <p className="text-2xl font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{name}</p>
      </div>
    </div>
  )
}

/** Scene a dialog takes you to (its first scene change), and where it puts you, if any. */
function dialogExit(project: GameProject, dialogId: string | null | undefined): { sceneId: string; at?: Point | null } | null {
  const dl = project.dialogs.find((d) => d.id === dialogId)
  for (const line of dl?.lines ?? []) {
    for (const fx of [...(line.effects ?? []), ...(line.choices ?? []).flatMap((c) => c.effects ?? [])]) {
      // an interlude is not a door: the player comes back from it
      if (fx.type === "goToScene" && fx.sceneId && !project.scenes.find((s) => s.id === fx.sceneId)?.cutscene) return fx
    }
  }
  return null
}
function dialogDestination(project: GameProject, dialogId: string | null | undefined): string | null {
  return dialogExit(project, dialogId)?.sceneId ?? null
}

/** Where an object stands now: its last stop whose condition holds, or its own place. */
function objectSpot(obj: SceneObject, state: { flags: Record<string, boolean>; inventory: string[] }): Point {
  const stop = [...(obj.stops ?? [])].reverse().find((st) => conditionHolds(st.when, state))
  return stop ? { x: stop.x, y: stop.y } : { x: obj.x, y: obj.y }
}

/**
 * Where to appear when entering `scene` from `fromId`: on the walk graph, as close as possible to
 * the foot of the door (hotspot or object) that leads back to `fromId`, looking into the room.
 */
function doorEntry(project: GameProject, scene: Scene, fromId: string): { pos: Point; dir: CharacterDirection } | null {
  const leadsBack = (a: HotspotAction | undefined) =>
    !!a && ((a.type === "goToScene" && a.targetSceneId === fromId) || (a.type === "dialog" && dialogDestination(project, a.dialogId) === fromId))
  let foot: Point | null = null
  const h = scene.hotspots.find((x) => leadsBack(x.action))
  if (h?.points?.length) foot = { x: hotspotCenterX(h), y: Math.max(...h.points.map((p) => p.y)) }
  if (!foot) {
    const o = (scene.sceneObjects ?? []).find((x) => leadsBack(x.action))
    if (o) foot = { x: o.x, y: o.y }
  }
  if (!foot) return null
  const pos = nearestOnGraph(scene.depthWaypoints ?? [], { x: foot.x, y: Math.min(0.99, foot.y) })
  return { pos, dir: pos.x < 0.5 ? "right" : "left" }
}

/** Where to stand next to something spanning [left, right]: on the side `fromX` comes from
 *  (the other side when that one is off screen). */
function besideX(left: number, right: number, fromX: number) {
  const gap = 0.04
  const before = left - gap
  const after = right + gap
  const preferBefore = fromX < (left + right) / 2
  if (preferBefore ? before >= 0.03 : after > 0.97) return Math.max(0.03, before)
  return Math.min(0.97, after)
}

/** Horizontal middle of a hotspot's polygon. */
function hotspotCenterX(h: Hotspot) {
  const xs = (h.points ?? []).map((p) => p.x)
  return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0.5
}

/** A saved game: everything that changes while playing. */
interface SavedGame {
  v: 1
  savedAt: number
  sceneId: string
  pos: Point
  dir: CharacterDirection
  inventory: string[]
  collected: string[]
  flags: Record<string, boolean>
  usedChoices: string[]
  visitedScenes: string[]
  doneSteps: string[]
  startedQuests: string[]
  doneQuests: string[]
  /** quest notices already shown, so loading does not repeat them */
  announced: string[]
  /** doors already gone through (older saves: none) */
  passedDoors?: string[]
}

function readSave(key: string): SavedGame | null {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? "null")
    return data?.v === 1 ? (data as SavedGame) : null
  } catch {
    return null
  }
}

export function PlayMode({ onExit }: { onExit: () => void }) {
  const { project } = useGameStore()
  if (!project) return null
  return <GamePlayer project={project} onExit={onExit} devTools />
}

/**
 * The game runtime. Used by the editor's play view and by the exported standalone
 * HTML player (which has no editor to exit to, so `onExit` is optional).
 */
export function GamePlayer({
  project,
  onExit,
  devTools = false,
}: {
  project: GameProject
  onExit?: () => void
  /** Editor-only helpers (D: debug overlay). Off in the exported game. */
  devTools?: boolean
}) {
  const startId = project.startSceneId ?? project.scenes[0]?.id ?? null
  const [sceneId, setSceneId] = useState<string | null>(startId)
  const scene = project.scenes.find((s) => s.id === sceneId) ?? null

  const [pos, setPos] = useState(scene?.characterStart ?? { x: 0.5, y: 0.8 })
  const pivotX = project.character.pivotX ?? 0.5
  const pivotY = project.character.pivotY ?? 1
  const targetRef = useRef<{ x: number; y: number } | null>(null)
  const routeRef = useRef<Array<{ x: number; y: number }>>([])
  // What to do on arrival after walking to an object / hotspot.
  const walkTargetRef = useRef<(() => void) | null>(null)
  const [walking, setWalking] = useState(false)
  const [frame, setFrame] = useState(0)
  // Direction the character faces (picks the per-direction animation, or mirrors it).
  const startDir: CharacterDirection = (project.character.startFacing ?? 1) === -1 ? "left" : "right"
  const [dir, setDir] = useState<CharacterDirection>(startDir)
  const dirRef = useRef<CharacterDirection>(startDir)
  const lastHorizontalRef = useRef<"right" | "left">(startDir === "left" ? "left" : "right")
  function faceTo(d: CharacterDirection) {
    if (d === "left" || d === "right") lastHorizontalRef.current = d
    if (d === dirRef.current) return
    dirRef.current = d
    setDir(d)
  }
  const verticalAngle = project.character.verticalAngle ?? DEFAULT_VERTICAL_ANGLE
  const verticalAngleRef = useRef(verticalAngle)
  verticalAngleRef.current = verticalAngle
  /** Face along a move. Steep moves show up/down, or the side view when there is none, so they
   *  must still take their side from the move: otherwise going down-left after facing right
   *  walks backwards. */
  function faceMove(dx: number, dy: number) {
    if (Math.abs(dx) > 0.002) lastHorizontalRef.current = dx < 0 ? "left" : "right"
    faceTo(directionFromVector(dx, dy, verticalAngleRef.current))
  }
  const faceMoveRef = useRef(faceMove)
  faceMoveRef.current = faceMove
  const faceTargetRef = useRef<(mode: FaceOnArrive | undefined, x: number) => void>(() => {})
  /** Turn to what the character is about to use: towards its middle, or the side it asks for. */
  function faceTarget(mode: FaceOnArrive | undefined, targetX: number) {
    const m = mode ?? "auto"
    if (m === "none") return
    if (m !== "auto") return faceTo(m)
    const dx = targetX - posRef.current.x
    if (Math.abs(dx) > 0.01) faceTo(dx < 0 ? "left" : "right")
  }
  faceTargetRef.current = faceTarget

  // Inventory and flags also live in refs, updated synchronously, so a dialog line can check
  // a condition set by the effect applied just before it (state updates land a render later).
  const [inventory, setInventoryState] = useState<string[]>([])
  const inventoryRef = useRef<string[]>([])
  const setInventory = (v: string[] | ((prev: string[]) => string[])) => {
    const next = typeof v === "function" ? v(inventoryRef.current) : v
    inventoryRef.current = next
    setInventoryState(next)
  }
  const [collected, setCollected] = useState<string[]>([])
  const [dialog, setDialog] = useState<{ dialogId: string; idx: number } | null>(null)
  const [flags, setFlagsState] = useState<Record<string, boolean>>({})
  const flagsRef = useRef<Record<string, boolean>>({})
  const setFlags = (v: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => {
    const next = typeof v === "function" ? v(flagsRef.current) : v
    flagsRef.current = next
    setFlagsState(next)
  }
  const [usedChoices, setUsedChoices] = useState<string[]>([])
  const [gameEnded, setGameEnded] = useState<{ message: string } | null>(null)
  const [muted, setMuted] = useState(false)
  // Short on-screen message (blocked hotspot without dialog, item picked up).
  const [notices, setNotices] = useState<Array<{ text: string; id: number }>>([])
  const noticeSeq = useRef(0)
  // Quest progress
  const [visitedScenes, setVisitedScenes] = useState<string[]>(startId ? [startId] : [])
  const visitedRef = useRef(visitedScenes)
  visitedRef.current = visitedScenes
  const [doneSteps, setDoneSteps] = useState<string[]>([])
  const [startedQuests, setStartedQuests] = useState<string[]>([])
  const [doneQuests, setDoneQuests] = useState<string[]>([])
  const [journalOpen, setJournalOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  // Doors (hotspots whose dialog changes scene) already gone through: next time, straight there.
  const [passedDoors, setPassedDoors] = useState<string[]>([])
  const pendingDoorRef = useRef<string | null>(null)
  // Debug overlay (key D): walkable areas, last click and where it was snapped to.
  const [debugOverlay, setDebugOverlay] = useState(false)
  const dialogBoxRef = useRef<DialogBoxHandle>(null)
  const [lastMove, setLastMove] = useState<{ click: Point; target: Point } | null>(null)
  const [hover, setHover] = useState<{ id: string; name: string; x: number; y: number } | null>(null)
  const audioRef = useRef(getAudioEngine())
  // What plays now, per channel: the sound id and its play id.
  const playingRef = useRef<Record<"music" | "ambient", { soundId: string; playId: string } | null>>({ music: null, ambient: null })
  const [soundsReady, setSoundsReady] = useState(0)

  const stageRef = useRef<HTMLDivElement>(null)
  const [stageHeight, setStageHeight] = useState(0)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const posRef = useRef(pos)
  posRef.current = pos
  // Cinematics waiting to be shown, in order; `n` tells apart two plays of the same one.
  const [cineQueue, setCineQueue] = useState<Array<{ id: string; n: number }>>([])
  const cineSeq = useRef(0)
  function playCinematic(id: string | null | undefined) {
    if (!id || !project.cinematics?.some((c) => c.id === id)) return
    setCineQueue((q) => [...q, { id, n: ++cineSeq.current }])
  }
  const playCinematicRef = useRef(playCinematic)
  playCinematicRef.current = playCinematic
  // A cinematic deleted from the project while queued would block the queue.
  useEffect(() => {
    if (cineQueue[0] && !project.cinematics?.some((c) => c.id === cineQueue[0].id)) setCineQueue((q) => q.slice(1))
  }, [cineQueue, project.cinematics])
  // Title screen and credits roll, over the stage. With a title screen the game waits on it.
  const [screen, setScreen] = useState<"title" | "credits" | null>(project.titleScreen ? "title" : null)
  // The intro, once per new game (the ref keeps React's double mount in dev from queueing it twice).
  // With a title screen it plays from «Nueva partida» instead.
  const introShownRef = useRef(false)
  useEffect(() => {
    if (introShownRef.current || project.titleScreen) return
    introShownRef.current = true
    playCinematicRef.current(project.introCinematicId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Interludes: where the player was before one started, to put them back when it ends.
  const returnRef = useRef<{ sceneId: string; pos: Point; dir: CharacterDirection } | null>(null)
  const cutscenePlayedRef = useRef<string | null>(null)
  // Objects with stops: where each one is headed and until when it walks there.
  const roamRef = useRef<Record<string, { x: number; y: number; until: number; dur: number; left: boolean }>>({})
  const [roamTick, setRoamTick] = useState(0)
  // The animation loop is set up once: read the current scene through a ref.
  const sceneRef = useRef(scene)
  sceneRef.current = scene

  const triggerActionRef = useRef(triggerObjectAction)
  triggerActionRef.current = triggerObjectAction
  const triggerHotspotRef = useRef(triggerHotspot)
  triggerHotspotRef.current = triggerHotspot

  // Animation loop for walking.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const target = targetRef.current
      if (target) {
        const cur = posRef.current
        const dx = target.x - cur.x
        const dy = target.y - cur.y
        const dist = Math.hypot(dx, dy)
        const liveScale = getDepthLook(cur, sceneRef.current?.depthWaypoints ?? []).scale
        const depthSpeedFactor = Math.max(0.35, Math.min(1.25, liveScale))
        const sceneSpeed = sceneRef.current?.walkSpeed ?? 1
        const step = WALK_SPEED * sceneSpeed * depthSpeedFactor * dt
        if (dist <= step || dist < 0.005) {
          const queued = routeRef.current.shift() ?? null
          if (queued) {
            setPos(target)
            targetRef.current = queued
            faceMoveRef.current(queued.x - target.x, queued.y - target.y)
          } else {
            setPos(target)
            targetRef.current = null
            setWalking(false)
            // Run the action of the object / hotspot the character was walking to
            const onArrive = walkTargetRef.current
            if (onArrive) {
              walkTargetRef.current = null
              onArrive()
            }
          }
        } else {
          faceMoveRef.current(dx, dy)
          setPos({ x: cur.x + (dx / dist) * step, y: cur.y + (dy / dist) * step })
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Walk frame cycling.
  useEffect(() => {
    if (!walking) return
    // Steps keep pace with the scene speed, so the feet don't slide when walking faster/slower.
    const frameMs = Math.max(40, (project.character.walkFrameMs ?? DEFAULT_FRAME_MS) / (scene?.walkSpeed ?? 1))
    const id = setInterval(() => setFrame((f) => f + 1), frameMs)
    return () => clearInterval(id)
  }, [walking, project.character.walkFrameMs, scene?.walkSpeed])

  // Load sounds on mount; scene audio starts once they are decoded.
  useEffect(() => {
    const audio = audioRef.current
    const sounds = project.sounds ?? []
    Promise.all(
      sounds.map((s) =>
        audio.loadSound({ id: s.id, name: s.name, dataUrl: s.dataUrl, volume: s.volume, loop: s.loop }).catch(() => {}),
      ),
    ).then(() => setSoundsReady((n) => n + 1))
  }, [project.sounds])

  // Browsers keep audio suspended until the player interacts: resume on the first gesture.
  useEffect(() => {
    const resume = () => audioRef.current.resume()
    window.addEventListener("pointerdown", resume)
    window.addEventListener("keydown", resume)
    return () => {
      window.removeEventListener("pointerdown", resume)
      window.removeEventListener("keydown", resume)
    }
  }, [])

  // Music and ambience of the scene. A track shared with the previous scene keeps playing
  // instead of starting over; a different one fades out.
  useEffect(() => {
    if (!scene) return
    const audio = audioRef.current
    // the title screen and the credits bring their own music, without the scene's ambience
    const wanted =
      screen === "title"
        ? { music: project.titleScreen?.musicTrackId ?? null, ambient: null }
        : screen === "credits"
          ? { music: project.credits?.musicTrackId ?? scene.musicTrackId ?? null, ambient: null }
          : { music: scene.musicTrackId ?? null, ambient: scene.ambientSoundId ?? null }
    for (const channel of ["music", "ambient"] as const) {
      const now = playingRef.current[channel]
      if (now && now.soundId === wanted[channel]) continue
      if (now) audio.fadeOut(now.playId, 600)
      playingRef.current[channel] = null
      const id = wanted[channel]
      if (id && audio.isLoaded(id)) {
        const playId = audio.play(id)
        if (playId) playingRef.current[channel] = { soundId: id, playId }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id, soundsReady, screen])

  // Sync mute state to audio engine
  useEffect(() => {
    audioRef.current.muted = muted
  }, [muted])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current.stopAll()
    }
  }, [])

  /** Change scene. Coming from another scene, the character appears by the door that leads
   *  back there (the closest point of the walk graph), looking into the room. */
  const goToScene = useCallback(
    (id: string, opts: { atStart?: boolean; at?: Point | null } = {}) => {
      const next = project.scenes.find((s) => s.id === id)
      if (!next) return
      const from = sceneRef.current?.id
      const entry = !opts.atStart && from && from !== id ? doorEntry(project, next, from) : null
      // first time here: its cinematic
      if (next.enterCinematicId && !visitedRef.current.includes(id)) playCinematicRef.current(next.enterCinematicId)
      if (!next.cutscene) returnRef.current = null
      else if (from && !sceneRef.current?.cutscene) returnRef.current = { sceneId: from, pos: posRef.current, dir: dirRef.current }
      roamRef.current = {}
      setSceneId(id)
      setVisitedScenes((v) => (v.includes(id) ? v : [...v, id]))
      targetRef.current = null
      routeRef.current = []
      setWalking(false)
      setPos(opts.at ?? entry?.pos ?? next.characterStart)
      faceTo(opts.at ? (opts.at.x < 0.5 ? "right" : "left") : (entry?.dir ?? startDir))
    },
    [project, project.character.startFacing],
  )

  // Items just obtained, shown big one after the other.
  const [gotItems, setGotItems] = useState<Array<{ item: InventoryItem; id: number }>>([])
  function announceItem(item: InventoryItem) {
    if (project.pickupSoundId) audioRef.current.play(project.pickupSoundId)
    const id = ++noticeSeq.current
    setGotItems((q) => [...q, { item, id }])
  }

  function showNotice(text: string) {
    const id = ++noticeSeq.current
    setNotices((n) => [...n.slice(-2), { text, id }])
    window.setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 2600)
  }

  function triggerHotspot(h: Hotspot) {
    // Check if hotspot is locked by a required item.
    const missingItem = !!h.requiresItem && !inventory.includes(h.requiresItem)
    const missingFlag = !!h.requiresFlag && !flags[h.requiresFlag]
    if (missingItem || missingFlag) {
      if (!openDialog(h.blockedDialog)) {
        const needed = missingItem ? project.items.find((i) => i.id === h.requiresItem) : null
        showNotice(needed ? `Necesitas: ${needed.name}` : "Todavía no puedes usar esto")
      }
      return
    }

    // Consume item if specified.
    if (h.consumesItem && inventory.includes(h.consumesItem)) {
      setInventory((inv) => inv.filter((id) => id !== h.consumesItem))
    }

    switch (h.action.type) {
      case "goToScene":
        // Play SFX if configured
        if (h.action.sfxId) audioRef.current.play(h.action.sfxId)
        else if (project.doorSoundId) audioRef.current.play(project.doorSoundId)
        if (h.action.targetSceneId) goToScene(h.action.targetSceneId)
        break
      case "dialog": {
        // Play SFX if configured
        if (h.action.sfxId) audioRef.current.play(h.action.sfxId)
        // A door already gone through: no need to hear about it again.
        const door = dialogExit(project, h.action.dialogId)
        if (door && h.directAfterFirstPass !== false && passedDoors.includes(h.id)) {
          if (project.doorSoundId) audioRef.current.play(project.doorSoundId)
          goToScene(door.sceneId, { at: door.at })
          break
        }
        openDialog(h.action.dialogId)
        pendingDoorRef.current = door ? h.id : null
        break
      }
      case "pickup": {
        // Play SFX if configured
        if (h.action.sfxId) audioRef.current.play(h.action.sfxId)
        const item = project.items.find((i) => i.id === h.action.itemId)
        if (item && !inventory.includes(item.id)) {
          setInventory((inv) => [...inv, item.id])
          setCollected((c) => [...c, item.id])
          announceItem(item)
        }
        break
      }
      case "endGame": {
        // Play SFX if configured
        if (h.action.sfxId) audioRef.current.play(h.action.sfxId)
        setGameEnded({
          message: h.action.endGameText || "Game Complete!",
        })
        break
      }
      default:
        // no-op
    }
  }
  function pointInHotspot(p: Point, h: Hotspot): boolean {
    // Get polygon points - migrate legacy x/y/width/height if needed
    const points = h.points ?? rectToPolygon(
      (h as unknown as { x: number }).x ?? 0.4,
      (h as unknown as { y: number }).y ?? 0.4,
      (h as unknown as { width: number }).width ?? 0.2,
      (h as unknown as { height: number }).height ?? 0.2,
    )
    return pointInPolygon(p, points)
  }

  const gameState = () => ({ flags: flagsRef.current, inventory: inventoryRef.current })

  function hotspotAt(p: Point): Hotspot | null {
    for (const h of scene?.hotspots ?? []) {
      if (h.hideWhenCollected && collected.includes(h.action.itemId ?? "")) continue
      if (!conditionHolds(h.visibleIf, gameState())) continue
      if (pointInHotspot(p, h)) return h
    }
    return null
  }

  function onStageMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (gameEnded || dialog) {
      if (hover) setHover(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const p = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
    const h = hotspotAt(p)
    if (!h) {
      if (hover) setHover(null)
      return
    }
    setHover({ id: h.id, name: h.name, x: p.x, y: p.y })
  }

  function onCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (dialog) {
      // While a line is shown, a click anywhere in the scene advances it (choices still need a pick).
      dialogBoxRef.current?.advance()
      return
    }
    if (!scene || gameEnded || scene.cutscene) return
    walkTargetRef.current = null
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const clickPoint: Point = { x, y }

    // 1. Hotspots
    for (const h of scene.hotspots ?? []) {
      if (h.hideWhenCollected && collected.includes(h.action.itemId ?? "")) continue
      if (!conditionHolds(h.visibleIf, gameState())) continue
      if (pointInHotspot(clickPoint, h)) {
        if (h.walkToFirst) walkToHotspot(h, clickPoint)
        else {
          faceTarget(h.faceOnArrive, hotspotCenterX(h))
          triggerHotspot(h)
        }
        return
      }
    }

    // 2. Movement along the depth graph (or straight to the click when the scene has none)
    walkTo(clickPoint)
  }

  /**
   * Walk the character to `target`: along the depth graph lines when the scene has one
   * (the click is projected onto the nearest line), otherwise straight to it.
   * Returns false when the graph has no way there.
   */
  function walkTo(target: Point): boolean {
    if (!scene) return false
    const route = planRoute(scene.depthWaypoints ?? [], posRef.current, target)
    if (!route) {
      showNotice("No hay camino hasta ahí")
      return false
    }
    setLastMove({ click: target, target: route[route.length - 1] })
    targetRef.current = route[0]
    routeRef.current = route.slice(1)
    setWalking(true)
    faceMove(route[0].x - posRef.current.x, route[0].y - posRef.current.y)
    return true
  }

  function onObjectClick(e: React.MouseEvent, obj: SceneObject) {
    if (gameEnded || dialog) return
    e.stopPropagation()
    walkTargetRef.current = null
    if (obj.interactionMode === "click") {
      faceTarget(obj.faceOnArrive, obj.x)
      triggerObjectAction(obj)
    } else if (obj.interactionMode === "walk") setWalkTarget(obj)
  }

  function triggerObjectAction(obj: SceneObject) {
      const action = obj.action
      if (!action) return
      // Play SFX if configured
      if (obj.sfxId) {
        audioRef.current.play(obj.sfxId)
      }
      if (action.type === "goToScene") {
        if (action.targetSceneId) goToScene(action.targetSceneId)
      } else if (action.type === "dialog") {
        openDialog(action.dialogId)
      } else if (action.type === "pickup") {
        const item = project.items.find((i) => i.id === action.itemId)
        if (item && !inventory.includes(item.id)) {
          setInventory((inv) => [...inv, item.id])
          setCollected((c) => [...c, item.id])
          announceItem(item)
        }
      } else if (action.type === "endGame") {
        setGameEnded({ message: action.endGameText ?? "Game Complete!" })
      }
      // consume item if specified
      if (action.consumesItem && inventory.includes(action.consumesItem)) {
        setInventory((inv) => inv.filter((id) => id !== action.consumesItem))
      }
    }

    function setWalkTarget(obj: SceneObject) {
      if (!scene) return
      const spot = objectSpot(obj, { flags, inventory })
      let x = spot.x
      if (obj.speaker || obj.animation) {
        // a character: stand beside it (its drawn width, in stage widths), not on top of it
        const a = project.assets.find((as) => as.id === obj.assetId)
        const half = (0.18 * obj.scale * ((a?.width ?? 1) / Math.max(1, a?.height ?? 1)) * (9 / 16)) / 2
        x = besideX(spot.x - half, spot.x + half, posRef.current.x)
      }
      const target: Point = obj.stops?.length ? { x, y: spot.y } : obj.standAt ?? { x, y: obj.y }
      // Already there: act right away.
      if (Math.hypot(target.x - posRef.current.x, target.y - posRef.current.y) < 0.005) {
        targetRef.current = null
        faceTarget(obj.faceOnArrive, obj.x)
        triggerObjectAction(obj)
        return
      }
      if (walkTo(target))
        walkTargetRef.current = () => {
          faceTargetRef.current(obj.faceOnArrive, obj.x)
          triggerActionRef.current(obj)
        }
    }

  /** Walk up to a hotspot (its lower edge, under the click) and act on arrival. */
  function walkToHotspot(h: Hotspot, click: Point) {
    const pts = h.points ?? []
    const bottom = pts.length ? Math.max(...pts.map((p) => p.y)) : click.y
    const xs = pts.map((p) => p.x)
    // Someone stands there (a character drawn as an object): stop beside them, on the side the
    // character comes from, instead of walking into them.
    const person = xs.length > 0 && (scene?.sceneObjects ?? []).some(
      (o) => (o.speaker || o.animation) && o.x >= Math.min(...xs) && o.x <= Math.max(...xs),
    )
    const x = person ? besideX(Math.min(...xs), Math.max(...xs), posRef.current.x) : click.x
    const target: Point = h.standAt ?? { x, y: Math.min(0.99, bottom) }
    // Already close enough: act right away.
    if (Math.hypot(target.x - posRef.current.x, target.y - posRef.current.y) < 0.06) {
      targetRef.current = null
      faceTarget(h.faceOnArrive, hotspotCenterX(h))
      triggerHotspot(h)
      return
    }
    if (walkTo(target))
      walkTargetRef.current = () => {
        faceTargetRef.current(h.faceOnArrive, hotspotCenterX(h))
        triggerHotspotRef.current(h)
      }
  }

  // --- Dialog engine: branching lines, player choices and their effects ---

  const playerState = { flags, inventory, usedChoices, sceneId }
  const activeDialog = dialog ? project.dialogs.find((d) => d.id === dialog.dialogId) ?? null : null
  const activeLine = activeDialog?.lines[dialog!.idx]
  const activeChoices = availableChoices(activeLine, playerState)

  /** Apply effects; returns true when one of them closed the dialog (scene change / game end). */
  function applyEffects(effects: GameEffect[] | undefined): boolean {
    let closed = false
    for (const fx of effects ?? []) {
      if (fx.type === "setFlag" && fx.flag) {
        setFlags((f) => ({ ...f, [fx.flag]: fx.value }))
      } else if (fx.type === "giveItem") {
        const item = project.items.find((i) => i.id === fx.itemId)
        if (!item) continue
        setInventory((inv) => (inv.includes(item.id) ? inv : [...inv, item.id]))
        setCollected((c) => (c.includes(item.id) ? c : [...c, item.id]))
        announceItem(item)
      } else if (fx.type === "removeItem") {
        setInventory((inv) => inv.filter((id) => id !== fx.itemId))
      } else if (fx.type === "goToScene" && fx.sceneId) {
        const door = pendingDoorRef.current
        if (door) setPassedDoors((d) => (d.includes(door) ? d : [...d, door]))
        if (door && project.doorSoundId) audioRef.current.play(project.doorSoundId)
        pendingDoorRef.current = null
        setDialog(null)
        goToScene(fx.sceneId, { at: fx.at })
        closed = true
      } else if (fx.type === "endGame") {
        setDialog(null)
        setGameEnded({ message: fx.text || "Game Complete!" })
        closed = true
      } else if (fx.type === "playCinematic") {
        playCinematic(fx.cinematicId)
      }
    }
    return closed
  }

  function enterLine(dialogId: string, startIdx: number) {
    const dl = project.dialogs.find((d) => d.id === dialogId)
    // Lines whose condition doesn't hold are skipped, in order.
    let idx = startIdx
    while (dl?.lines[idx] && !isLineVisible(dl.lines[idx], { flags: flagsRef.current, inventory: inventoryRef.current })) idx++
    const line = dl?.lines[idx]
    if (!line) {
      setDialog(null)
      return
    }
    setDialog({ dialogId, idx })
    // Scene changes and game endings wait until the player advances past the line,
    // so its text can be read ("RIPMAN shows the ticket…" before the door opens).
    applyEffects(line.effects?.filter((fx) => fx.type !== "goToScene" && fx.type !== "endGame" && fx.type !== "playCinematic"))
  }

  /** Start a dialog by id; returns false when it doesn't exist or is empty. */
  function openDialog(dialogId: string | null | undefined): boolean {
    const dl = project.dialogs.find((d) => d.id === dialogId)
    if (!dl?.lines.length) return false
    enterLine(dl.id, 0)
    return true
  }

  function nextDialog() {
    if (!dialog || !activeDialog || !activeLine) return
    // A branch waits for the player to pick a choice.
    if (activeChoices.length > 0) return
    // Deferred scene change / game end of this line (see enterLine).
    // A cinematic also waits for the line to be read: it then covers the scene change, if any.
    const leaving = activeLine.effects?.filter((fx) => fx.type === "goToScene" || fx.type === "endGame" || fx.type === "playCinematic")
    if (leaving?.length && applyEffects(leaving)) return
    const to = resolveNext(activeDialog, dialog.idx, activeLine.next)
    if (to === null) setDialog(null)
    else enterLine(activeDialog.id, to)
  }

  /** The close button: stops the conversation right there, as if it had ended. */
  function closeDialog() {
    setDialog(null)
  }

  function chooseOption(choice: DialogChoice) {
    if (!dialog || !activeDialog) return
    if (choice.once) setUsedChoices((u) => [...u, choice.id])
    if (applyEffects(choice.effects)) return
    const to = resolveNext(activeDialog, dialog.idx, choice.next ?? "end")
    if (to === null) setDialog(null)
    else enterLine(activeDialog.id, to)
  }

  // --- Quests: start, complete steps and grant rewards as the game state changes ---
  const quests = project.quests ?? NO_QUESTS
  const questWorld: QuestWorld = { flags, inventory, visitedScenes }
  // What was already announced, updated synchronously: the effect can run twice before the
  // started/done state lands (React StrictMode in dev), which used to duplicate the notices.
  const announcedRef = useRef(new Set<string>())

  useEffect(() => {
    const announce = (key: string, text: string) => {
      if (announcedRef.current.has(key)) return
      announcedRef.current.add(key)
      messages.push(text)
    }
    const started: string[] = []
    const steps: string[] = []
    const done: string[] = []
    const rewards: GameEffect[] = []
    const messages: string[] = []
    for (const q of quests) {
      if (!questStarted(q, questWorld)) continue
      if (!startedQuests.includes(q.id)) {
        started.push(q.id)
        announce(`start:${q.id}`, `Nuevo objetivo: ${q.title}`)
      }
      if (doneQuests.includes(q.id)) continue
      let all = q.steps.length > 0
      for (const st of q.steps) {
        const latched = doneSteps.includes(st.id)
        const met = latched || conditionMet(st.when, questWorld)
        if (met && !latched) {
          steps.push(st.id)
          if (q.steps.length > 1) announce(`step:${st.id}`, `✓ ${st.text}`)
        }
        if (!met) all = false
      }
      if (all) {
        done.push(q.id)
        // Rewards are granted once, with the announcement.
        if (!announcedRef.current.has(`done:${q.id}`)) rewards.push(...(q.rewards ?? []))
        announce(`done:${q.id}`, `Objetivo completado: ${q.title}`)
      }
    }
    if (started.length) setStartedQuests((x) => [...x, ...started])
    if (steps.length) setDoneSteps((x) => [...x, ...steps])
    if (done.length) setDoneQuests((x) => [...x, ...done])
    messages.forEach(showNotice)
    if (rewards.length) applyEffects(rewards)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flags, inventory, visitedScenes, quests])

  // --- Saved game: one slot per project in this browser (also in the exported game) ---
  const saveKey = `pixelquest-save:${project.id}`
  const [savedAt, setSavedAt] = useState<number | null>(() => readSave(saveKey)?.savedAt ?? null)

  function saveGame() {
    if (!sceneId || dialog || gameEnded || cineQueue.length || screen) return
    const data: SavedGame = {
      v: 1,
      savedAt: Date.now(),
      sceneId,
      pos,
      dir: dirRef.current,
      inventory: inventoryRef.current,
      collected,
      flags: flagsRef.current,
      usedChoices,
      visitedScenes,
      doneSteps,
      startedQuests,
      doneQuests,
      announced: [...announcedRef.current],
      passedDoors,
    }
    try {
      localStorage.setItem(saveKey, JSON.stringify(data))
      setSavedAt(data.savedAt)
      showNotice("Partida guardada")
    } catch {
      showNotice("No se pudo guardar la partida")
    }
  }

  function loadGame() {
    const data = readSave(saveKey)
    const target = data && project.scenes.find((sc) => sc.id === data.sceneId)
    if (!data || !target) {
      showNotice("No hay ninguna partida guardada")
      return
    }
    announcedRef.current = new Set(data.announced)
    setGameEnded(null)
    setDialog(null)
    setJournalOpen(false)
    setInventoryOpen(false)
    setInventory(data.inventory)
    setCollected(data.collected)
    setFlags(data.flags)
    setUsedChoices(data.usedChoices)
    setVisitedScenes(data.visitedScenes)
    setDoneSteps(data.doneSteps)
    setStartedQuests(data.startedQuests)
    setDoneQuests(data.doneQuests)
    setPassedDoors(data.passedDoors ?? [])
    returnRef.current = null
    roamRef.current = {}
    setCineQueue([])
    setScreen(null)
    setSceneId(target.id)
    targetRef.current = null
    routeRef.current = []
    walkTargetRef.current = null
    setWalking(false)
    setPos(data.pos)
    faceTo(data.dir)
    showNotice("Partida cargada")
  }

  function restartGame() {
    announcedRef.current = new Set()
    setGameEnded(null)
    setDialog(null)
    setInventory([])
    setCollected([])
    setFlags({})
    setUsedChoices([])
    setVisitedScenes(startId ? [startId] : [])
    setDoneSteps([])
    setStartedQuests([])
    setDoneQuests([])
    setJournalOpen(false)
    setPassedDoors([])
    returnRef.current = null
    setCineQueue([])
    setScreen(null)
    goToScene(startId!, { atStart: true })
    playCinematic(project.introCinematicId)
  }

  // Keyboard handlers read the latest closures through a ref.
  const keyActions = useRef({ nextDialog, chooseOption, restartGame, choices: activeChoices, inCinematic: false })
  keyActions.current = { nextDialog, chooseOption, restartGame, choices: activeChoices, inCinematic: cineQueue.length > 0 || screen !== null }

  // Keyboard handler for dialog advancement and common actions
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const actions = keyActions.current
      if (actions.inCinematic) return
      if (dialog) {
        const n = Number(e.key)
        if (actions.choices.length > 0 && n >= 1 && n <= actions.choices.length) {
          e.preventDefault()
          actions.chooseOption(actions.choices[n - 1])
        } else if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
          e.preventDefault()
          dialogBoxRef.current?.advance()
        }
        return
      }
      if (gameEnded) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          actions.restartGame()
        }
        return
      }
      if (e.key === "j" || e.key === "J") setJournalOpen((o) => !o)
      if (e.key === "i" || e.key === "I") setInventoryOpen((o) => !o)
      if (devTools && (e.key === "d" || e.key === "D")) setDebugOverlay((o) => !o)
      if (e.key === "Escape") {
        setJournalOpen(false)
        setInventoryOpen(false)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [dialog, gameEnded])

  // Interludes play their dialog on entering and, once it ends, put the player back where they were.
  useEffect(() => {
    if (!scene?.cutscene) {
      cutscenePlayedRef.current = null
      return
    }
    if (dialog) return
    if (cutscenePlayedRef.current !== scene.id) {
      cutscenePlayedRef.current = scene.id
      if (openDialog(scene.cutscene.dialogId)) return
    }
    cutscenePlayedRef.current = null
    const back = returnRef.current
    returnRef.current = null
    if (!back || !project.scenes.some((s) => s.id === back.sceneId)) return goToScene(startId!, { atStart: true })
    setSceneId(back.sceneId)
    targetRef.current = null
    routeRef.current = []
    walkTargetRef.current = null
    setWalking(false)
    setPos(back.pos)
    faceTo(back.dir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id, dialog])

  // Objects with stops: once a render shows one heading somewhere new, remember where and for how long.
  useEffect(() => {
    for (const o of scene?.sceneObjects ?? []) {
      if (!o.stops?.length) continue
      const spot = objectSpot(o, { flags, inventory })
      const prev = roamRef.current[o.id]
      if (prev && prev.x === spot.x && prev.y === spot.y) continue
      if (!prev) {
        roamRef.current[o.id] = { ...spot, until: 0, dur: 0, left: !!o.flipX }
        continue
      }
      const dur = Math.hypot(spot.x - prev.x, spot.y - prev.y) / WALK_SPEED
      roamRef.current[o.id] = { ...spot, until: performance.now() + dur * 1000, dur, left: spot.x < prev.x }
      window.setTimeout(() => setRoamTick((t) => t + 1), dur * 1000 + 30)
    }
  })
  // While one walks, step its frames at the protagonist's pace.
  useEffect(() => {
    if (!Object.values(roamRef.current).some((r) => r.until > performance.now())) return
    const id = window.setTimeout(() => setRoamTick((t) => t + 1), project.character.walkFrameMs ?? DEFAULT_FRAME_MS)
    return () => window.clearTimeout(id)
  })

  // A conversation takes the screen: the inventory steps aside.
  useEffect(() => {
    if (dialog) setInventoryOpen(false)
    // a door dialog closed before it opened the door: it plays again next time
    else pendingDoorRef.current = null
  }, [dialog])

  if (!scene) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <p className="text-center text-white">No hay escena inicial</p>
      </div>
    )
  }

  const bgId =
    [...(scene.backgroundVariants ?? [])].reverse().find((v) => conditionHolds(v.when, { flags, inventory }))?.assetId ??
    scene.backgroundAssetId
  const bgAsset = project.assets.find((a) => a.id === bgId)
  const inCutscene = !!scene.cutscene
  const anim = resolveAnimation(project.character, dir, lastHorizontalRef.current)
  const idleAsset = project.assets.find((a) => a.id === anim.idleAssetId)
  const walkAssets = anim.walkAssetIds
    .map((id) => project.assets.find((a) => a.id === id))
    .filter(Boolean)

  const currentWalkFrame = frame % Math.max(walkAssets.length, 1)
  const walkAsset = walkAssets[currentWalkFrame] ?? idleAsset
  const showingWalk = walking && walkAssets.length > 0
  const charAsset = walking ? walkAsset : idleAsset
  const mirrored = showingWalk ? anim.walkMirror : anim.idleMirror
  const sceneObjects = (scene.sceneObjects ?? [])
    .map((obj, depthIndex) => ({ obj, depthIndex, asset: project.assets.find((a) => a.id === obj.assetId) }))
    .filter((x): x is { obj: NonNullable<typeof scene.sceneObjects>[number]; depthIndex: number; asset: NonNullable<typeof idleAsset> } => !!x.asset)
  const characterSlot = Math.max(0, Math.min(sceneObjects.length, scene.characterLayerZ ?? 0))
  const layerEntries: Array<
    | { type: "object"; entry: (typeof sceneObjects)[number] }
    | { type: "character" }
  > = []
  for (let i = 0; i <= sceneObjects.length; i++) {
    if (i === characterSlot) layerEntries.push({ type: "character" })
    if (i < sceneObjects.length && !sceneObjects[i].obj.depthSort) layerEntries.push({ type: "object", entry: sceneObjects[i] })
  }
  // Depth-sorted objects go right in front of the character when their base is lower on screen
  // than its feet, and right behind it otherwise.
  for (const entry of sceneObjects.filter((x) => x.obj.depthSort)) {
    const at = layerEntries.findIndex((e) => e.type === "character")
    layerEntries.splice(objectSpot(entry.obj, { flags, inventory }).y > pos.y ? at + 1 : at, 0, { type: "object", entry })
  }
  const characterLayerOrder = layerEntries.findIndex((e) => e.type === "character")
  const look = getDepthLook(pos, scene.depthWaypoints ?? [])
  const depthScale = (project.character.scaleWithDepth ?? true) ? look.scale : 1

  const inventoryIcon = project.inventoryIconAssetId ? project.assets.find((a) => a.id === project.inventoryIconAssetId) : null
  const owned = inventory
    .map((id) => project.items.find((i) => i.id === id))
    .filter((item): item is InventoryItem => !!item)
  // Quick-access items (the phone) get their own button beside the bag instead of a slot in it.
  const invItems = owned.filter((item) => !item.quickAccess)
  const quickItems = owned.filter((item) => item.quickAccess && item.useDialogId)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="text-sm font-medium text-foreground">{scene.name}</div>
        <div className="flex items-center gap-2">
          {quests.length > 0 && (
            <Button
              size="sm"
              variant={journalOpen ? "secondary" : "ghost"}
              onClick={() => setJournalOpen((o) => !o)}
              title="Objetivos (J)"
            >
              <BookOpen className="size-4" /> Objetivos
              {quests.some((q) => startedQuests.includes(q.id) && !doneQuests.includes(q.id)) && (
                <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
                  {quests.filter((q) => startedQuests.includes(q.id) && !doneQuests.includes(q.id)).length}
                </span>
              )}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setMuted((m) => !m)} title={muted ? "Activar sonido" : "Silenciar"}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={saveGame}
            disabled={!!dialog || !!gameEnded || !!screen || cineQueue.length > 0}
            title={dialog ? "Termina la conversación para guardar" : "Guardar la partida en este navegador"}
          >
            <Save className="size-4" /> Guardar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadGame}
            disabled={!savedAt}
            title={savedAt ? `Cargar la partida guardada (${new Date(savedAt).toLocaleString()})` : "Aún no hay partida guardada"}
          >
            <FolderOpen className="size-4" /> Cargar
          </Button>
          {/* Asked in the game itself: native confirm() boxes are blocked in some embeds. */}
          {confirmRestart ? (
            <div className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs">
              <span className="whitespace-nowrap text-muted-foreground" title="Lo que no hayas guardado se pierde">¿Reiniciar la partida?</span>
              <Button
                size="sm"
                variant="destructive"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setConfirmRestart(false)
                  restartGame()
                }}
              >
                Sí
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setConfirmRestart(false)}>
                No
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmRestart(true)}>
              <RotateCcw className="size-4" /> Reiniciar
            </Button>
          )}
          {onExit && (
            <Button size="sm" variant="ghost" onClick={onExit}>
              <X className="size-4" /> Salir
            </Button>
          )}
        </div>
      </div>

      {/* Main stage: 16:9 like the editor stage, so art, hotspots and clicks share coordinates */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black [container-type:size]">
      <div
        ref={stageRef}
        className="relative aspect-video w-[min(100cqw,calc(100cqh*16/9))] overflow-hidden"
        style={{ cursor: hover ? "pointer" : "crosshair" }}
        onClick={onCanvasClick}
        onMouseMove={onStageMouseMove}
        onMouseLeave={() => setHover(null)}
        role="button"
        tabIndex={0}
      >
        {/* Background */}
        {bgAsset && (
          <img
            src={bgAsset.dataUrl}
            alt="scene"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Scene objects */}
        {sceneObjects.map(({ obj, asset }) => {
          // Taken from the scene (e.g. the chain once it is in the inventory).
          if (obj.hideWhenItem && inventory.includes(obj.hideWhenItem)) return null
          if (!conditionHolds(obj.visibleIf, { flags, inventory })) return null
          const objectHeight = Math.max(24, stageHeight * 0.18 * obj.scale)
          const interactive = obj.interactionMode === "click" || obj.interactionMode === "walk"
          const objectLayerOrder = layerEntries.findIndex((e) => e.type === "object" && e.entry.obj.id === obj.id)
          // With stops it walks to its current spot (see the roaming effect).
          const spot = objectSpot(obj, { flags, inventory })
          const roam = obj.stops?.length ? roamRef.current[obj.id] : undefined
          const heading = !!roam && (roam.x !== spot.x || roam.y !== spot.y)
          const roamDur = heading ? Math.hypot(spot.x - roam!.x, spot.y - roam!.y) / WALK_SPEED : roam?.dur ?? 0
          const roaming = heading || (!!roam && performance.now() < roam.until)
          const roamLeft = heading ? spot.x < roam!.x : roam?.left
          const roamFrames = roaming ? (obj.walkAssetIds ?? []).map((id) => project.assets.find((a) => a.id === id)).filter(Boolean) : []
          const shownAsset = roamFrames.length ? roamFrames[roamTick % roamFrames.length]! : asset
          return (
            <div
              key={obj.id}
              className={interactive && !inCutscene ? "absolute" : "absolute pointer-events-none"}
              onClick={interactive ? (e) => onObjectClick(e, obj) : undefined}
              style={{
                left: `${spot.x * 100}%`,
                top: `${spot.y * 100}%`,
                transition: roam ? `left ${roamDur}s linear, top ${roamDur}s linear` : undefined,
                height: `${objectHeight}px`,
                width: "max-content",
                transform: "translate(-50%, -100%)",
                zIndex: 10 + Math.max(0, objectLayerOrder),
              }}
            >
              {obj.animation || obj.speaker || obj.lit ? (
                <LivingSprite
                  id={obj.id}
                  src={shownAsset.dataUrl}
                  alt={obj.name}
                  animation={roamFrames.length ? null : obj.animation}
                  flipX={roam ? roamLeft : obj.flipX}
                  talking={!!obj.speaker && activeLine?.speaker.trim().toLowerCase() === obj.speaker.trim().toLowerCase()}
                  look={obj.lit ? getDepthLook({ x: obj.x, y: obj.y }, scene.depthWaypoints ?? []) : undefined}
                />
              ) : (
                <img
                  src={shownAsset.dataUrl}
                  alt={obj.name}
                  className="block h-full w-auto max-w-none object-contain"
                  style={{ transform: `scaleX(${(roam ? roamLeft : obj.flipX) ? -1 : 1}) rotate(${obj.rotationDeg ?? 0}deg)` }}
                />
              )}
            </div>
          )
})}


        {/* Ground shadows stretching out from the feet (very subtle), sized to the sprite. */}
        {charAsset && !inCutscene && project.character.shadow && (() => {
          const h = project.character.scale * depthScale // fraction of the stage height
          const unit = h * (charAsset.width / Math.max(1, charAsset.height)) * 0.55 // ≈ figure width, in stage heights
          return (
            <CharacterShadow
              style={{
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                // the stage is 16:9: a width in % of the stage width = stage heights × 9/16
                width: `${unit * 4 * (9 / 16) * 100}%`,
                height: `${unit * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 10 + Math.max(0, characterLayerOrder),
              }}
            />
          )
        })()}

        {/* Character (not in interludes: he is somewhere else) */}
        {charAsset && !inCutscene && (
          <div
            className="pointer-events-none absolute drop-shadow-lg transition-opacity duration-200"
            style={{
              height: `${project.character.scale * depthScale * 100}%`,
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              transform: `translate(${-pivotX * 100}%, ${-pivotY * 100}%) scaleX(${mirrored ? -1 : 1})`,
              zIndex: 10 + Math.max(0, characterLayerOrder),
            }}
          >
            {/* Standing still he breathes; walking, the frames move him. */}
            <LivingSprite
              id="protagonist"
              src={charAsset.dataUrl}
              alt={project.character.name ?? ""}
              animation={showingWalk ? null : "breathe"}
              breathDepth={project.character.breathDepth ?? PROTAGONIST_BREATH}
              breathMs={project.character.breathMs ?? PROTAGONIST_BREATH_MS}
              look={look}
            >
              {/* Worn over the right-facing art: the stage mirror carries it along; a left animation
                  of its own is not mirrored, so the accessory is. */}
              {(project.character.accessories ?? [])
                .filter((acc) => conditionHolds(acc.when, { flags, inventory }))
                .map((acc) => {
                  const img = project.assets.find((a) => a.id === acc.assetId)
                  if (!img) return null
                  const flip = lastHorizontalRef.current === "left" && !mirrored
                  // measured in this very frame, or mirrored from the right-facing position
                  const spot = acc.at?.[charAsset.id] ?? { x: flip ? 1 - acc.x : acc.x, y: acc.y }
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={acc.id}
                      src={img.dataUrl}
                      alt=""
                      draggable={false}
                      className="pointer-events-none absolute max-w-none"
                      style={{
                        left: `${spot.x * 100}%`,
                        top: `${spot.y * 100}%`,
                        height: `${acc.height * 100}%`,
                        transform: `translate(-50%, -50%) scaleX(${flip ? -1 : 1})`,
                      }}
                    />
                  )
                })}
            </LivingSprite>
          </div>
        )}

        {screen === "title" && (
          <TitleScreenView
            project={project}
            canContinue={!!savedAt}
            onNew={restartGame}
            onContinue={loadGame}
            onCredits={() => setScreen("credits")}
          />
        )}
        {/* after the credits: back to the title screen, or to the end screen when there is none */}
        {screen === "credits" && <CreditsRoll project={project} onDone={() => setScreen(project.titleScreen ? "title" : null)} />}

        {/* Story slides over everything (intro, scene entries, the "show cinematic" effect) */}
        {cineQueue[0] && (() => {
          const cine = project.cinematics?.find((c) => c.id === cineQueue[0].id)
          return cine ? (
            <CinematicPlayer key={cineQueue[0].n} cinematic={cine} project={project} onDone={() => setCineQueue((q) => q.slice(1))} />
          ) : null
        })()}

        {/* Interludes: letterbox bars, so it reads as a cut away from the game */}
        {inCutscene && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-[9%] bg-black" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-[9%] bg-black" />
          </>
        )}

{/* Hotspots overlay - visible on hover via subtle highlight */}
        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", zIndex: 50 }}
        >
          {scene?.hotspots.map((h) => {
            const pts = h.points ?? []
            if (pts.length < 2) return null
            const pathData = polygonToSvgPath(pts, 100, 100)
            const itemCollected = h.hideWhenCollected && collected.includes(h.action.itemId ?? "")
            if (itemCollected || !conditionHolds(h.visibleIf, { flags, inventory })) return null
            // Hidden like in the final game (hover shows only the name + hand cursor); all visible in debug (D).
            if (!debugOverlay) return null
            return (
              <g key={h.id}>
                <path
                  d={pathData}
                  fill={hover?.id === h.id ? "rgba(255,200,0,0.3)" : "rgba(255,200,0,0.15)"}
                  stroke="rgba(255,220,0,0.8)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  className="transition-[fill,stroke] duration-150"
                />
              </g>
            )
          })}
        </svg>

        {/* Debug overlay (D) */}
        {debugOverlay && (
          <svg
            className="pointer-events-none absolute inset-0 z-[55]"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ width: "100%", height: "100%" }}
          >
            {(() => {
              const nodes = scene.depthWaypoints ?? []
              return (
                <>
                  {graphEdges(nodes).map(([a, b]) => (
                    <line
                      key={`${a}-${b}`}
                      x1={nodes[a].x * 100}
                      y1={nodes[a].y * 100}
                      x2={nodes[b].x * 100}
                      y2={nodes[b].y * 100}
                      stroke="rgba(56,189,248,0.9)"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {nodes.map((n) => (
                    <circle key={n.id} cx={n.x * 100} cy={n.y * 100} r={0.5} fill="#38bdf8" />
                  ))}
                </>
              )
            })()}
            {lastMove && (
              <>
                <line
                  x1={lastMove.click.x * 100}
                  y1={lastMove.click.y * 100}
                  x2={lastMove.target.x * 100}
                  y2={lastMove.target.y * 100}
                  stroke="white"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={lastMove.click.x * 100} cy={lastMove.click.y * 100} r={0.6} fill="#f87171" />
                <circle cx={lastMove.target.x * 100} cy={lastMove.target.y * 100} r={0.6} fill="#4ade80" />
              </>
            )}
          </svg>
        )}
        {debugOverlay && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-[56] rounded bg-black/75 px-2 py-1 text-[11px] text-white/80">
            Depuración (D):{" "}
            {(scene.depthWaypoints ?? []).length ? (
              <span className="text-sky-400">━ grafo de profundidad</span>
            ) : (
              <span className="text-white/60">sin grafo: movimiento libre</span>
            )}{" "}
            ·{" "}
            <span className="text-amber-300">■ hotspots</span> · <span className="text-red-400">● clic</span> ·{" "}
            <span className="text-green-400">● destino</span>
          </div>
        )}

        {/* Hotspot name next to the cursor */}
        {hover && hover.name && (
          <div
            className="pointer-events-none absolute z-[60] -translate-x-1/2 rounded bg-black/75 px-2 py-0.5 text-xs font-medium text-white shadow"
            style={{ left: `${hover.x * 100}%`, top: `calc(${hover.y * 100}% - 28px)` }}
          >
            {hover.name}
          </div>
        )}

        {/* Short notices (stacked) */}
        {notices.length > 0 && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-[70] flex -translate-x-1/2 flex-col items-center gap-1.5">
            {notices.map((n) => (
              <div
                key={n.id}
                className="rounded-full border border-primary/40 bg-black/80 px-4 py-1.5 text-sm text-white shadow-lg animate-in fade-in slide-in-from-top-2"
              >
                {n.text}
              </div>
            ))}
          </div>
        )}

        {/* Inventory: a button over the scene; it opens floating, so the stage never resizes */}
        {!gameEnded && !inCutscene && (
          <div
            className="absolute bottom-3 left-3 z-[70] flex items-end gap-2"
            onClick={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              title="Inventario (I)"
              aria-label="Inventario"
              aria-expanded={inventoryOpen}
              onClick={() => setInventoryOpen((o) => !o)}
              className={`relative grid size-14 shrink-0 place-items-center rounded-xl transition-transform hover:scale-105 ${
                inventoryIcon ? "" : "border border-white/20 bg-black/70 text-white shadow-lg backdrop-blur"
              } ${inventoryOpen ? "scale-105" : ""}`}
            >
              {inventoryIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inventoryIcon.dataUrl} alt="" className="size-full object-contain drop-shadow-lg" draggable={false} />
              ) : (
                <Package className="size-6" />
              )}
              {invItems.length > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-foreground">
                  {invItems.length}
                </span>
              )}
            </button>
            {quickItems.map((item) => {
              const asset = item.assetId ? project.assets.find((a) => a.id === item.assetId) : null
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.name}
                  aria-label={item.name}
                  onClick={() => {
                    if (dialog) return
                    if (item.useSoundId) audioRef.current.play(item.useSoundId)
                    openDialog(item.useDialogId)
                  }}
                  // a bit smaller than the bag: a solid item (a phone) fills its box, a bag doesn't
                  className="mb-1 grid size-14 shrink-0 place-items-center rounded-xl transition-transform hover:scale-105"
                >
                  {asset ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.dataUrl} alt="" className="h-14 w-auto max-w-full object-contain drop-shadow-lg" draggable={false} />
                  ) : (
                    <span className="rounded-lg bg-black/70 px-1 text-[10px] text-white">{item.name}</span>
                  )}
                </button>
              )
            })}
            {inventoryOpen && (
              <div className="flex max-w-[min(70vw,640px)] flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-black/80 p-2 shadow-2xl backdrop-blur">
                {invItems.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-white/60">Todavía no llevas nada.</p>
                ) : (
                  invItems.map((item) => {
                    const asset = item.assetId ? project.assets.find((a) => a.id === item.assetId) : null
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`group relative shrink-0 ${item.useDialogId ? "cursor-pointer" : "cursor-default"}`}
                        title={item.useDialogId ? `Usar: ${item.name}` : item.name}
                        // Usable items (a phone, a note…) open their dialog when tapped.
                        onClick={() => {
                          if (item.useDialogId && !dialog && !gameEnded) {
                            if (item.useSoundId) audioRef.current.play(item.useSoundId)
                            openDialog(item.useDialogId)
                          }
                        }}
                      >
                        {asset ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset.dataUrl} alt={item.name} className="size-12 rounded-lg border border-white/15 bg-white/5 p-1 object-contain" />
                        ) : (
                          <div className="grid size-12 place-items-center rounded-lg border border-white/15 bg-white/5 text-xs text-white/40">?</div>
                        )}
                        <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                          {item.name}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Item just obtained: big in the middle of the scene, then it fades away */}
        {gotItems[0] && (
          <ItemReveal
            key={gotItems[0].id}
            name={gotItems[0].item.name}
            src={project.assets.find((a) => a.id === gotItems[0].item.assetId)?.dataUrl}
            onDone={() => setGotItems((q) => q.slice(1))}
          />
        )}

        {/* Quest journal */}
        {journalOpen && (
          <div
            className="absolute right-3 top-3 z-[80] max-h-[80%] w-72 overflow-y-auto rounded-lg border border-border bg-black/85 p-3 text-white shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="size-4 text-primary" /> Objetivos
              </p>
              <button className="text-white/50 hover:text-white" onClick={() => setJournalOpen(false)} title="Cerrar (J)">
                <X className="size-4" />
              </button>
            </div>
            {quests.filter((q) => startedQuests.includes(q.id)).length === 0 ? (
              <p className="text-xs text-white/60">Todavía no tienes objetivos.</p>
            ) : (
              <ul className="space-y-3">
                {[...quests]
                  .filter((q) => startedQuests.includes(q.id))
                  .sort((a, b) => Number(doneQuests.includes(a.id)) - Number(doneQuests.includes(b.id)))
                  .map((q) => {
                    const complete = doneQuests.includes(q.id)
                    return (
                      <li key={q.id} className={complete ? "opacity-50" : ""}>
                        <p className={`text-sm font-medium ${complete ? "line-through" : "text-amber-200"}`}>{q.title}</p>
                        {q.description && !complete && <p className="mt-0.5 text-xs text-white/60">{q.description}</p>}
                        {!complete && (
                          <ul className="mt-1.5 space-y-1">
                            {q.steps.map((st) => {
                              const ok = doneSteps.includes(st.id)
                              return (
                                <li key={st.id} className="flex items-start gap-1.5 text-xs">
                                  {ok ? (
                                    <CheckCircle2 className="mt-px size-3.5 shrink-0 text-emerald-400" />
                                  ) : (
                                    <Circle className="mt-px size-3.5 shrink-0 text-white/40" />
                                  )}
                                  <span className={ok ? "text-white/50 line-through" : ""}>{st.text}</span>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </li>
                    )
                  })}
              </ul>
            )}
          </div>
        )}

        {/* Dialog box (it waits under a cinematic) */}
        {dialog && activeLine && !cineQueue.length && (
          <DialogBox
            ref={dialogBoxRef}
            style={resolveDialogStyle(project, activeDialog)}
            lineKey={`${dialog.dialogId}:${dialog.idx}`}
            speaker={displaySpeaker(project, activeLine.speaker)}
            colorKey={activeLine.speaker}
            text={fillPlayerName(project, activeLine.text)}
            choices={activeChoices.map((c) => ({ ...c, text: fillPlayerName(project, c.text) }))}
            hint={activeDialog && resolveNext(activeDialog, dialog.idx, activeLine.next) !== null ? "Siguiente →" : "Cerrar"}
            onAdvance={nextDialog}
            onClose={closeDialog}
            onChoose={(id) => {
              const c = activeChoices.find((x) => x.id === id)
              if (c) chooseOption(c)
            }}
          />
        )}

        {/* Game ended overlay */}
        {gameEnded && (
          // over the characters and the HUD; a cinematic still plays on top of it
          <div className="absolute inset-0 z-[85] flex items-center justify-center bg-black/80 px-[6%] backdrop-blur-sm">
            <div className="max-w-full text-center space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-primary">{project.endTitle || "🎉 ¡Juego completado!"}</h2>
                <p className="text-lg text-foreground/80">{gameEnded.message}</p>
              </div>
              <div className="flex gap-4 justify-center">
                {project.credits?.text.trim() && <Button onClick={() => setScreen("credits")}>Ver créditos</Button>}
                {project.titleScreen ? (
                  <Button variant={project.credits?.text.trim() ? "outline" : "default"} onClick={() => setScreen("title")}>
                    Volver al título
                  </Button>
                ) : (
                  <Button variant={project.credits?.text.trim() ? "outline" : "default"} onClick={restartGame}>
                    Jugar de nuevo
                  </Button>
                )}
                {onExit && (
                  <Button variant="outline" onClick={onExit}>
                    Salir
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

    </div>
  )
}
