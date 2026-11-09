import { ListChecks } from "lucide-react"
import { ViewHeader } from "@/components/app-shell/view-header"
import { RoadmapPanel } from "@/components/editor/roadmap-panel"

export default function RoadmapPage() {
  return (
    <>
      <ViewHeader
        icon={ListChecks}
        title="Roadmap y bugs"
        description="Mejoras planeadas y bugs conocidos del engine. Se guardan en data/tracker.json."
      />
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <RoadmapPanel />
      </div>
    </>
  )
}
