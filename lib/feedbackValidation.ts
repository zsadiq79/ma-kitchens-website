export type FeedbackSubmission = {
  dishes: { itemCode: string; rating: number; skipped: boolean; comment: string }[];
  deliveryRating: number; overallComment: string; testimonialConsent: boolean;
};
export type FeedbackAction = "feedback_read" | "feedback_draft" | "feedback_event" | "feedback_submit";
export const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function keys(v: Record<string, unknown>, allowed: string[]) { return Object.keys(v).length === allowed.length && allowed.every(k => Object.hasOwn(v, k)); }
function text(v: unknown, max: number, min = 0): v is string { return typeof v === "string" && v.length >= min && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v); }
export function validSubmission(v: unknown, draft: boolean): v is FeedbackSubmission {
  if (!record(v) || !keys(v, ["dishes", "deliveryRating", "overallComment", "testimonialConsent"]) || !Array.isArray(v.dishes) || v.dishes.length < 1 || v.dishes.length > 50 || typeof v.testimonialConsent !== "boolean" || !text(v.overallComment, 1200) || typeof v.deliveryRating !== "number" || !Number.isInteger(v.deliveryRating) || v.deliveryRating < (draft ? 0 : 1) || v.deliveryRating > 5) return false;
  const seen = new Set<string>();
  return v.dishes.every(d => {
    if (!record(d) || !keys(d, ["itemCode", "rating", "skipped", "comment"]) || !text(d.itemCode, 80, 1) || seen.has(d.itemCode) || typeof d.skipped !== "boolean" || typeof d.rating !== "number" || !Number.isInteger(d.rating) || d.rating < 0 || d.rating > 5 || (d.skipped && d.rating !== 0) || (!draft && !d.skipped && d.rating === 0) || !text(d.comment, 600)) return false;
    seen.add(d.itemCode); return true;
  });
}
export function validFeedbackRequest(v: unknown): v is Record<string, unknown> & { token: string; action: FeedbackAction } {
  if (!record(v) || !text(v.token, 43, 43) || !tokenPattern.test(v.token)) return false;
  if (v.action === "feedback_read") return keys(v, ["action", "token"]);
  if (v.action === "feedback_event") return keys(v, ["action", "token", "event"]) && ["browser_opened", "first_interaction"].includes(String(v.event)) && typeof v.event === "string";
  if (v.action !== "feedback_draft" && v.action !== "feedback_submit") return false;
  const allowed = v.action === "feedback_submit" ? ["action", "token", "submission", "revision", "submissionId"] : ["action", "token", "submission", "revision"];
  return keys(v, allowed) && typeof v.revision === "number" && Number.isSafeInteger(v.revision) && v.revision >= 0 && v.revision <= 1000000 && (v.action !== "feedback_submit" || text(v.submissionId, 80, 1)) && validSubmission(v.submission, v.action === "feedback_draft");
}
