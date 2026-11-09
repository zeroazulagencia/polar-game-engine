import type { Asset, DirectionAnimation, GameProject } from "./game-types"
import { dataUrlToAsset, flipHorizontal } from "./image-utils"

/**
 * Build a left-facing animation from mirrored copies of the right-facing (base) idle and
 * walk frames, as real assets the user can then retouch individually.
 */
export async function mirrorRightToLeft(project: GameProject): Promise<{ assets: Asset[]; left: DirectionAnimation }> {
  const byId = new Map(project.assets.map((a) => [a.id, a]))
  const flip = async (id: string | null | undefined) => {
    const src = id ? byId.get(id) : undefined
    if (!src) return null
    return dataUrlToAsset(await flipHorizontal(src.dataUrl), src.kind, `${src.name} (izquierda)`)
  }
  const idle = await flip(project.character.idleAssetId)
  const walk = (await Promise.all(project.character.walkAssetIds.map(flip))).filter((a): a is Asset => !!a)
  if (!idle && walk.length === 0) throw new Error("La dirección Derecha no tiene sprites para reflejar.")
  return {
    assets: [...(idle ? [idle] : []), ...walk],
    left: { idleAssetId: idle?.id ?? null, walkAssetIds: walk.map((a) => a.id) },
  }
}
