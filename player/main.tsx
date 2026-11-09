/**
 * Entry point of the standalone HTML player produced by "Exportar juego".
 * Bundled with esbuild into public/player.js (see `build:player` in package.json);
 * the exporter inlines that bundle plus the project JSON into a single .html file.
 */
import { createRoot } from "react-dom/client"
import { GamePlayer } from "@/components/editor/play-mode"
import type { GameProject } from "@/lib/game-types"

const data = document.getElementById("pixelquest-project")?.textContent
const root = document.getElementById("pixelquest-root")

if (!data || !root) {
  document.body.textContent = "No se encontró el juego en este archivo."
} else {
  const project = JSON.parse(data) as GameProject
  document.title = project.name
  createRoot(root).render(<GamePlayer project={project} />)
}
