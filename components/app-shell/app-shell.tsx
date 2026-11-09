"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { Gamepad2 } from "lucide-react"
import { GameStoreProvider, useGameStore } from "@/lib/game-store"
import { TrackerProvider } from "@/lib/tracker-store"
import { ErrorBoundary } from "@/components/error-boundary"
import { AppSidebar } from "./app-sidebar"
import { ProjectActionsProvider } from "./project-actions"
import { ConfirmHost } from "@/components/ui/confirm-host"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <GameStoreProvider>
      <TrackerProvider>
        <ShellLayout>{children}</ShellLayout>
      </TrackerProvider>
    </GameStoreProvider>
  )
}

function ShellLayout({ children }: { children: ReactNode }) {
  const { ready, storageError } = useGameStore()
  const pathname = usePathname()

  if (!ready) {
    return (
      <div className="grid h-screen place-items-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <Gamepad2 className="size-8 animate-pulse text-primary" />
          <p className="text-sm">Cargando tu espacio de trabajo…</p>
        </div>
      </div>
    )
  }

  return (
    <ProjectActionsProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {storageError && (
            <div className="shrink-0 border-b border-destructive/40 bg-destructive/15 px-4 py-2 text-sm text-red-100">
              {storageError}
            </div>
          )}
          <ErrorBoundary key={pathname} name="View">{children}</ErrorBoundary>
          <ConfirmHost />
        </main>
      </div>
    </ProjectActionsProvider>
  )
}
