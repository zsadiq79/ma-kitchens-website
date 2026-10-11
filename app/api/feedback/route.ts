import { NextResponse } from "next/server";
import { callFeedbackService, FeedbackServiceError } from "@/lib/feedbackApi";
import { validFeedbackRequest } from "@/lib/feedbackValidation";
import { randomUUID } from "node:crypto";
import type { FeedbackBackendTiming } from "@/lib/feedbackTelemetry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
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
  const started = Date.now();
  const measurement: { requestId: string; upstreamMs: number; backend?: FeedbackBackendTiming } = { requestId: randomUUID().replaceAll("-", ""), upstreamMs: 0 };
  let status = 200;
  function measuredHeaders() {
    const backend = measurement.backend;
    const timings = [`route;dur=${Math.max(0, Date.now() - started)}`, `upstream;dur=${measurement.upstreamMs}`];
    if (backend) timings.push(`apps_script;dur=${backend.totalMs}`, `lock;dur=${backend.lockWaitMs}`, `sheet_reads;dur=${backend.readMs}`, `sheet_writes;dur=${backend.writeMs}`);
    return { ...headers, "Server-Timing": timings.join(", "), "X-Feedback-Request-Id": measurement.requestId };
  }
  try { return NextResponse.json(await callFeedbackService(action, payload, measurement), { headers: measuredHeaders() }); }
  catch (error) {
    const code = error instanceof FeedbackServiceError ? error.code : "TEMPORARY_ERROR";
    status = code === "INVALID_INPUT" ? 400 : code === "RATE_LIMITED" ? 429 : code === "CONFLICT" ? 409 : ["INVALID_LINK", "EXPIRED", "REVOKED", "REPLACED", "INELIGIBLE"].includes(code) ? 410 : code === "COMPLETED" ? 409 : 503;
    return NextResponse.json({ error: code }, { status, headers: measuredHeaders() });
  } finally {
    try { console.info(JSON.stringify({ event: "feedback_timing", requestId: measurement.requestId, action, status, routeMs: Math.max(0, Date.now() - started), upstreamMs: measurement.upstreamMs, ...(measurement.backend ? { backend: measurement.backend } : {}) })); }
    catch { /* Diagnostics must never affect the response. */ }
  }
}
