import type { Asset, Cinematic, Credits, Dialog, GameProject, Hotspot, InventoryItem, Quest, Scene, SceneObject, SoundSpec, TitleScreen } from "./game-types"

/**
 * A content pack adds or updates story content in the OPEN project without touching the
 * rest: dialogs, items and quests are upserted by id; scenes are created or merged (their
 * hotspots upserted by id, so existing polygons and art stay). Used to load a written
 * script (e.g. a whole act) in one import.
 */
export interface ContentPack {
  schema: "pixelquest-content-v1"
  title?: string
  /** images the content needs (backgrounds, objects), upserted by id */
  assets?: Asset[]
  /** music and sound effects, upserted by id */
  sounds?: SoundSpec[]
  items?: InventoryItem[]
  dialogs?: Dialog[]
  quests?: Quest[]
  scenes?: Array<
    Omit<Partial<Scene>, "hotspots"> & {
      id: string
      hotspots?: Array<Partial<Hotspot> & { id: string }>
      /** final drawing order of the scene's objects (ids); unlisted ones keep their place after them */
      objectOrder?: string[]
    }
  >
  /** scene the game starts in, when the pack sets it */
  startSceneId?: string
  /** game-wide sounds (getting an item, going through a door), when the pack sets them */
  pickupSoundId?: string
  doorSoundId?: string
  /** story slides, upserted by id */
  cinematics?: Cinematic[]
  /** cinematic shown when a new game starts, when the pack sets it */
  introCinematicId?: string
  /** title screen, credits and the end screen's heading, when the pack sets them */
  titleScreen?: TitleScreen
  credits?: Credits
  endTitle?: string
}

export function isContentPack(value: unknown): value is ContentPack {
  return (value as ContentPack | null)?.schema === "pixelquest-content-v1"
}

function upsert<T extends { id: string }>(list: T[], incoming: T[] | undefined): T[] {
  if (!incoming?.length) return list
  const byId = new Map(incoming.map((x) => [x.id, x]))
  const updated = list.map((x) => byId.get(x.id) ?? x)
  const known = new Set(list.map((x) => x.id))
  return [...updated, ...incoming.filter((x) => !known.has(x.id))]
}

/** Like upsert, but an existing hotspot keeps the fields the pack leaves out (its polygon). */
function mergeHotspots(list: Hotspot[], incoming: Partial<Hotspot>[] | undefined): Hotspot[] {
  if (!incoming?.length) return list
  const byId = new Map(incoming.map((h) => [h.id, h]))
  const merged = list.map((h) => (byId.has(h.id) ? { ...h, ...byId.get(h.id), action: { ...h.action, ...byId.get(h.id)!.action } } : h))
  const known = new Set(list.map((h) => h.id))
  return [...merged, ...(incoming.filter((h) => !known.has(h.id!)) as Hotspot[])]
}

/** The pack-only `objectOrder` key is applied, not stored in the scene. */
function withoutOrder<T extends { objectOrder?: string[] }>(s: T): Omit<T, "objectOrder"> {
  const { objectOrder: _ignored, ...rest } = s
  return rest
}

function reorder(list: SceneObject[], order: string[] | undefined): SceneObject[] {
  if (!order?.length) return list
  const rank = (o: SceneObject) => {
    const i = order.indexOf(o.id)
    return i < 0 ? order.length : i
  }
  return [...list].sort((a, b) => rank(a) - rank(b))
}

export function applyContentPack(project: GameProject, pack: ContentPack): GameProject {
  const scenes = [...project.scenes]
  for (const s of pack.scenes ?? []) {
    const i = scenes.findIndex((x) => x.id === s.id)
    if (i >= 0) {
      const cur = scenes[i]
      scenes[i] = {
        ...cur,
        ...withoutOrder(s),
        // Keep what the pack doesn't mention; merge hotspots instead of replacing them.
        backgroundAssetId: s.backgroundAssetId !== undefined ? s.backgroundAssetId : cur.backgroundAssetId,
        hotspots: mergeHotspots(cur.hotspots, s.hotspots),
        sceneObjects: reorder(upsert<SceneObject>(cur.sceneObjects ?? [], s.sceneObjects), s.objectOrder),
        depthWaypoints: cur.depthWaypoints,
        walkableAreas: cur.walkableAreas,
        characterStart: s.characterStart ?? cur.characterStart,
      }
    } else {
      scenes.push({
        name: "Escena",
        backgroundAssetId: null,
        walkableAreas: [],
        characterStart: { x: 0.5, y: 0.85 },
        ...withoutOrder(s),
        hotspots: (s.hotspots ?? []) as Hotspot[],
      } as Scene)
    }
  }
  return {
    ...project,
    scenes,
    assets: upsert(project.assets, pack.assets),
    sounds: upsert(project.sounds ?? [], pack.sounds),
    items: upsert(project.items, pack.items),
    dialogs: upsert(project.dialogs, pack.dialogs),
    quests: upsert(project.quests ?? [], pack.quests),
    startSceneId: pack.startSceneId ?? project.startSceneId,
    pickupSoundId: pack.pickupSoundId ?? project.pickupSoundId,
    doorSoundId: pack.doorSoundId ?? project.doorSoundId,
    cinematics: pack.cinematics ? upsert(project.cinematics ?? [], pack.cinematics) : project.cinematics,
    introCinematicId: pack.introCinematicId ?? project.introCinematicId,
    titleScreen: pack.titleScreen ?? project.titleScreen,
    credits: pack.credits ?? project.credits,
    endTitle: pack.endTitle ?? project.endTitle,
  }
}

export function describePack(pack: ContentPack) {
  const n = (x?: unknown[]) => x?.length ?? 0
  return `${n(pack.dialogs)} diálogos, ${n(pack.items)} objetos, ${n(pack.quests)} objetivos, ${n(pack.scenes)} escenas y ${n(pack.assets)} imágenes`
}
