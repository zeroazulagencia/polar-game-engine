// Runs the game checker off the main thread: the editor stays usable while it plays every option.
import { checkGame } from "./game-checker"

self.onmessage = (e: MessageEvent<{ project: Parameters<typeof checkGame>[0]; limit: number }>) => {
  try {
    const report = checkGame(e.data.project, { limit: e.data.limit, onProgress: (n) => self.postMessage({ type: "progress", n }) })
    self.postMessage({ type: "done", report })
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) })
  }
}
