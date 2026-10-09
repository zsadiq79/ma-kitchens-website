"use client";
export async function feedbackRequest(token: string, action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action, ...payload }), cache: "no-store", signal: AbortSignal.timeout(18000) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "TEMPORARY_ERROR");
  return data;
}
