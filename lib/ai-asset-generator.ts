import type { AssetKind, CharacterDirection } from "./game-types"
import { callOpenAI } from "./openai-key"

/** Image model for every generation and edit (Sunburst: the most precise GPT Image 2.5 variant). */
export const IMAGE_MODEL = "gpt-image-2.5-sunburst"

export type AIProvider = "openai" | "replicate"

export interface GenerateAssetInput {
  provider: AIProvider
  /** only for Replicate; OpenAI goes through the app's server route */
  apiKey?: string
  prompt: string
  kind: AssetKind
  style?: string
  angleHint?: string
  size?: "1024x1024" | "1536x1024" | "1024x1536"
  /** data URL of an image (or a piece of one) the new asset is based on */
  referenceDataUrl?: string
}

export interface GenerateAssetResult {
  dataUrl: string
  revisedPrompt?: string
}

export async function generateAssetWithByok(input: GenerateAssetInput): Promise<GenerateAssetResult> {
  if (input.referenceDataUrl) return generateFromReference(input, input.referenceDataUrl)
  if (input.provider === "replicate") {
    return generateWithReplicate(input)
  }
  return generateWithOpenAI(input)
}

/** Any writing the model draws inside an image (signs, books, labels…). */
const IMAGE_TEXT_LANGUAGE =
  "If any visible writing appears in the image (signs, books, labels, inscriptions), it must be in neutral Latin American Spanish."

/**
 * New asset based on a reference image (an existing asset or a piece of it): the reference
 * goes to the edits endpoint and the prompt says what to make from it.
 */
async function generateFromReference(input: GenerateAssetInput, referenceDataUrl: string): Promise<GenerateAssetResult> {
  const transparent = input.kind === "sprite" || input.kind === "object"
  const prompt = [
    "Use the attached image as the reference: keep its art style, palette, lighting and the design of anything you reuse from it, unless the instructions below say otherwise.",
    buildPromptForKind(input),
    transparent ? "Single isolated game asset, transparent background, no scene, no floor." : "",
    IMAGE_TEXT_LANGUAGE,
  ]
    .filter(Boolean)
    .join("\n")
  const reference = await (await fetch(referenceDataUrl)).blob()
  const form = new FormData()
  form.append("model", IMAGE_MODEL)
  form.append("image[]", reference, "reference.png")
  form.append("prompt", prompt)
  form.append("size", input.size ?? "1024x1024")
  form.append("quality", "high")
  form.append("background", transparent ? "transparent" : "opaque")
  form.append("output_format", "png")
  const res = await callOpenAI("images/edits", { body: form })
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; revised_prompt?: string }> }
  const img = json.data?.[0]
  if (!img?.b64_json) throw new Error("La IA no devolvió imagen")
  return { dataUrl: `data:image/png;base64,${img.b64_json}`, revisedPrompt: img.revised_prompt }
}

async function generateWithOpenAI(input: GenerateAssetInput): Promise<GenerateAssetResult> {
  const prompt = `${buildPromptForKind(input)}\n${IMAGE_TEXT_LANGUAGE}`


  const res = await callOpenAI("images/generations", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: input.size ?? "1024x1024",
      quality: "high",
      background: input.kind === "sprite" || input.kind === "object" ? "transparent" : "auto",
      output_format: "png",
    }),
  })

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; revised_prompt?: string; url?: string }>
  }

  const img = json.data?.[0]
  if (!img) throw new Error("OpenAI response missing image data")

  if (img.b64_json) {
    return {
      dataUrl: `data:image/png;base64,${img.b64_json}`,
      revisedPrompt: img.revised_prompt,
    }
  }

  if (img.url) {
    const fetched = await fetch(img.url)
    if (!fetched.ok) throw new Error("No se pudo descargar la imagen generada")
    const blob = await fetched.blob()
    const dataUrl = await blobToDataUrl(blob)
    return { dataUrl, revisedPrompt: img.revised_prompt }
  }

  throw new Error("OpenAI response did not include b64_json or url")
}

