"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import { FormEvent, useState } from "react";

const fields = [
  { id: "first-name", name: "firstName", label: "First name", type: "text", autoComplete: "given-name" },
  { id: "last-name", name: "lastName", label: "Last name", type: "text", autoComplete: "family-name" },
  { id: "email", name: "email", label: "Email", type: "email", autoComplete: "email" },
  { id: "phone", name: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
];

const interestOptions = [
  "Becoming a cook",
  "Ordering food",
  "Partnership / business enquiry",
  "General enquiry",
];

type Status = { type: "success" | "error"; message: string } | null;

export function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/contact", {
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "We couldn't send your enquiry. Please try again.");
      }

      track("contact_form_submit_success");
      form.reset();
      setStatus({ type: "success", message: "Thank you. Your enquiry has been sent successfully." });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "We couldn't send your enquiry. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-5 border-t border-ink/15 pt-8 sm:grid-cols-2 md:border-l md:border-t-0 md:pl-10 md:pt-0 lg:pl-14" onSubmit={handleSubmit}>
      {fields.map((field) => (
        <label key={field.id} className="grid gap-2 text-sm uppercase tracking-[0.2em] text-ink/60" htmlFor={field.id}>
          {field.label}
          <input
            autoComplete={field.autoComplete}
            className="min-w-0 rounded-full border border-ink/20 bg-white/45 px-5 py-3.5 text-base normal-case tracking-normal text-ink outline-none transition placeholder:text-ink/35 focus:border-clay focus:ring-4 focus:ring-clay/10 invalid:not-placeholder-shown:border-red-700 sm:py-4"
            id={field.id}
            maxLength={field.type === "email" ? 254 : 100}
            name={field.name}
            placeholder={field.label}
            required
            type={field.type}
          />
        </label>
      ))}

      <label className="grid gap-2 text-sm uppercase tracking-[0.2em] text-ink/60 md:col-span-2" htmlFor="interest">
        I&apos;m interested in
        <select
          className="min-w-0 rounded-full border border-ink/20 bg-white/45 px-5 py-3.5 text-base normal-case tracking-normal text-ink outline-none transition focus:border-clay focus:ring-4 focus:ring-clay/10 sm:py-4"
          defaultValue=""
          id="interest"
          name="interest"
          required
        >
          <option disabled value="">Select an option</option>
          {interestOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm uppercase tracking-[0.2em] text-ink/60 md:col-span-2" htmlFor="message">
        Message <span className="normal-case tracking-normal text-ink/40">(optional)</span>
        <textarea
          className="min-h-32 min-w-0 resize-y rounded-3xl border border-ink/20 bg-white/45 px-5 py-3.5 text-base normal-case tracking-normal text-ink outline-none transition placeholder:text-ink/35 focus:border-clay focus:ring-4 focus:ring-clay/10 sm:py-4"
          id="message"
          maxLength={2000}
          name="message"
          placeholder="Tell us a little more"
          rows={4}
        />
      </label>

      {status && (
        <p
          className={`text-sm normal-case tracking-normal md:col-span-2 ${status.type === "success" ? "text-green-800" : "text-red-800"}`}
          role={status.type === "error" ? "alert" : "status"}
        >
          {status.message}
        </p>
      )}

      <button
        className="mt-1 w-full rounded-full bg-ink px-7 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-cream transition hover:bg-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:text-sm md:col-span-2 md:justify-self-start"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Sending…" : "Register interest"}
      </button>

      <p className="text-xs leading-5 text-ink/55 sm:text-sm sm:leading-6 md:col-span-2">
        By submitting this form, you agree that Ma Kitchens may collect and use the information you provide to respond to your enquiry and contact you about Ma Kitchens. See our{" "}
        <Link className="underline decoration-ink/30 underline-offset-2 transition hover:text-ink" href="/privacy">
          Privacy Policy
        </Link>{" "}
        for more information.
      </p>
    </form>
  );
}
