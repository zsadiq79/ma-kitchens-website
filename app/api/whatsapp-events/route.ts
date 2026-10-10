import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams, expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === expected) return new Response(q.get("hub.challenge") || "", { headers: { "Cache-Control": "no-store" } });
  return new Response("Verification failed", { status: 403 });
}
export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET, url = process.env.FLOW_MENU_API_URL, secret = process.env.FLOW_MENU_API_SECRET;
  if (!appSecret || !url || !secret) return new Response("Unavailable", { status: 503 });
  const sig = request.headers.get("x-hub-signature-256");
  if (!sig || !/^sha256=[a-f0-9]{64}$/.test(sig)) return new Response("Forbidden", { status: 403 });
  let length = 0; const chunks: Uint8Array[] = [];
  try {
    if (!request.body) throw new Error();
    const reader = request.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 1000000) { await reader.cancel(); return new Response("Too large", { status: 413 }); } chunks.push(value); }
    const raw = Buffer.concat(chunks);
    const expected = createHmac("sha256", appSecret).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(sig.slice(7), "hex"))) return new Response("Forbidden", { status: 403 });
    const payload: unknown = JSON.parse(raw.toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    const endpoint = new URL(url);
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "script.google.com" || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.pathname) || endpoint.username || endpoint.password) throw new Error();
    endpoint.search = ""; endpoint.hash = ""; endpoint.searchParams.set("action", "whatsapp_verified");
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, payload }), signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!response.ok || (await response.json()).ok !== true) throw new Error();
    return NextResponse.json({ ok: true });
  } catch { return new Response("Temporary failure", { status: 502 }); } // No payloads, URLs or secrets in logs.
}
