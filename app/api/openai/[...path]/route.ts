import type { NextRequest } from "next/server"

/**
 * Server-side proxy to the OpenAI API so the key never reaches the browser.
 * The key comes from OPENAI_API_KEY (.env.local). Only the endpoints the app uses are allowed.
 */
const ALLOWED = new Set(["responses", "images/generations", "images/edits"])

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const endpoint = (await ctx.params).path.join("/")
  if (!ALLOWED.has(endpoint)) {
    return Response.json({ error: { message: `Endpoint no permitido: ${endpoint}` } }, { status: 404 })
  }

  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return Response.json(
      { error: { message: "Falta OPENAI_API_KEY en .env.local (reinicia el servidor después de agregarla)." } },
      { status: 500 },
    )
  }

  const upstream = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      // JSON or multipart (image edits): forward the body untouched with its content type.
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    body: await req.arrayBuffer(),
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  })
}
