export type AssetKind = "background" | "sprite" | "object" | "video"

export interface SoundSpec {
  id: string
  name: string
  /** base64 data URL del audio */
  dataUrl: string
  /** Volume 0-1 */
  volume: number
  /** Whether to loop (for music/ambient) */
  loop: boolean
}

export interface Asset {
  id: string
  name: string
  kind: AssetKind
  /** base64 data URL */
  dataUrl: string
  width: number
  height: number
}

/** A clickable item the player can pick up and keep in the inventory. */
export interface InventoryItem {
  id: string
  name: string
  assetId: string | null
  /** dialog opened when the player taps the item in the inventory (e.g. a phone to make calls) */
  useDialogId?: string | null
  /** shown as its own button beside the inventory instead of inside it (e.g. the phone) */
  quickAccess?: boolean
  /** sound played when the player uses it (e.g. a ringtone) */
  useSoundId?: string | null
}

/**
 * Something that changes the game state. Used by dialog lines and choices.
 * Flags are free-form boolean variables ("door_unlocked", "talked_to_guard"…).
 */
export type GameEffect =
  | { type: "setFlag"; flag: string; value: boolean }
  | { type: "giveItem"; itemId: string }
  | { type: "removeItem"; itemId: string }
  /** `at`: where the protagonist appears (default: by the door that leads back where they came from) */
  | { type: "goToScene"; sceneId: string; at?: Point | null }
  /** plays a cinematic once the player moves past the line (or right away from a choice) */
  | { type: "playCinematic"; cinematicId: string }
  | { type: "endGame"; text?: string }

/** Dialog jump target: a line id in the same dialog, or "end" to close the dialog. */
export type DialogNext = string | "end"

export interface DialogChoice {
  id: string
  text: string
  /** only offered when this flag is true */
  requiresFlag?: string | null
  /** only offered when this item is in the inventory */
  requiresItem?: string | null
  /** only offered in this scene (e.g. photographing someone who stands there) */
  requiresScene?: string | null
  /** not offered in this scene (e.g. "take me to X" while already in X) */
  hideInScene?: string | null
  /** hide the choice after the player picks it once */
  once?: boolean
  effects?: GameEffect[]
  /** where the conversation continues; defaults to "end" */
  next?: DialogNext | null
}

/** Visual design of the in-game dialog box (project-wide). */
export interface DialogStyle {
  position: "bottom" | "top" | "center"
  width: "full" | "wide" | "narrow"
  /** hex colors */
  background: string
  /** 0–1 */
  backgroundOpacity: number
  border: string
  text: string
  speaker: string
  choice: string
  font: "sans" | "serif" | "mono" | "rounded"
  /** px */
  fontSize: number
  /** px */
  radius: number
  /** px of space between the box and the edge of the scene */
  margin: number
  /** px of space between the box border and its text */
  padding: number
  /** typewriter speed in characters per second; 0 shows the line at once */
  typewriterSpeed: number
  /** name color per character (key: speaker name, lowercase); others use `speaker` */
  speakerColors?: Record<string, string>
  /**
   * Each character's box a bit lighter or darker than `background` (same theme), so it is
   * clear who is talking. Default on.
   */
  speakerShades?: boolean
}

export const DEFAULT_DIALOG_STYLE: DialogStyle = {
  position: "bottom",
  width: "full",
  background: "#000000",
  backgroundOpacity: 0.9,
  border: "#ffffff",
  text: "#ffffff",
  speaker: "#ffffff",
  choice: "#fde68a",
  font: "sans",
  fontSize: 15,
  radius: 0,
  margin: 0,
  padding: 14,
  typewriterSpeed: 0,
}

/** A dialog box style saved by the user, assignable to individual dialogs. */
export interface NamedDialogStyle {
  id: string
  name: string
  style: DialogStyle
}

/** A dialog is a sequence of lines; lines with choices branch the conversation. */
export interface DialogLine {
  id: string
  speaker: string
  text: string
  /** applied when the line is shown */
  effects?: GameEffect[]
  /** player choices shown under this line (turns the line into a branch) */
  choices?: DialogChoice[]
  /** for lines without choices: where to go next; defaults to the following line */
  next?: DialogNext | null
  /** shown only when this holds; otherwise the dialog skips to the following line */
  showIf?: LineCondition | null
}

/** Condition on the game state for a dialog line: a flag or an item, optionally negated. */
export interface LineCondition {
  kind: "flag" | "item"
  /** flag name or item id */
  id: string
  /** true = shown when the flag is off / the item is missing */
  negate?: boolean
}

