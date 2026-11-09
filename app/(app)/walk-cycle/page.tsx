import { Footprints } from "lucide-react"
import { ViewHeader } from "@/components/app-shell/view-header"
import { WalkCyclePanel } from "@/components/editor/walk-cycle-panel"

export default function WalkCyclePage() {
  return (
    <>
      <ViewHeader
        icon={Footprints}
        title="Ciclo de caminar"
        description="Genera la animación de caminar del personaje a partir de su sprite idle."
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <WalkCyclePanel />
      </div>
    </>
  )
}
