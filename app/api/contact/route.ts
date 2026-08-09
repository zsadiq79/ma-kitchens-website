import { NextResponse } from "next/server";

const CONTACT_EMAIL = "admin@makitchens.com.au";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
    return entities[character];
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  }

  const values = body as Record<string, unknown>;
  const firstName = typeof values.firstName === "string" ? values.firstName.trim() : "";
  const lastName = typeof values.lastName === "string" ? values.lastName.trim() : "";
  const email = typeof values.email === "string" ? values.email.trim() : "";
  const phone = typeof values.phone === "string" ? values.phone.trim() : "";

  if (!firstName || !lastName || !email || !phone) {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  }

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  if ([firstName, lastName, phone].some((value) => value.length > 100)) {
    return NextResponse.json({ error: "One or more fields are too long." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.error("Contact form email environment variables are not configured.");
    return NextResponse.json({ error: "The contact form is temporarily unavailable. Please email us directly." }, { status: 503 });
  }

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: fromEmail,
      html: `<h1>New Ma Kitchens enquiry</h1><p><strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Phone:</strong> ${escapeHtml(phone)}</p>`,
      reply_to: email,
      subject: `Website enquiry from ${firstName} ${lastName}`,
      to: [CONTACT_EMAIL],
    }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    console.error("Resend rejected a contact form submission:", response.status, await response.text());
    return NextResponse.json({ error: "We couldn't send your enquiry. Please try again or email us directly." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
