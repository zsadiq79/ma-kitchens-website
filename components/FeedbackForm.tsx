"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedbackSubmission } from "@/lib/feedbackValidation";
import { feedbackRequest } from "@/lib/feedbackClient";

type DishFeedback = {
  itemCode: string;
  dishName: string;
  kitchenName: string;
  imageUrl: string;
};

type FeedbackFormProps = {
  customerName: string;
  deliveryDate: string;
  orderId: string;
  status: "OPEN" | "COMPLETED";
  dishes: DishFeedback[];
  feedbackToken: string;
  submissionId: string;
  revision: number;
  draft: FeedbackSubmission | null;
};

type DishState = {
  rating: number;
  skipped: boolean;
  comment: string;
};

function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
          aria-pressed={value === rating}
          className={`min-h-12 min-w-12 rounded-full border px-3 text-2xl leading-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay ${
            rating <= value
              ? "border-clay bg-clay text-white"
              : "border-ink/15 bg-white text-ink/35 hover:border-clay/50 hover:text-clay"
          }`}
          onClick={() => onChange(rating)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function FeedbackForm({
  customerName,
  deliveryDate,
  orderId,
  status,
  dishes,
  feedbackToken,
  submissionId,
  revision,
  draft,
}: FeedbackFormProps) {
  const initialDishState = useMemo(
    () =>
      Object.fromEntries(
        dishes.map((dish) => [
          dish.itemCode,
          { rating: 0, skipped: false, comment: "" },
        ])
      ) as Record<string, DishState>,
    [dishes]
  );

  const [dishFeedback, setDishFeedback] =
    useState<Record<string, DishState>>(() => draft ? Object.fromEntries(draft.dishes.map(d => [d.itemCode, { rating: d.rating, skipped: d.skipped, comment: d.comment }])) : initialDishState);
  const [deliveryRating, setDeliveryRating] = useState(draft?.deliveryRating ?? 0);
  const [overallComment, setOverallComment] = useState(draft?.overallComment ?? "");
  const [testimonialConsent, setTestimonialConsent] = useState(draft?.testimonialConsent ?? false);
  const [submitted, setSubmitted] = useState(status === "COMPLETED");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [saveState, setSaveState] = useState("saved");
  const revisionRef = useRef(revision);
  const busy = useRef(false);
  const interacted = useRef(false);
  const conflict = useRef(false);
  const lastSaveAt = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const submission: FeedbackSubmission = {
    dishes: dishes.map(d => ({ itemCode: d.itemCode, ...dishFeedback[d.itemCode] })),
    deliveryRating, overallComment, testimonialConsent,
  };
  const snapshot = JSON.stringify(submission);
  const latest = useRef(snapshot); latest.current = snapshot;
  const saved = useRef(snapshot);

  function markInteraction() {
    if (interacted.current || submitted) return;
    interacted.current = true;
    void feedbackRequest(feedbackToken, "feedback_event", { event: "first_interaction" }).catch(() => {});
  }
  async function flushDraft() {
    if (inFlight.current) await inFlight.current;
    if (conflict.current) throw new Error("CONFLICT");
    if (saved.current === latest.current) return;
    const work = (async () => {
      while (saved.current !== latest.current) {
        const pending = latest.current;
        const wait = Math.max(0, 3100 - (Date.now() - lastSaveAt.current));
        if (wait) await new Promise(resolve => setTimeout(resolve, wait));
        lastSaveAt.current = Date.now(); setSaveState("saving");
        try {
          const result = await feedbackRequest(feedbackToken, "feedback_draft", { revision: revisionRef.current, submission: JSON.parse(pending) });
          if (!Number.isSafeInteger(result.revision)) throw new Error("TEMPORARY_ERROR");
          revisionRef.current = result.revision; saved.current = pending;
        } catch (error) {
          if (error instanceof Error && error.message === "CONFLICT") conflict.current = true;
          setSaveState(conflict.current ? "conflict" : "error"); throw error;
        }
      }
      setSaveState("saved");
    })();
    inFlight.current = work;
    try { await work; } finally { inFlight.current = null; }
  }
  const flushRef = useRef(flushDraft); flushRef.current = flushDraft;
  useEffect(() => {
    if (submitted || snapshot === saved.current || conflict.current) return;
    setSaveState("pending");
    const timer = setTimeout(() => { void flushRef.current().catch(() => {}); }, 800);
    return () => clearTimeout(timer);
  }, [snapshot, submitted]);

  function updateDish(itemCode: string, patch: Partial<DishState>) {
    setDishFeedback((current) => ({
      ...current,
      [itemCode]: { ...current[itemCode], ...patch },
    }));
  }

  const allDishesAnswered = dishes.every((dish) => {
    const answer = dishFeedback[dish.itemCode];
    return answer.skipped || answer.rating > 0;
  });

  const canSubmit = allDishesAnswered && deliveryRating > 0;

  if (submitted) {
    return (
      <section className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-6 sm:py-20">
        <div className="rounded-[2rem] border border-ink/10 bg-white px-6 py-12 shadow-sm sm:px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage text-2xl text-white">
            ✓
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-clay">
            Feedback received
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
            Thank you, {customerName}.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-ink/65">
            Your feedback helps our local kitchens improve and helps Ma Kitchens keep raising the standard.
          </p>
          <p className="mt-6 text-sm text-ink/45">Order {orderId}</p>
        </div>
      </section>
    );
  }

  return (
    <form
      className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14"
      onInputCapture={markInteraction}
      onClickCapture={markInteraction}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit || busy.current || conflict.current) return;
        busy.current = true; setSubmitting(true); setSubmitError("");
        try {
          await flushDraft();
          await feedbackRequest(feedbackToken, "feedback_submit", {
            submissionId, revision: revisionRef.current, submission: JSON.parse(latest.current),
          });
          setSubmitted(true);
        } catch (error) {
          const code = error instanceof Error ? error.message : "TEMPORARY_ERROR";
          if (code === "COMPLETED") setSubmitted(true);
          else setSubmitError(code === "CONFLICT" ? "This feedback changed in another tab. Reopen your link to resume the latest saved progress." : ["EXPIRED", "REVOKED", "REPLACED", "INVALID_LINK"].includes(code) ? "This link is no longer active. Please use the latest link or ask Ma Kitchens for a new one." : "We could not confirm your submission. Please retry; your submission ID prevents duplicates.");
        } finally { busy.current = false; setSubmitting(false); }
      }}
    >
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-clay">
          Your feedback
        </p>
        <h1 className="mt-3 font-serif text-4xl font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">
          How was your order?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-ink/65">
          Hi {customerName}, rate the dishes you tried and your delivery experience. It should take about a minute.
        </p>
        <p className="mt-3 text-sm text-ink/45">
          Delivered {deliveryDate} · {orderId}
        </p>
      </div>

      <p className="mt-5 text-center text-sm text-ink/65" role="status" aria-live="polite">
        {saveState === "saved" ? "Your progress is saved automatically" : saveState === "pending" || saveState === "saving" ? "Saving your progress…" : saveState === "conflict" ? "Progress changed in another tab. Reopen your link to resume." : "We could not confirm your progress was saved. Keep this page open and retry."}
      </p>
      {saveState === "error" && <button type="button" className="mx-auto mt-2 block underline" onClick={() => { void flushDraft().catch(() => {}); }}>Retry saving progress</button>}

      <fieldset disabled={submitting} className="mt-10 space-y-5">
        {dishes.map((dish) => {
          const answer = dishFeedback[dish.itemCode];

          return (
            <article
              key={dish.itemCode}
              className="overflow-hidden rounded-[1.5rem] border border-ink/10 bg-white shadow-sm"
            >
              <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
                <img
                  src={dish.imageUrl}
                  alt={dish.dishName}
                  className="h-48 w-full object-cover sm:h-full"
                  loading="lazy"
                />

                <div className="p-5 sm:p-6">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sage">
                    {dish.kitchenName}
                  </p>
                  <h2 className="mt-2 font-serif text-2xl font-medium leading-tight">
                    {dish.dishName}
                  </h2>

                  <div className="mt-5">
                    <p className="mb-2 text-sm font-medium text-ink/70">
                      Your rating
                    </p>
                    <Stars
                      label={`Rate ${dish.dishName}`}
                      value={answer.skipped ? 0 : answer.rating}
                      onChange={(rating) =>
                        updateDish(dish.itemCode, { rating, skipped: false })
                      }
                    />
                  </div>

                  <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink/65">
                    <input
                      type="checkbox"
                      checked={answer.skipped}
                      onChange={(event) =>
                        updateDish(dish.itemCode, {
                          skipped: event.target.checked,
                          rating: event.target.checked ? 0 : answer.rating,
                        })
                      }
                      className="h-5 w-5 accent-[#8a5a44]"
                    />
                    I didn&apos;t try this dish
                  </label>

                  {!answer.skipped && (
                    <div className="mt-4">
                      <label
                        htmlFor={`comment-${dish.itemCode}`}
                        className="text-sm font-medium text-ink/70"
                      >
                        Comment <span className="font-normal text-ink/40">(optional)</span>
                      </label>
                      <textarea
                        id={`comment-${dish.itemCode}`}
                        value={answer.comment}
                        onChange={(event) =>
                          updateDish(dish.itemCode, {
                            comment: event.target.value.slice(0, 600),
                          })
                        }
                        rows={2}
                        placeholder="Anything you would like the kitchen to know?"
                        className="mt-2 w-full resize-y rounded-2xl border border-ink/15 bg-cream/35 px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-ink/35 focus:border-clay"
                      />
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </fieldset>

      <fieldset disabled={submitting}>
      <section className="mt-8 rounded-[1.5rem] border border-ink/10 bg-oat/35 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-clay">
          Delivery
        </p>
        <h2 className="mt-2 font-serif text-2xl font-medium">
          How was your delivery experience?
        </h2>
        <div className="mt-4">
          <Stars
            label="Rate your delivery experience"
            value={deliveryRating}
            onChange={setDeliveryRating}
          />
        </div>
      </section>

      <section className="mt-5 rounded-[1.5rem] border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
        <label htmlFor="overall-comment" className="font-serif text-2xl font-medium">
          Anything else you&apos;d like us to know?
        </label>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          Optional. Tell us anything about the food, packaging, delivery or overall experience.
        </p>
        <textarea
          id="overall-comment"
          value={overallComment}
          onChange={(event) => setOverallComment(event.target.value.slice(0, 1200))}
          rows={4}
          placeholder="Your comments"
          className="mt-4 w-full resize-y rounded-2xl border border-ink/15 bg-cream/35 px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-ink/35 focus:border-clay"
        />
      </section>

      <section className="mt-5 rounded-[1.5rem] border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm leading-6 text-ink/65">
          Your dish ratings may be combined with ratings from other customers and displayed as an overall dish rating. Your identity will not be shown.
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink/70">
          <input
            type="checkbox"
            checked={testimonialConsent}
            onChange={(event) => setTestimonialConsent(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#8a5a44]"
          />
          <span>
            You may use my written feedback as an anonymous Ma Kitchens testimonial on your website, social media or other promotional material.
          </span>
        </label>

        <p className="mt-3 text-xs leading-5 text-ink/45">
          This is optional. We will not publish your full name, phone number or other identifying information. See our{" "}
          <a className="underline underline-offset-2 hover:text-clay" href="/privacy">
            Privacy Policy
          </a>.
        </p>
      </section>

      </fieldset>

      {!canSubmit && (
        <p className="mt-5 text-center text-sm text-ink/50">
          Please rate each dish you tried and your delivery before submitting.
        </p>
      )}

      {submitError && (
        <p role="alert" className="mt-5 text-center text-sm font-medium text-red-700">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting || saveState === "conflict"}
        className="mt-6 min-h-14 w-full rounded-full bg-clay px-8 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white transition enabled:hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Saving feedback..." : "Submit feedback"}
      </button>


    </form>
  );
}
