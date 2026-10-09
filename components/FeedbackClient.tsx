"use client";
import { useEffect, useState } from "react";
import { FeedbackForm } from "@/components/FeedbackForm";
import { FeedbackState } from "@/components/FeedbackState";
import type { FeedbackOrder } from "@/lib/feedbackApi";
import { feedbackRequest } from "@/lib/feedbackClient";
import { tokenPattern, validSubmission } from "@/lib/feedbackValidation";

function publicOrder(data: unknown): data is FeedbackOrder {
  if (!data || typeof data !== "object") return false;
  const d = data as FeedbackOrder;
  return typeof d.customerName === "string" && typeof d.orderId === "string" && typeof d.deliveryDate === "string" && ["OPEN", "COMPLETED"].includes(d.status) && typeof d.submissionId === "string" && Number.isSafeInteger(d.revision) && d.revision >= 0 && Array.isArray(d.dishes) && d.dishes.length > 0 && d.dishes.length <= 50 && d.dishes.every(x => typeof x.itemCode === "string" && typeof x.dishName === "string" && typeof x.kitchenName === "string" && typeof x.imageUrl === "string" && (x.imageUrl === "" || /^\/menu-images\/[A-Za-z0-9_.-]+$/.test(x.imageUrl))) && (d.draft === null || validSubmission(d.draft, true));
}
export function FeedbackClient() {
  const [token, setToken] = useState(""); const [order, setOrder] = useState<FeedbackOrder | null>(null); const [state, setState] = useState("");
  useEffect(() => {
    let generation = 0;
    function openLink() {
      const current = ++generation;
      const value = window.location.hash.slice(1);
      setState(""); setOrder(null);
      if (!tokenPattern.test(value)) { setState("INVALID_LINK"); return; }
      setToken(value);
      feedbackRequest(value, "feedback_read").then(data => {
        if (generation !== current) return;
        if (!publicOrder(data)) { setState("TEMPORARY_ERROR"); return; }
        setOrder(data);
        if (data.status === "OPEN") void feedbackRequest(value, "feedback_event", { event: "browser_opened" }).catch(() => {});
      }).catch(error => { if (generation === current) setState(error instanceof Error ? error.message : "TEMPORARY_ERROR"); });
    }
    openLink(); window.addEventListener("hashchange", openLink);
    return () => { generation++; window.removeEventListener("hashchange", openLink); };
  }, []);
  if (state) return <FeedbackState state={state} />;
  if (!order) return <main className="p-10 text-center" role="status">Loading your feedback…</main>;
  return <main className="min-h-screen bg-cream text-ink"><FeedbackForm key={token} {...order} feedbackToken={token} /></main>;
}
