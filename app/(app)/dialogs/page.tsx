import { MessageSquare } from "lucide-react"
import { ViewHeader } from "@/components/app-shell/view-header"
import { DialogsWorkspace } from "@/components/dialogs/dialogs-workspace"

export default function DialogsPage() {
  return (
    <>
      <ViewHeader
        icon={MessageSquare}
        title="Diálogos"
        description="Conversaciones con opciones, condiciones y consecuencias, y el diseño del cuadro de diálogo."
      />
      <DialogsWorkspace />
    </>
  )
}
