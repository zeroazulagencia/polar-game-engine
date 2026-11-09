"use client"

import { PanelLeft, Settings2 } from "lucide-react"
import { EditorUIProvider, useEditorUI } from "./editor-context"
import { LibraryPanel } from "./library-panel"
import { SceneStage } from "./scene-stage"
import { Inspector } from "./inspector"
import { ErrorBoundary } from "@/components/error-boundary"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

export function Editor() {

  return (
    <EditorUIProvider>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* Compact toolbar for panels on smaller screens */}
            <div className="flex items-center justify-between border-b border-border bg-card px-3 py-1.5 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="sm" variant="ghost" className="md:hidden">
                    <PanelLeft className="size-4" /> Library
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 p-0">
                  <SheetTitle className="sr-only">Library</SheetTitle>
                  <LibraryPanel />
                </SheetContent>
              </Sheet>
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <Settings2 className="size-4" /> Inspector
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0">
                  <SheetTitle className="sr-only">Inspector</SheetTitle>
                  <Inspector />
                </SheetContent>
              </Sheet>
            </div>

            <EditorColumns />
      </div>
    </EditorUIProvider>
  )
}

function EditorColumns() {
  const { libraryOpen, inspectorOpen } = useEditorUI()
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {libraryOpen && (
        <aside className="hidden min-h-0 w-64 shrink-0 border-r border-border md:block lg:w-72">
          <ErrorBoundary name="Library">
            <LibraryPanel />
          </ErrorBoundary>
        </aside>
      )}
      <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ErrorBoundary name="Stage">
          <SceneStage />
        </ErrorBoundary>
      </section>
      {inspectorOpen && (
        <aside className="hidden min-h-0 w-72 shrink-0 overflow-hidden lg:block">
          <ErrorBoundary name="Inspector">
            <Inspector />
          </ErrorBoundary>
        </aside>
      )}
    </div>
  )
}
