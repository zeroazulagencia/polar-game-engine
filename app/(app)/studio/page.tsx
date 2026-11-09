import { Wand2 } from "lucide-react"
import { ViewHeader } from "@/components/app-shell/view-header"
import { AssetGeneratorPanel } from "@/components/editor/asset-generator-panel"

export default function StudioPage() {
  return (
    <>
      <ViewHeader
        icon={Wand2}
        title="Generar assets"
        description="Fondos, objetos y sprites con IA. Revisa la vista previa y guárdala en la biblioteca del proyecto."
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AssetGeneratorPanel />
      </div>
    </>
  )
}