async function generateWithReplicate(input: GenerateAssetInput): Promise<GenerateAssetResult> {
  const prompt = buildPromptForKind(input)

  const createRes = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(input.apiKey ?? "").trim()}`,
      Prefer: "wait",
    },
    body: JSON.stringify({
      input: {
        prompt,
        output_format: "png",
        aspect_ratio: toReplicateAspect(input.size ?? "1024x1024"),
      },
    }),
  })

  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`Replicate request failed (${createRes.status}): ${text}`)
  }

  let prediction = (await createRes.json()) as {
    id: string
    status: string
    output?: string | string[]
    error?: string
    urls?: { get?: string }
  }

  const pollUrl = prediction.urls?.get
  let attempts = 0
  while (prediction.status !== "succeeded" && prediction.status !== "failed" && attempts < 30 && pollUrl) {
    attempts += 1
    await sleep(1000)
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${(input.apiKey ?? "").trim()}` },
    })
    if (!pollRes.ok) {
      const text = await pollRes.text()
      throw new Error(`Replicate polling failed (${pollRes.status}): ${text}`)
    }
    prediction = (await pollRes.json()) as typeof prediction
  }

  if (prediction.status !== "succeeded") {
    throw new Error(prediction.error || "Replicate no completó la generación")
  }

  const out = prediction.output
  const url = Array.isArray(out) ? out[0] : out
  if (!url) throw new Error("Replicate no devolvió URL de imagen")

  const fetched = await fetch(url)
  if (!fetched.ok) throw new Error("No se pudo descargar la imagen desde Replicate")
  const blob = await fetched.blob()
  const dataUrl = await blobToDataUrl(blob)

  return { dataUrl }
}

export type WalkFrameCount = 4 | 6

// NEAR leg = the one closest to the viewer, FAR leg = the one behind it. Unambiguous in a
// side view, unlike left/right (which flip with the facing direction).
const WALK_POSES: Record<WalkFrameCount, string[]> = {
  4: [
    "NEAR FOOT FORWARD (CONTACT): the NEAR leg reaches forward, heel touching the ground; the FAR leg behind, pushing off with the toes; the legs form a small inverted V; body at normal height",
    "FAR LEG PASSING: the NEAR foot is planted directly below the torso carrying the weight; the FAR leg swings forward with the knee slightly bent and the foot just lifted off the ground, next to the standing ankle; body rises slightly",
    "FAR FOOT FORWARD (OPPOSITE CONTACT): exact mechanical opposite of pose 1 — the FAR leg reaches forward, heel touching the ground; the NEAR leg behind, pushing off with the toes; small inverted V",
    "NEAR LEG PASSING: the FAR foot is planted below the torso carrying the weight; the NEAR leg swings forward, knee slightly bent and foot just lifted off the ground; body rises slightly; flows back into pose 1",
  ],
  6: [
    "NEAR FOOT FORWARD (CONTACT): near heel touching the ground ahead, far foot behind on its toes, small inverted V",
    "DOWN: weight settles onto the near leg, knee slightly bent, body a little lower, far foot leaving the ground",
    "FAR LEG PASSING: near leg straight under the hips, far foot just lifted and passing next to the standing ankle, body slightly higher",
    "FAR FOOT FORWARD (OPPOSITE CONTACT): far heel touching the ground ahead, near foot behind on its toes, small inverted V",
    "DOWN, opposite: weight settles onto the far leg, knee slightly bent, body a little lower",
    "NEAR LEG PASSING: far leg straight under the hips, near foot just lifted and passing next to the standing ankle; flows back into pose 1",
  ],
}

const WALK_VIEWS: Record<CharacterDirection, string> = {
  right: "side view, walking towards the right",
  left: "side view, walking towards the left",
  up: "back view: the character seen from behind, walking away from the camera (upwards on screen); we see their back, not the face",
  down: "front view: the character seen from the front, walking towards the camera (downwards on screen); face visible",
}

export interface GenerateWalkCycleInput {
  /** which way the character walks in the cycle (default right / side view) */
  direction?: CharacterDirection
  /** data URL of the character reference (usually the idle sprite) */
  referenceDataUrl: string
  frames: WalkFrameCount
  style?: string
  notes?: string
}

/**
 * Poses go in a grid, not a single row: each pose gets a much wider cell (512 px instead of
 * 384), so figures with long items (scythes, staffs) don't touch or get cut by the edge.
 */
export const WALK_LAYOUTS: Record<WalkFrameCount, { cols: number; rows: number; size: "1024x1536" | "1536x1024" }> = {
  4: { cols: 2, rows: 2, size: "1024x1536" }, // cells 512×768: tall, roomy
  6: { cols: 3, rows: 2, size: "1536x1024" }, // cells 512×512
}

/**
 * Ask gpt-image-2.5 for a walk-cycle sprite sheet (a grid of poses) of the reference character.
 * All poses come from a single image so the character stays consistent across frames.
 */