export interface DialogVersionMeta {
  id: string
  label: string
  createdAt: number
  source: "manual" | "ai"
  /** instruction used when the version was generated with AI */
  prompt?: string
}

/** An inactive alternative of a dialog (the active one lives in `Dialog.lines`). */
export interface DialogVersion extends DialogVersionMeta {
  lines: DialogLine[]
}

export interface Dialog {
  id: string
  name: string
  /** the active version: what the game plays and the editor edits */
  lines: DialogLine[]
  /** label/origin of the active version (absent = the original) */
  activeVersion?: DialogVersionMeta
  /** inactive versions, newest first */
  versions?: DialogVersion[]
  /** look of this dialog: "preset:<id>", a custom style id, or empty for the project default */
  styleId?: string | null
}

export type HotspotActionType =
  | "none"
  | "goToScene"
  | "dialog"
  | "pickup"
  | "endGame"

export interface HotspotAction {
  type: HotspotActionType
  /** target scene id when type === goToScene */
  targetSceneId?: string | null
  /** dialog id when type === dialog */
  dialogId?: string | null
  /** inventory item id when type === pickup */
  itemId?: string | null
  /** end game message when type === endGame */
  endGameText?: string | null
  /** item to consume when the action runs */
  consumesItem?: string | null
  /** Sound effect to play when hotspot is activated */
  sfxId?: string | null
}

/** Where the character turns when it reaches (or uses) a hotspot or object. */
export type FaceOnArrive = "auto" | "left" | "right" | "up" | "down" | "none"

/** A 2D point in normalized scene coordinates (0-1). */
export interface Point {
  x: number
  y: number
}

/** Hotspot shape - polygon with N points (minimum 3). */
export interface Hotspot {
  id: string
  name: string
  /** Polygon vertices in normalized coordinates (0-1). Minimum 3 points. */
  points: Point[]
  action: HotspotAction
  /** when true, hotspot is not interactive/movable from stage */
  locked?: boolean
  /** hide the hotspot once its pickup item is collected */
  hideWhenCollected?: boolean
  /** Item ID required to interact with this hotspot. If player doesn't have it, shows blockedDialog. */
  requiresItem?: string | null
  /** Flag that must be true to interact with this hotspot (set by dialog effects). */
  requiresFlag?: string | null
  /** Item ID to consume when interacting. Removes from inventory after action. */
  consumesItem?: string | null
  /** Dialog shown when hotspot is blocked (requiresItem not in inventory). */
  blockedDialog?: string | null
  /** walk the character up to the hotspot before its action runs (default: act right away) */
  walkToFirst?: boolean
  /** where the character looks once there (default "auto": towards the hotspot) */
  faceOnArrive?: FaceOnArrive
  /** exact spot where the character stands to use it (default: under the click, or beside a character) */
  standAt?: Point | null
  /**
   * A dialog that takes you to another scene (a door) plays only the first time: once it has
   * taken you through, the hotspot goes straight there. Default true; false always plays it.
   */
  directAfterFirstPass?: boolean
  /** only present (visible, hoverable, clickable) while this holds, e.g. a character who arrives later */
  visibleIf?: LineCondition | null
}

/** What completes a quest step. */
export type QuestCondition =
  | { type: "flag"; flag: string }
  | { type: "item"; itemId: string }
  | { type: "scene"; sceneId: string }

export interface QuestStep {
  id: string
  text: string
  when: QuestCondition
}

/** A goal shown in the player's journal; steps complete from game state. */
export interface Quest {
  id: string
  title: string
  description?: string
  /** quest becomes active when this flag is true; empty = active from the start */
  startFlag?: string | null
  steps: QuestStep[]
  /** applied once when every step is done */
  rewards?: GameEffect[]
}

/** A polygon defining where the character CAN walk. */
export interface WalkableArea {
  id: string
  name: string
  /** Outer boundary polygon - character can walk inside this. */
  points: Point[]
  /** Optional holes - character cannot walk inside these polygons. */
  holes?: Point[][]
}

