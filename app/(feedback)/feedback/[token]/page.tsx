import { FeedbackState } from "@/components/FeedbackState";

// Retired path-token links do not fetch orders or reveal a working form.
export default function RetiredFeedbackLink() {
  return <FeedbackState state="INVALID_LINK" />;
}
