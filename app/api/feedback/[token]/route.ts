import { NextResponse } from "next/server";

import { submitFeedback } from "@/lib/feedbackApi";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || token.length > 200) {
    return NextResponse.json({ error: "Invalid feedback link." }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid feedback submission." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid feedback submission." }, { status: 400 });
  }

  try {
    await submitFeedback(token, body as Record<string, unknown>);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback submission failed:", error);
    return NextResponse.json(
      { error: "We couldn't save your feedback. Please try again." },
      { status: 502 },
    );
  }
}