export interface SceneObject {
  id: string
  assetId: string
  name: string
  /** normalized position in scene */
  x: number
  y: number
  /** multiplier relative to asset natural size */
  scale: number
  /** clockwise rotation in degrees */
  rotationDeg?: number
  /** horizontal mirror */
  flipX?: boolean
  /** when true, object is not draggable/resizable and is click-through on stage */
  locked?: boolean
  /** How the object responds to click:
   *  - "click": activates on direct click.
   *  - "walk": character must walk to it before activating.
   *  - "none": not interactive (pure decoration).
   */
  interactionMode?: 'click' | 'walk' | 'none'
  /** where the character looks when using it (default "auto": towards the object) */
  faceOnArrive?: FaceOnArrive
  /** exact spot where the character stands to use it (default: the object, or beside it if a character) */
  standAt?: Point | null
  /** Action executed when the object is activated.
   *  Same structure as Hotspot.action.
   */
  action?: HotspotAction
  /** Sound effect to play when object is activated */
  sfxId?: string | null
  /** hidden in the game once the player has this item (e.g. a chain taken from the wall) */
  hideWhenItem?: string | null
  /** only drawn while this holds (e.g. Charon, once you call him) */
  visibleIf?: LineCondition | null
  /** idle loop for characters placed as objects, so they never stand frozen */
  animation?: SceneObjectAnimation | null
  /** dialog speaker name this object is: it bounces while that speaker talks */
  speaker?: string | null
  /** lit by the scene's depth lighting (brightness / tint at its feet), like the protagonist */
  lit?: boolean
  /**
   * in front of the protagonist only while they stand behind its base (higher on screen), whatever
   * the layer order says: furniture in the middle of a room
   */
  depthSort?: boolean
  /**
   * places it moves to as the story advances: it walks to the last stop whose condition holds
   * (none = its own x/y), e.g. a character the player has to follow
   */
  stops?: ObjectStop[]
  /** frames cycled while it walks between stops (none = it slides with its own sprite) */
  walkAssetIds?: string[]
}

export interface ObjectStop {
  x: number
  y: number
  when: LineCondition
}

export type SceneObjectAnimation = "breathe" | "float" | "sway"

export interface DepthWaypoint {
  id: string
  x: number
  y: number
  /** scale factor at this point (1 = 100%) */
  scale: number
  /** character brightness at this point (1 = unchanged) */
  brightness?: number
  /** color washed over the character at this point (hex) */
  tint?: string | null
  /** 0–1 */
  tintStrength?: number
  /** IDs of connected depth waypoints (graph edges) */
  links?: string[]
}

export interface Scene {
  id: string
  name: string
  backgroundAssetId: string | null
  hotspots: Hotspot[]
  /** Walkable areas - character movement is restricted to these polygons. */
  walkableAreas: WalkableArea[]
  /** Placed object instances in the scene. Optional for backward compatibility. */
  sceneObjects?: SceneObject[]
  /** Character layer slot among scene layers (0..sceneObjects.length). Higher = more in front. */
  characterLayerZ?: number
  /** Way System points controlling depth scaling (Visionaire-style). */
  depthWaypoints?: DepthWaypoint[]
  /** normalized character start position */
  characterStart: { x: number; y: number }
  /** Ambient sound (looping) for this scene */
  ambientSoundId?: string | null
  /** Background music track (looping) for this scene */
  musicTrackId?: string | null
  /** character walking speed multiplier in this scene (1 = normal) */
  walkSpeed?: number
  /** other backgrounds for the same place: the last one whose condition holds replaces it (e.g. 300 years later) */
  backgroundVariants?: Array<{ assetId: string; when: LineCondition }>
  /**
   * an interlude: the protagonist is not there and the player only reads. Entering plays this
   * dialog; when it ends the game returns to the scene and spot the player came from.
   */
  cutscene?: { dialogId: string } | null
  /** cinematic shown the first time the player enters this scene */
  enterCinematicId?: string | null
}

/** One slide of a cinematic: a picture with a text under it on black, or a video in the middle. */
export interface CinematicSlide {
  id: string
  imageAssetId?: string | null
  /** an asset of kind "video"; when set, it is shown instead of the picture */
  videoAssetId?: string | null
  text?: string
  /** seconds before it moves on by itself; none = waits for a click (a video moves on when it ends) */
  seconds?: number | null
}

/** Story slides between moments of the game (intro, endings, scene changes, special actions). */
export interface Cinematic {
  id: string
  name: string
  slides: CinematicSlide[]
}

export interface TitleScreen {
  backgroundAssetId?: string | null
  /** shown big over the background; the image alone when empty (a picture that already has the title) */
  title: string
  subtitle?: string
  musicTrackId?: string | null
}

export interface Credits {
  /** one entry per line; a line starting with "# " is a heading, an empty line a gap */
  text: string
  musicTrackId?: string | null
}

/** Idle + walk animation for one direction. */
export interface DirectionAnimation {
  idleAssetId?: string | null
  walkAssetIds: string[]
}

export type CharacterDirection = "right" | "left" | "up" | "down"

