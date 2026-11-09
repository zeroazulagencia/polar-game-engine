import type { ComponentType, ReactNode } from "react"

/** Title bar shared by the standalone views (studio, walk cycle, roadmap). */
export function ViewHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-[18px]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">{title}</h1>
          {description && <p className="truncate text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
