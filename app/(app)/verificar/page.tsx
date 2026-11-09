import { ShieldCheck } from "lucide-react"
import { ViewHeader } from "@/components/app-shell/view-header"
import { GameChecker } from "@/components/verify/game-checker-view"

export default function VerifyPage() {
  return (
    <>
      <ViewHeader
        icon={ShieldCheck}
        title="Verificar el juego"
        description="Prueba todas las opciones del juego para ver si se llega a cada final y si hay acciones que dejan al jugador atascado."
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <GameChecker />
      </div>
    </>
  )
}
