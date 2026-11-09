"use client"

import { AppWindow, Globe, Loader2, Monitor, Smartphone, Terminal } from "lucide-react"
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu"
import type { GameProject } from "@/lib/game-types"
import type { PackageTarget } from "@/lib/export-game"
import { useProjectActions } from "./project-actions"

const TARGETS: Array<{ id: "html" | PackageTarget; label: string; hint: string; Icon: typeof Globe }> = [
  { id: "html", label: "Página web (HTML)", hint: "Un archivo que se juega en el navegador", Icon: Globe },
  { id: "windows", label: "Windows (.exe)", hint: "Carpeta con el .exe, en un .zip", Icon: Monitor },
  { id: "mac", label: "Mac (.app)", hint: "App sin firmar, en un .zip", Icon: AppWindow },
  { id: "linux", label: "Linux", hint: "Carpeta con el ejecutable, en un .zip", Icon: Terminal },
  { id: "android", label: "Android", hint: "APK o proyecto de Android Studio", Icon: Smartphone },
]

const NAMES: Record<string, string> = { html: "HTML", windows: "Windows", mac: "Mac", linux: "Linux", android: "Android" }

/** «Exportar juego» with one entry per system, for the project menus. */
export function ExportGameSubmenu({ project }: { project: GameProject }) {
  const actions = useProjectActions()
  const busy = actions.busy.exportingGame
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={project.scenes.length === 0}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
        {busy ? `Exportando para ${NAMES[busy]}…` : "Exportar juego"}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        {TARGETS.map(({ id, label, hint, Icon }, i) => (
          <div key={id}>
            {i === 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  Como app (se arma en la carpeta dist/; la primera vez tarda unos minutos)
                </DropdownMenuLabel>
              </>
            )}
            <DropdownMenuItem disabled={!!busy} onClick={() => actions.exportGame(project, id)} className="items-start">
              <Icon className="mt-0.5 size-4" />
              <span>
                <span className="block">{label}</span>
                <span className="block text-[11px] text-muted-foreground">{hint}</span>
              </span>
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
