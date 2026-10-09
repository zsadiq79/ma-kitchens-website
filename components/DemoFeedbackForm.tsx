"use client";

import { useMemo, useState } from "react";

type DishFeedback = {
  itemCode: string;
  dishName: string;
  kitchenName: string;
  imageUrl: string;
};

type DemoFeedbackFormProps = {
  customerName: string;
  deliveryDate: string;
  orderId: string;
  dishes: DishFeedback[];
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

export function DemoFeedbackForm({
  customerName,
  deliveryDate,
  orderId,
  dishes,
}: DemoFeedbackFormProps) {
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
    useState<Record<string, DishState>>(initialDishState);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [overallComment, setOverallComment] = useState("");
  const [testimonialConsent, setTestimonialConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
      <section role="status" className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-6 sm:py-20">
        <div className="rounded-[2rem] border border-ink/10 bg-white px-6 py-12 shadow-sm sm:px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage text-2xl text-white">
            ✓
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-clay">
            Demonstration complete
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
            Thank you, {customerName}.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-ink/65">
            This was a local demonstration. No feedback was sent or saved, and nothing was written to the Ma Kitchens Control Tower.
          </p>
          <p className="mt-6 text-sm text-ink/45">Order {orderId}</p>
        </div>
      </section>
    );
  }

  return (
    <form
      className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) setSubmitted(true);
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

      <div className="mt-10 space-y-5">
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
      </div>

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
          Demonstration of the consent options only. These ratings and comments will not be collected, combined, published or saved.
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink/70">
          <input
            type="checkbox"
            checked={testimonialConsent}
            onChange={(event) => setTestimonialConsent(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#8a5a44]"
          />
          <span>
            Example consent: You may use my written feedback as an anonymous Ma Kitchens testimonial.
          </span>
        </label>

        <p className="mt-3 text-xs leading-5 text-ink/45">
          This checkbox has no effect outside this demonstration. See our{" "}
          <a className="underline underline-offset-2 hover:text-clay" href="/privacy">
            Privacy Policy
          </a>.
        </p>
      </section>

      {!canSubmit && (
        <p className="mt-5 text-center text-sm text-ink/50">
          Please rate each dish you tried and your delivery before submitting.
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-6 min-h-14 w-full rounded-full bg-clay px-8 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white transition enabled:hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        Submit demonstration
      </button>
    </form>
  );
}
