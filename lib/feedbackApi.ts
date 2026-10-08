export type FeedbackDish = {
  itemCode: string;
  dishName: string;
  kitchenName: string;
  imageUrl: string;
};

export type FeedbackOrder = {
  customerName: string;
  deliveryDate: string;
  orderId: string;
  status: "OPEN" | "COMPLETED";
  dishes: FeedbackDish[];
};

type FeedbackServiceResponse = {
  ok: boolean;
  feedback?: FeedbackOrder;
  error?: string;
  message?: string;
};

function getFeedbackServiceConfig() {
  const url = process.env.FLOW_MENU_API_URL;
  const secret = process.env.FLOW_MENU_API_SECRET;

  if (!url || !secret) {
    throw new Error("Feedback service environment variables are not configured.");
  }

  return { url, secret };
}

async function callFeedbackService(
  action: "feedback_read" | "feedback_submit",
  payload: Record<string, unknown>,
) {
  const { url, secret } = getFeedbackServiceConfig();
  const endpoint = new URL(url);
  endpoint.searchParams.set("action", action);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, ...payload }),
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Feedback service returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as FeedbackServiceResponse;

  if (!data.ok) {
    throw new Error(data.message || data.error || "Feedback service returned an error.");
  }

  return data;
}

export async function getFeedbackOrder(token: string): Promise<FeedbackOrder> {
  const data = await callFeedbackService("feedback_read", { token });

  if (!data.feedback) {
    throw new Error("Feedback order was not returned.");
  }

  return data.feedback;
}

export async function submitFeedback(
  token: string,
  submission: Record<string, unknown>,
) {
  return callFeedbackService("feedback_submit", { token, submission });
}
