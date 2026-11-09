"use client"

import { useEffect, useState, type ComponentType } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Film,
  ShieldCheck,
  Clapperboard,
  Footprints,
  Gamepad2,
  Images,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Target,
  User,
  Wand2,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useGameStore } from "@/lib/game-store"
import { useTracker } from "@/lib/tracker-store"
import { cn } from "@/lib/utils"
import { ProjectMenu } from "./project-menu"

const COLLAPSED_KEY = "pixelquest:sidebar-collapsed:v1"

type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  badge?: number
  disabled?: boolean
  hint?: string
}

export function AppSidebar() {
  const pathname = usePathname()
  const { project } = useGameStore()
  const { items } = useTracker()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1")
    } catch {}
  }, [])

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1")
      } catch {}
      return !c
    })
  }

  const openBugs = items.filter((it) => it.kind === "bug" && it.status !== "done").length
  const canPlay = (project?.scenes.length ?? 0) > 0

  const groups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: "Proyectos",
      items: [{ href: "/projects", label: "Todos los proyectos", icon: LayoutGrid }],
    },
    {
      label: "Crear",
      items: [
        { href: "/", label: "Editor de escenas", icon: Clapperboard },
        { href: "/dialogs", label: "Diálogos", icon: MessageSquare },
        { href: "/quests", label: "Objetivos", icon: Target },
        { href: "/cinematicas", label: "Título y cinemáticas", icon: Film },
        { href: "/character", label: "Personaje", icon: User },
        {
          href: "/play",
          label: "Jugar",
          icon: Play,
          disabled: !canPlay,
          hint: canPlay ? undefined : "Crea una escena para poder jugar",
        },
        { href: "/verificar", label: "Verificar el juego", icon: ShieldCheck, disabled: !canPlay },
      ],
    },
    {
      label: "Assets",
      items: [
        { href: "/library", label: "Biblioteca", icon: Images },
        { href: "/studio", label: "Generar con IA", icon: Wand2 },
        { href: "/walk-cycle", label: "Ciclo de caminar", icon: Footprints },
      ],
    },
    {
      label: "Seguimiento",
      items: [{ href: "/roadmap", label: "Roadmap y bugs", icon: ListChecks, badge: openBugs }],
    },
  ]

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-150",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b border-border", collapsed ? "justify-center" : "px-3")}>
          <Gamepad2 className="size-4 shrink-0 text-primary" />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">Polar</span>}
        </div>

        <div className="shrink-0 p-2">
          <ProjectMenu collapsed={collapsed} />
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-2">
          {groups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              {collapsed ? (
                <div className="mx-2 mb-1 h-px bg-border first:hidden" />
              ) : (
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-2">
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
              collapsed ? "justify-center" : "px-2",
            )}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && "Contraer"}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  )
}

function SidebarLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon
  const className = cn(
    "relative flex h-8 items-center gap-2.5 rounded-md text-sm transition-colors",
    collapsed ? "justify-center" : "px-2",
    active ? "bg-primary/15 font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
    item.disabled && "pointer-events-none opacity-40",
  )
  const badge = item.badge ? (
    collapsed ? (
      <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-red-400" aria-hidden />
    ) : (
      <span className="ml-auto rounded-full bg-red-500/20 px-1.5 text-[10px] font-semibold text-red-200">{item.badge}</span>
    )
  ) : null

  const link = (
    <Link href={item.href} className={className} aria-disabled={item.disabled} aria-current={active ? "page" : undefined}>
      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
      <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {badge}
    </Link>
  )

  if (!collapsed && !item.hint) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span keeps the tooltip working on disabled links */}
        <span className="block">{link}</span>
      </TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {item.hint ? ` — ${item.hint}` : ""}
      </TooltipContent>
    </Tooltip>
  )
}
