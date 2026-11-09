import { Target } from "lucide-react"
import { ViewHeader } from "@/components/app-shell/view-header"
import { QuestEditor } from "@/components/quests/quest-editor"

export default function QuestsPage() {
  return (
    <>
      <ViewHeader
        icon={Target}
        title="Objetivos"
        description="Metas del jugador que se completan solas según variables, objetos y escenas visitadas."
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <QuestEditor />
      </div>
    </>
  )
}