export async function generateWalkCycleSheet(input: GenerateWalkCycleInput): Promise<GenerateAssetResult> {
  const poses = WALK_POSES[input.frames]
  const layout = WALK_LAYOUTS[input.frames]
  const prompt = [
    `Sprite sheet for a 2D point-and-click adventure game: a ${poses.length}-frame walk cycle of the character in the reference image.`,
    "Keep the exact same character: same face, hair, outfit, colors, proportions, held items and art style as the reference.",
    input.style?.trim() ? `Art style: ${input.style.trim()}.` : "",
    `Layout: an invisible grid of ${layout.rows} rows × ${layout.cols} columns of equal cells; draw exactly one pose per cell, in reading order (left to right, top to bottom), ${poses.length} poses in total.`,
    "Each pose is centered in its cell and fully inside it with a generous empty margin: the whole figure, including weapons, tools, staffs, capes and hair, uses at most 80% of the cell height and 70% of the cell width. Keep long items close to the body. Poses never touch each other or the image edges.",
    `Every pose: full body, ${WALK_VIEWS[input.direction ?? "right"]}, same size and same ground line (feet resting on the same baseline).`,
    (input.direction ?? "right") === "right" || (input.direction ?? "right") === "left"
      ? `ALL poses face the SAME direction: the character's face, nose and body point to the ${(input.direction ?? "right") === "left" ? "LEFT" : "RIGHT"} side of the image in every single cell, in both rows. Never mirror or flip any pose.`
      : "ALL poses face the same direction in every cell, in both rows. Never mirror or flip any pose.",
    `Poses in order: ${poses.map((p, i) => `${i + 1}) ${p}`).join("; ")}.`,
    "Critical rules for the feet: each pose MUST show a different configuration of both legs; the leading leg MUST alternate between the near and the far leg; the walking motion must be readable even looking at each pose alone; both feet stay anatomically connected to the body.",
    "Pace: a calm, relaxed WALK, never running. Short natural steps: in the contact poses the feet are only about one foot-length apart, the body stays upright (no leaning forward), the lifted foot barely leaves the ground and the arms swing gently.",
    "Held items (weapons, tools, staffs, torches, bags) stay in the SAME hand and on the same side of the body in every pose, exactly as in the reference.",
    `The sequence loops seamlessly: ${poses.map((_, i) => i + 1).join(" → ")} → 1.`,
    "Use the reference ONLY for the character's appearance (design, face, outfit, colors, props) — do NOT copy its standing pose.",
    "If the character wears a long robe, cloak, coat or dress, adjust the lower hem slightly so the feet or boots stay visible below it and their movement reads; never hide the legs completely.",
    "Arms swing opposite to the legs. Head height bobs only slightly.",
    input.notes?.trim() ?? "",
    "Transparent background. No ground, no cast shadows, no text, no numbers, no grid lines, no frame borders.",
  ]
    .filter(Boolean)
    .join("\n")

  const reference = await (await fetch(input.referenceDataUrl)).blob()
  const form = new FormData()
  form.append("model", IMAGE_MODEL)
  form.append("image[]", reference, "reference.png")
  form.append("prompt", prompt)
  form.append("size", layout.size)
  form.append("quality", "high")
  form.append("background", "transparent")
  form.append("output_format", "png")

  const res = await callOpenAI("images/edits", { body: form })

  const json = (await res.json()) as { data?: Array<{ b64_json?: string; revised_prompt?: string }> }
  const img = json.data?.[0]
  if (!img?.b64_json) throw new Error("OpenAI response missing image data")
  return { dataUrl: `data:image/png;base64,${img.b64_json}`, revisedPrompt: img.revised_prompt }
}

/**
 * Edit an existing asset with AI: the current image goes as reference (gpt-image-2.5 edits)
 * and the instruction says what to change. Keeps transparency for
 * sprites/objects and picks the output size closest to the original aspect ratio.
 */
export async function editAssetWithAI(input: {
  dataUrl: string
  kind: AssetKind
  width: number
  height: number
  prompt: string
}): Promise<GenerateAssetResult> {
  const ratio = input.width / Math.max(1, input.height)
  const size = ratio > 1.2 ? "1536x1024" : ratio < 0.83 ? "1024x1536" : "1024x1024"
  const [tw, th] = size.split("x").map(Number)
  const transparent = input.kind !== "background"
  // The model only outputs a few fixed sizes: the original goes centered (letterboxed) in that
  // canvas and the same box is cut back out, so the format and framing never change.
  const box = fitBox(input.width, input.height, tw, th)
  const letterboxed = box.w < tw - 1 || box.h < th - 1
  const prompt = [
    input.prompt.trim(),
    "Keep everything not mentioned exactly as in the reference image: same subject, composition, framing, perspective, palette and art style.",
    letterboxed && !transparent
      ? "The image has empty bands at its edges: only continue the scene into them; keep the main picture exactly where it is, same position and size."
      : "",
    transparent ? "Single isolated game asset, transparent background, no scene, no floor, no shadows outside the object." : "",
    IMAGE_TEXT_LANGUAGE,
  ]
    .filter(Boolean)
    .join("\n")

  const reference = await letterbox(input.dataUrl, tw, th, box)
  const form = new FormData()
  form.append("model", IMAGE_MODEL)
  form.append("image[]", reference, "reference.png")
  form.append("prompt", prompt)
  form.append("size", size)
  form.append("quality", "high")
  form.append("background", transparent ? "transparent" : "opaque")
  form.append("output_format", "png")

  const res = await callOpenAI("images/edits", { body: form })
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; revised_prompt?: string }> }
  const img = json.data?.[0]
  if (!img?.b64_json) throw new Error("OpenAI no devolvió la imagen")
  const out = `data:image/png;base64,${img.b64_json}`
  return { dataUrl: letterboxed ? await cutBox(out, box, tw) : out, revisedPrompt: img.revised_prompt }
}

