/**
 * Browser-side helper for OpenAI calls. Requests go through the app's own server route
 * (app/api/openai/[...path]/route.ts), which adds the key from OPENAI_API_KEY in .env.local,
 * so the key never reaches the browser.
 */
export async function callOpenAI(endpoint: "responses" | "images/generations" | "images/edits", init: RequestInit) {
  let res: Response
  try {
    res = await fetch(`/api/openai/${endpoint}`, { method: "POST", ...init })
  } catch {
    throw new Error("No se pudo conectar con el servidor de la app. ¿Está corriendo `npm run dev`?")
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } }
      if (body.error?.code === "invalid_api_key") {
        message = "La API key de OpenAI no es válida. Actualiza OPENAI_API_KEY en .env.local y reinicia el servidor."
      } else if (body.error?.message) {
        message = body.error.message
      }
    } catch {}
    throw new Error(`OpenAI: ${message}`)
  }
  return res
}