export interface Character {
  /** protagonist's name: dialog lines spoken by "@protagonista" show it */
  name?: string
  /** sprite shown while standing */
  idleAssetId: string | null
  /** sprites cycled while walking */
  walkAssetIds: string[]
  /** rendered height as a fraction of the stage height */
  scale: number
  /** whether depth waypoints affect character scale */
  scaleWithDepth?: boolean
  /** initial facing direction in play mode */
  startFacing?: 1 | -1
  /** walk animation frame duration (ms) */
  walkFrameMs?: number
  /** normalized sprite anchor X (0=left, 0.5=center, 1=right) */
  pivotX?: number
  /** normalized sprite anchor Y (0=top, 1=bottom/feet) */
  pivotY?: number
  /**
   * Own animations for other directions. `idleAssetId`/`walkAssetIds` above are the
   * right-facing (side) animation. Missing left = mirrored right; missing up/down = side view.
   */
  directions?: Partial<Record<"left" | "up" | "down", DirectionAnimation>>
  /** degrees from horizontal above which movement counts as up/down (default 55) */
  verticalAngle?: number
  /** soft contact shadow (a subtle gradient ellipse) under the feet */
  shadow?: boolean
  /** how much he stretches breathing while standing still: 0 = still, default 2 */
  breathDepth?: number
  /** length of one breath while standing still (ms), default 3200 */
  breathMs?: number
  /** images worn over the sprite (a fake mustache) while their condition holds */
  accessories?: CharacterAccessory[]
}

/** Placed over the right-facing sprite; mirrored with it when the character faces left. */
export interface CharacterAccessory {
  id: string
  assetId: string
  when: LineCondition
  /** center, as a fraction of the sprite's width and height */
  x: number
  y: number
  /** height as a fraction of the sprite's height */
  height: number
  /** per frame (sprite asset id): its center in that frame, for animations where the head moves */
  at?: Record<string, { x: number; y: number }>
}

export interface GameProject {
  id: string
  name: string
  startSceneId: string | null
  scenes: Scene[]
  assets: Asset[]
  dialogs: Dialog[]
  items: InventoryItem[]
  /** Optional for projects created before quests existed. */
  quests?: Quest[]
  /** Default look of the in-game dialog box; defaults to DEFAULT_DIALOG_STYLE. */
  dialogStyle?: DialogStyle
  /** Custom dialog box styles that individual dialogs can use. */
  dialogStyles?: NamedDialogStyle[]
  /** image of the in-game inventory button; a bag icon when unset */
  inventoryIconAssetId?: string | null
  /** story slides; shown by the intro, scene entries and the "playCinematic" effect */
  cinematics?: Cinematic[]
  /** cinematic shown when a new game starts */
  introCinematicId?: string | null
  /** first screen of the game (New game / Continue / Credits); without it the game starts right away */
  titleScreen?: TitleScreen | null
  /** names rolled at the end of the game and from the title screen */
  credits?: Credits | null
  /** heading of the screen shown when the game ends; "¡Juego completado!" when unset */
  endTitle?: string
  /** sound played whenever the player gets an item */
  pickupSoundId?: string | null
  /** sound played when the player goes through a door to another scene */
  doorSoundId?: string | null
  character: Character
  sounds: SoundSpec[]
  updatedAt: number
  /** hidden from the project switcher; still listed under "Archivados" */
  archived?: boolean
}

export function createEmptyProject(name = "Untitled Adventure"): GameProject {
  return {
    id: crypto.randomUUID(),
    name,
    startSceneId: null,
    scenes: [],
    assets: [],
    dialogs: [],
    items: [],
    sounds: [],
    character: { idleAssetId: null, walkAssetIds: [], scale: 0.4, scaleWithDepth: true, startFacing: 1, walkFrameMs: 140, pivotX: 0.5, pivotY: 1 },
    updatedAt: Date.now(),
  }
}

/** All flag names used anywhere in the project (for autocomplete in the editor). */
export function collectFlags(project: GameProject): string[] {
  const flags = new Set<string>()
  const fromEffects = (effects?: GameEffect[]) =>
    effects?.forEach((e) => e.type === "setFlag" && e.flag && flags.add(e.flag))
  for (const d of project.dialogs) {
    for (const l of d.lines) {
      fromEffects(l.effects)
      for (const c of l.choices ?? []) {
        fromEffects(c.effects)
        if (c.requiresFlag) flags.add(c.requiresFlag)
      }
    }
  }
  for (const s of project.scenes) for (const h of s.hotspots) if (h.requiresFlag) flags.add(h.requiresFlag)
  for (const q of project.quests ?? []) {
    if (q.startFlag) flags.add(q.startFlag)
    fromEffects(q.rewards)
    for (const st of q.steps) if (st.when.type === "flag" && st.when.flag) flags.add(st.when.flag)
  }
  return [...flags].sort()
}
