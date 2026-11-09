import { Film } from "lucide-react"
import { ViewHeader } from "@/components/app-shell/view-header"
import { CinematicsEditor } from "@/components/cinematics/cinematics-editor"

export default function CinematicsPage() {
  return (
    <>
      <ViewHeader
        icon={Film}
        title="Título, cinemáticas y créditos"
        description="La pantalla de título, los créditos del final y las diapositivas sobre negro (imagen con texto, o video) para la intro, los finales y los momentos especiales."
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <CinematicsEditor />
      </div>
    </>
  )
}
