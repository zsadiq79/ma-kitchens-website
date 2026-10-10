"use client";
import { FEEDBACK_BROWSER_TIMEOUT_MS } from "@/lib/feedbackTiming";

async function sendRequest(token: string, action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action, ...payload }), cache: "no-store", signal: AbortSignal.timeout(FEEDBACK_BROWSER_TIMEOUT_MS) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "TEMPORARY_ERROR");
  return data;
}

const terminalErrors = new Set(["INVALID_INPUT", "INVALID_LINK", "EXPIRED", "REVOKED", "REPLACED", "CONFLICT", "RATE_LIMITED", "INELIGIBLE", "LEGACY_IN_PROGRESS", "COMPLETED"]);

export async function feedbackRequest(token: string, action: string, payload: Record<string, unknown> = {}) {
  try { return await sendRequest(token, action, payload); }
  catch (error) {
    if (!["feedback_draft", "feedback_submit"].includes(action) || (error instanceof Error && terminalErrors.has(error.message))) throw error;
    // A lost acknowledgement does not mean the write failed. Read persisted
    // state once; never replay a write or infer success from a local selection.
    try {
      const current = await sendRequest(token, "feedback_read", {});
      if (action === "feedback_submit" && current.status === "COMPLETED" && current.submissionId === payload.submissionId) {
        return { status: "COMPLETED", submissionId: current.submissionId, alreadyCompleted: true };
      }
      if (action === "feedback_draft" && current.status === "OPEN" && Number.isSafeInteger(current.revision) &&
          typeof payload.revision === "number" && current.revision >= payload.revision &&
          JSON.stringify(current.draft) === JSON.stringify(payload.submission)) {
        return { revision: current.revision };
      }
    } catch { /* Preserve the uncertain outcome; do not disclose network errors. */ }
    throw error;
  }
}
