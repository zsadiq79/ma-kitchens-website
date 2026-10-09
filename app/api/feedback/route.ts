import { NextResponse } from "next/server";
import { callFeedbackService, FeedbackServiceError } from "@/lib/feedbackApi";
import { validFeedbackRequest } from "@/lib/feedbackValidation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
async function readBounded(request: Request) {
  if (!request.body || !request.headers.get("content-type")?.startsWith("application/json")) throw new Error();
  const reader = request.body.getReader(); let length = 0; const chunks: Uint8Array[] = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 50000) { await reader.cancel(); throw new Error(); } chunks.push(value); }
  const all = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all)) as unknown;
}
export async function POST(request: Request) {
  // Same-origin browser writes only. No token path, query, or CORS endpoint.
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 403, headers });
  let body: unknown;
  try { body = await readBounded(request); } catch { return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400, headers }); }
  if (!validFeedbackRequest(body)) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400, headers });
  const { action, ...payload } = body;
  try { return NextResponse.json(await callFeedbackService(action, payload), { headers }); }
  catch (error) {
    const code = error instanceof FeedbackServiceError ? error.code : "TEMPORARY_ERROR";
    const status = code === "INVALID_INPUT" ? 400 : code === "RATE_LIMITED" ? 429 : code === "CONFLICT" ? 409 : ["INVALID_LINK", "EXPIRED", "REVOKED", "REPLACED", "INELIGIBLE"].includes(code) ? 410 : code === "COMPLETED" ? 409 : 503;
    return NextResponse.json({ error: code }, { status, headers });
  }
}
