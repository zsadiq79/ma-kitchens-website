const messages: Record<string, [string, string]> = {
  INVALID_LINK: ["This feedback link is unavailable", "Please ask Ma Kitchens for a new link."],
  EXPIRED: ["This feedback link has expired", "Please ask Ma Kitchens for a new link."],
  REVOKED: ["This feedback link is no longer active", "Please use the latest link from Ma Kitchens."],
  REPLACED: ["A newer feedback link is available", "Please use the latest link from Ma Kitchens."],
  LEGACY_IN_PROGRESS: ["Your WhatsApp feedback is in progress", "Please finish your feedback in WhatsApp. Your existing ratings will not be duplicated."],
  COMPLETED: ["Your feedback is already complete", "Thank you. Only one completed submission is accepted per order."],
  TEMPORARY_ERROR: ["Feedback is temporarily unavailable", "Your saved progress is safe. Please reopen this link shortly."],
};
export function FeedbackState({ state }: { state: string }) {
  const [title, text] = messages[state] || messages.TEMPORARY_ERROR;
  return <main className="mx-auto min-h-[60vh] max-w-2xl px-5 py-20 text-center"><h1 className="font-serif text-4xl">{title}</h1><p className="mt-6 leading-7">{text}</p></main>;
}