/** Largest box with the aspect of w×h that fits (centered) in tw×th. */
function fitBox(w: number, h: number, tw: number, th: number) {
  const k = Math.min(tw / w, th / h)
  const bw = Math.round(w * k)
  const bh = Math.round(h * k)
  return { x: Math.round((tw - bw) / 2), y: Math.round((th - bh) / 2), w: bw, h: bh }
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error("No se pudo leer la imagen"))
    i.src = src
  })
}

/** The image drawn in `box` of a transparent tw×th canvas, as a PNG blob. */
async function letterbox(dataUrl: string, tw: number, th: number, box: { x: number; y: number; w: number; h: number }): Promise<Blob> {
  const img = await loadImg(dataUrl)
  const c = document.createElement("canvas")
  c.width = tw
  c.height = th
  c.getContext("2d")!.drawImage(img, box.x, box.y, box.w, box.h)
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo preparar la imagen"))), "image/png"))
}

/** Cut `box` back out of the model's output. */
async function cutBox(dataUrl: string, box: { x: number; y: number; w: number; h: number }, requestedWidth: number): Promise<string> {
  const img = await loadImg(dataUrl)
  const k = img.naturalWidth / requestedWidth // in case the output size differs from the request
  const c = document.createElement("canvas")
  c.width = box.w
  c.height = box.h
  c.getContext("2d")!.drawImage(img, box.x * k, box.y * k, box.w * k, box.h * k, 0, 0, box.w, box.h)
  return c.toDataURL("image/png")
}

/**
 * Extend a background sideways with AI (outpainting): the original goes in the middle of a
 * 1536x1024 canvas and the model paints the transparent sides, continuing the scene.
 */
export async function outpaintBackground(dataUrl: string): Promise<GenerateAssetResult> {
  const { prepareOutpaint } = await import("./image-utils")
  const { image, mask } = await prepareOutpaint(dataUrl)
  const form = new FormData()
  form.append("model", IMAGE_MODEL)
  form.append("image[]", image, "background.png")
  form.append("mask", mask, "mask.png")
  form.append(
    "prompt",
    "Extend this 2D game background to the left and right to fill the empty transparent areas. Continue the existing scene seamlessly: same perspective, horizon line, lighting, palette and art style. Do not change the existing central part. No characters, no text.",
  )
  form.append("size", "1536x1024")
  form.append("quality", "high")
  form.append("background", "opaque")
  form.append("output_format", "png")
  const res = await callOpenAI("images/edits", { body: form })
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> }
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new Error("OpenAI no devolvió la imagen")
  return { dataUrl: `data:image/png;base64,${b64}` }
}

function toReplicateAspect(size: "1024x1024" | "1536x1024" | "1024x1536"): "1:1" | "3:2" | "2:3" {
  if (size === "1536x1024") return "3:2"
  if (size === "1024x1536") return "2:3"
  return "1:1"
}

function buildPromptForKind(input: GenerateAssetInput): string {
  const base = input.prompt.trim()
  const style = input.style?.trim()
  const angle = input.angleHint?.trim()

  if (input.kind === "object" || input.kind === "sprite") {
    return [
      base,
      style,
      angle,
      "single isolated game asset",
      "NO background",
      "transparent background only",
      "centered composition",
      "fully visible object",
      "clean edges",
      "no scene, no room, no floor, no wall, no shadows outside object",
    ]
      .filter(Boolean)
      .join(", ")
  }

  // Backgrounds are cropped from 3:2 to the 16:9 game screen: keep the important parts away from top/bottom.
  const framed = `${base}. Composition framed for a 16:9 game screen: keep important elements away from the top and bottom edges.`
  return [framed, style].filter(Boolean).join(" | style: ")
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
