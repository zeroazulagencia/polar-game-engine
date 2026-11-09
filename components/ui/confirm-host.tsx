"use client"

import { useEffect, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"

/**
 * In-app replacements for window.confirm / window.alert: some embedded browsers (like the
 * desktop app's preview pane) block the native boxes, which then answer "cancel" at once.
 * Mount <ConfirmHost /> once; call confirmAction() / notify() from anywhere.
 */
interface Request {
  message: string
  title?: string
  confirmLabel?: string
  destructive?: boolean
  /** only an OK button (notify) */
  alertOnly?: boolean
  resolve: (ok: boolean) => void
}

let enqueue: ((r: Request) => void) | null = null

export function confirmAction(
  message: string,
  opts: { title?: string; confirmLabel?: string; destructive?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!enqueue) return resolve(window.confirm(message))
    enqueue({ message, ...opts, resolve })
  })
}

export function notify(message: string, title?: string): Promise<void> {
  return new Promise((resolve) => {
    if (!enqueue) {
      window.alert(message)
      return resolve()
    }
    enqueue({ message, title, alertOnly: true, resolve: () => resolve() })
  })
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<Request[]>([])
  useEffect(() => {
    enqueue = (r) => setQueue((q) => [...q, r])
    return () => {
      enqueue = null
    }
  }, [])
  const current = queue[0]
  const answer = (ok: boolean) => {
    current?.resolve(ok)
    setQueue((q) => q.slice(1))
  }

  return (
    <AlertDialog open={!!current} onOpenChange={(open) => !open && answer(false)}>
      {current && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{current.title ?? (current.alertOnly ? "Aviso" : "¿Seguro?")}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">{current.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {!current.alertOnly && <AlertDialogCancel onClick={() => answer(false)}>Cancelar</AlertDialogCancel>}
            <AlertDialogAction
              className={current.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
              onClick={() => answer(true)}
            >
              {current.confirmLabel ?? (current.alertOnly ? "Entendido" : "Aceptar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
