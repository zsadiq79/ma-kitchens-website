// Numeric timings only. This module never receives a token or customer payload.
export const feedbackTimingKeys = ["totalMs", "lockWaitMs", "readMs", "readCalls", "writeMs", "writeCalls", "bookMs", "timezoneMs"] as const;
export type FeedbackBackendTiming = Record<typeof feedbackTimingKeys[number], number>;
export function safeFeedbackTiming(value: unknown): FeedbackBackendTiming | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  const result = {} as FeedbackBackendTiming;
  for (const key of feedbackTimingKeys) {
    const number = source[key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > 600_000) return;
    result[key] = Math.round(number);
  }
  return result;
}

const browserNames = new Set([
  "load", "draft_flush_before_submit", "submission", "feedback_read", "feedback_draft", "feedback_event", "feedback_submit",
  "http_feedback_read", "http_feedback_draft", "http_feedback_event", "http_feedback_submit",
]);
export function startFeedbackMeasure(name: string): () => void {
  if (!browserNames.has(name) || typeof window === "undefined" || typeof performance === "undefined") return () => {};
  try {
    const start = performance.now();
    return () => {
      try {
        const label = "feedback:" + name;
        if (performance.getEntriesByName(label, "measure").length >= 100) performance.clearMeasures(label);
        performance.measure(label, { start, end: performance.now() });
      } catch { /* Diagnostics must never affect feedback. */ }
    };
  } catch { return () => {}; }
}
