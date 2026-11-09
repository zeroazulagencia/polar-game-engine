"use client"

import { MessagesSquare, Palette } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DialogEditor } from "./dialog-editor"
import { DialogDesign } from "./dialog-design"

/** Dialogs view: the conversations themselves, and the look of the in-game dialog box. */
export function DialogsWorkspace() {
  return (
    <Tabs defaultValue="conversations" className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="shrink-0 border-b border-border px-6 py-2">
        <TabsList>
          <TabsTrigger value="conversations">
            <MessagesSquare className="size-4" /> Conversaciones
          </TabsTrigger>
          <TabsTrigger value="design">
            <Palette className="size-4" /> Diseño
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="conversations" className="min-h-0 flex-1 overflow-hidden">
        <DialogEditor />
      </TabsContent>
      <TabsContent value="design" className="min-h-0 flex-1 overflow-hidden">
        <DialogDesign />
      </TabsContent>
    </Tabs>
  )
}
