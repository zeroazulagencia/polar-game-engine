import type { NextRequest } from "next/server"
import { readDraft, readProjects, readTracker, writeDraft, writeProjects, writeTracker } from "@/lib/disk-store"

/**
 * Local file storage for the editor (see lib/disk-store.ts). Only meant for running the
 * app on your own machine: it writes into the repo's data/ folder.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ path: string[] }> }

const fail = (err: unknown) =>
  Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })

export async function GET(_req: NextRequest, ctx: Ctx) {
  const what = (await ctx.params).path.join("/")
  try {
    if (what === "projects") return Response.json(readProjects())
    if (what === "draft") return Response.json({ project: readDraft() })
    if (what === "tracker") return Response.json({ items: readTracker() })
  } catch (err) {
    return fail(err)
  }
  return Response.json({ error: `No existe: ${what}` }, { status: 404 })
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const what = (await ctx.params).path.join("/")
  try {
    const body = await req.json()
    if (what === "projects") writeProjects(body.ids, body.currentId, body.changed)
    else if (what === "draft") writeDraft(body.project)
    else if (what === "tracker") writeTracker(body.items)
    else return Response.json({ error: `No existe: ${what}` }, { status: 404 })
    return Response.json({ ok: true })
  } catch (err) {
    return fail(err)
  }
}
