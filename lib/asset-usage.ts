import type { GameProject } from "./game-types"

/** Human-readable list of the places that use an asset (empty = unused). */
export function assetUsages(project: GameProject, assetId: string): string[] {
  const out: string[] = []
  if (project.character.idleAssetId === assetId) out.push("Personaje · sprite en reposo")
  const walk = project.character.walkAssetIds.indexOf(assetId)
  if (walk >= 0) out.push(`Personaje · caminar (fotograma ${walk + 1})`)
  for (const s of project.scenes) {
    if (s.backgroundAssetId === assetId) out.push(`Escena «${s.name}» · fondo`)
    for (const o of s.sceneObjects ?? []) if (o.assetId === assetId) out.push(`Escena «${s.name}» · objeto «${o.name}»`)
  }
  for (const it of project.items) if (it.assetId === assetId) out.push(`Inventario · ícono de «${it.name}»`)
  return out
}

export const assetSizeKB = (dataUrl: string) => Math.round((dataUrl.length * 0.75) / 1024)
