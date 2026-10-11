import type { FeedbackAction, FeedbackSubmission } from "@/lib/feedbackValidation";
import { FEEDBACK_UPSTREAM_TIMEOUT_MS } from "@/lib/feedbackTiming";
import { safeFeedbackTiming, type FeedbackBackendTiming } from "@/lib/feedbackTelemetry";
export type FeedbackOrder = {
  customerName: string; deliveryDate: string; orderId: string; status: "OPEN" | "COMPLETED";
  dishes: { itemCode: string; dishName: string; kitchenName: string; imageUrl: string }[];
  submissionId: string; revision: number; draft: FeedbackSubmission | null;
};
const codes = new Set(["INVALID_INPUT", "INVALID_LINK", "EXPIRED", "REVOKED", "REPLACED", "COMPLETED", "CONFLICT", "RATE_LIMITED", "INELIGIBLE", "LEGACY_IN_PROGRESS"]);
export class FeedbackServiceError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export async function callFeedbackService(action: FeedbackAction, payload: Record<string, unknown>, measurement?: { requestId: string; upstreamMs: number; backend?: FeedbackBackendTiming }) {
  const started = Date.now();
  const url = process.env.FLOW_MENU_API_URL, secret = process.env.FLOW_MENU_API_SECRET;
  if (!url || !secret) throw new FeedbackServiceError("TEMPORARY_ERROR");
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "script.google.com" || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.pathname) || endpoint.username || endpoint.password) throw new Error();
    endpoint.search = ""; endpoint.hash = ""; endpoint.searchParams.set("action", action);
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret, ...(measurement ? { timingId: measurement.requestId } : {}) }), cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(FEEDBACK_UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error();
    const raw = await response.text(); if (raw.length > 100000) throw new Error();
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    const envelope = data as { ok?: unknown; result?: unknown; error?: unknown; timing?: unknown };
    if (measurement) measurement.backend = safeFeedbackTiming(envelope.timing);
    if (envelope.ok !== true) throw new FeedbackServiceError(typeof envelope.error === "string" && codes.has(envelope.error) ? envelope.error : "TEMPORARY_ERROR");
    if (!envelope.result || typeof envelope.result !== "object" || Array.isArray(envelope.result)) throw new Error();
    return envelope.result as Record<string, unknown>;
  } catch (error) {
    // Fetch errors can contain URLs/secrets. Never log or return their messages.
    throw error instanceof FeedbackServiceError ? error : new FeedbackServiceError("TEMPORARY_ERROR");
  } finally {
    if (measurement) measurement.upstreamMs = Math.max(0, Date.now() - started);
  }
}
