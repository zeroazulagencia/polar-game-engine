"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Loader2, Play, TriangleAlert, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useGameStore } from "@/lib/game-store"
import type { CheckReport } from "@/lib/game-checker"
import { cn } from "@/lib/utils"

const DEPTHS = [
  { limit: 20000, label: "Rápida", hint: "Unos segundos. Suficiente para encontrar los finales." },
  { limit: 60000, label: "Profunda", hint: "Uno o dos minutos. Busca más callejones sin salida." },
]

/** "Verificar el juego": runs the checker in a worker and explains the result in plain words. */
export function GameChecker() {
  const { project } = useGameStore()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [report, setReport] = useState<CheckReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  function run(limit: number) {
    if (!project) return
    workerRef.current?.terminate()
    const w = new Worker(new URL("../../lib/game-checker.worker.ts", import.meta.url))
    workerRef.current = w
    setRunning(true)
    setProgress(0)
    setReport(null)
    setError(null)
    w.onmessage = (e) => {
      if (e.data.type === "progress") setProgress(e.data.n)
      else {
        if (e.data.type === "done") setReport(e.data.report)
        else setError(e.data.message)
        setRunning(false)
        w.terminate()
      }
    }
    w.postMessage({ project, limit })
  }

  function stop() {
    workerRef.current?.terminate()
    setRunning(false)
  }

  if (!project) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          El verificador juega solo, probando cada opción de cada diálogo, cada zona y cada objeto, con las mismas reglas
          que el juego. Úsalo después de cambiar acertijos o condiciones: encuentra finales a los que no se llega y
          acciones que dejan al jugador sin forma de terminar.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {DEPTHS.map((d) => (
            <Button key={d.limit} size="sm" variant={d.limit === DEPTHS[0].limit ? "default" : "outline"} disabled={running} onClick={() => run(d.limit)} title={d.hint}>
              <Play className="size-4" /> Revisión {d.label.toLowerCase()}
            </Button>
          ))}
          {running && (
            <>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Probando… {progress.toLocaleString()} jugadas
              </span>
              <Button size="sm" variant="ghost" onClick={stop}>
                Detener
              </Button>
            </>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {report && <Report report={report} />}
    </div>
  )
}

function Report({ report }: { report: CheckReport }) {
  const totalEndings = report.endings.length + report.missingEndings.length
  const ok = report.missingEndings.length === 0 && report.deadEnds.length === 0
  return (
    <div className="space-y-6">
      <div className={cn("rounded-lg border p-4", ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10")}>
        <p className="flex items-center gap-2 text-base font-semibold">
          {ok ? <CheckCircle2 className="size-5 text-emerald-400" /> : <TriangleAlert className="size-5 text-amber-400" />}
          {ok ? "El juego se puede terminar" : "Hay cosas que revisar"}
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            Finales alcanzados: <b>{report.endings.length} de {totalEndings}</b>
          </li>
          <li>
            Acciones que dejan al jugador atascado: <b>{report.deadEnds.length}</b>
          </li>
          <li className="text-muted-foreground">
            {report.complete
              ? `Se probaron todas las situaciones posibles (${report.statesExplored.toLocaleString()}).`
              : `Se probaron ${report.statesExplored.toLocaleString()} situaciones; el juego tiene más. Un atascado solo se informa si se confirmó del todo.`}
          </li>
        </ul>
      </div>

      <Section title="Finales" help="Cada final que se alcanzó, con un camino de ejemplo para llegar.">
        {report.endings.map((e) => (
          <details key={e.text} className="rounded-md border border-border bg-card px-3 py-2">
            <summary className="flex cursor-pointer items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <span className="flex-1">{e.text}</span>
              {e.steps.length > 0 && <span className="shrink-0 text-xs text-muted-foreground">{e.steps.length} pasos</span>}
            </summary>
            {e.steps.length > 0 && (
              <ol className="mt-2 list-decimal space-y-0.5 pl-6 text-xs text-muted-foreground">
                {e.steps.map((st, i) => (
                  <li key={i}>{st}</li>
                ))}
              </ol>
            )}
          </details>
        ))}
        {report.missingEndings.map((t) => (
          <p key={t} className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> {t} <span className="text-muted-foreground">— no se llegó</span>
          </p>
        ))}
        {totalEndings === 0 && <Empty>El juego no tiene ningún final («Terminar el juego» en un diálogo o una zona).</Empty>}
      </Section>

      <Section
        title="Acciones que dejan al jugador atascado"
        help="Después de hacer esto ya no se puede llegar a ningún final. Suele ser un objeto que se gasta antes de tiempo o una puerta que se cierra para siempre."
      >
        {report.deadEnds.length ? (
          report.deadEnds.map((d, i) => (
            <p key={i} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">{d.scene} ·</span> {d.action}
              {d.count > 1 && <span className="text-xs text-muted-foreground"> ({d.count} veces)</span>}
            </p>
          ))
        ) : (
          <Empty ok>Ninguna encontrada.</Empty>
        )}
      </Section>

      <Section title="Objetivos" help="Si cada objetivo se pudo completar en alguna partida.">
        {report.quests.length ? (
          <ul className="grid gap-1 sm:grid-cols-2">
            {report.quests.map((q) => (
              <li key={q.title} className="flex items-center gap-2 text-sm">
                {q.completable ? <CheckCircle2 className="size-4 text-emerald-400" /> : <XCircle className="size-4 text-destructive" />}
                {q.title}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>El juego no tiene objetivos.</Empty>
        )}
      </Section>

      <Section title="Nunca pasa" help="Cosas que el juego espera pero que ninguna partida consiguió. Suelen ser errores de escritura en una variable o algo olvidado.">
        <List label="Variables que se piden y nunca se activan" items={report.neverFlags} mono />
        <List label="Escenas a las que nunca se llega" items={report.neverScenes} />
        <List label="Objetos que nunca se consiguen" items={report.neverItems} />
      </Section>
    </div>
  )
}

function Section({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function Empty({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <p className={cn("flex items-center gap-2 text-sm", ok ? "text-emerald-300" : "text-muted-foreground")}>
      {ok && <CheckCircle2 className="size-4" />}
      {children}
    </p>
  )
}

function List({ label, items, mono }: { label: string; items: string[]; mono?: boolean }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      {items.length ? <span className={cn(mono && "font-mono text-xs")}>{items.join(", ")}</span> : <span className="text-emerald-300">ninguna</span>}
    </div>
  )
}
