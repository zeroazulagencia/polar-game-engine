import type { AssetKind } from "./game-types"

/**
 * House art direction shared by every AI-generated asset (hand-painted, organic low-poly,
 * limited palette). Each asset kind adds the composition rules that fit it.
 */
const ART_DIRECTION =
  "premium hand-painted digital illustration, organic low-poly inspired geometry, simplified faceted shapes, angular yet organic silhouettes, clean irregular edges, broad painterly color masses, smooth tonal gradients, subtle surface textures, cohesive limited color palette, restrained detail density, clear silhouettes, charming handcrafted art direction"

const AVOID = "no text, no interface, no photorealism, no hard black outlines, no realistic PBR materials, no excessive microdetails"

/** Only for the kinds an image model draws (videos are uploaded). */
export const HOUSE_STYLES: Record<Exclude<AssetKind, "video">, { label: string; prompt: string }> = {
  background: {
    label: "Estilo de la casa · Fondo",
    prompt:
      "Stylized 2D fantasy game environment background, premium hand-painted digital illustration, organic low-poly inspired geometry, simplified faceted shapes, angular yet organic silhouettes, clean irregular edges, broad painterly color masses, smooth tonal gradients, subtle surface textures, cohesive limited color palette, cinematic diffused ambient lighting, atmospheric perspective, layered parallax composition with a detailed foreground, readable midground and softly faded background, soft environmental shadows, subtle volumetric glow, restrained detail density, clear silhouettes, charming handcrafted art direction, polished 2.5D side-scrolling game environment aesthetic, wide horizontal composition, immersive environmental storytelling, no characters, no text, no interface, no photorealism, no hard black outlines, no realistic PBR materials, no excessive microdetails.",
  },
  object: {
    label: "Estilo de la casa · Objeto",
    prompt: `Stylized 2D fantasy game prop, ${ART_DIRECTION}, soft diffused lighting from the upper left, subtle volumetric glow on magical or glowing parts, readable silhouette even at small inventory size, polished 2.5D game asset aesthetic, single isolated object, centered, fully visible, transparent background, no ground, no cast shadow, no scene, no characters, ${AVOID}.`,
  },
  sprite: {
    label: "Estilo de la casa · Personaje",
    prompt: `Stylized 2D fantasy game character, ${ART_DIRECTION}, soft diffused lighting with a subtle rim light, appealing readable proportions, expressive but simple face, polished 2.5D side-scrolling game character aesthetic, single character, full body, centered, feet visible, transparent background, no ground, no cast shadow, no scene, ${AVOID}.`,
  },
}

/** For walk cycles: the art direction only (several poses per image, so no "single character, standing"). */
export const HOUSE_WALK_STYLE = `Stylized 2D fantasy game character animation, ${ART_DIRECTION}, soft diffused lighting with a subtle rim light, appealing readable proportions, polished 2.5D side-scrolling game aesthetic, ${AVOID}.`

export const HOUSE_STYLE_PROMPTS = new Set([...Object.values(HOUSE_STYLES).map((s) => s.prompt), HOUSE_WALK_STYLE])
