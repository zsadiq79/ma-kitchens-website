import crypto from "crypto";

export async function POST(request) {
  try {
    const rawBody = await request.text();

    const signature =
      request.headers.get("x-routific-signature");

    const secret =
      process.env.ROUTIFIC_WEBHOOK_SECRET;

    console.log(
  "Routific signature diagnostic:",
  {
    signaturePresent: Boolean(signature),
    signatureLength: signature ? signature.length : 0,
    signaturePrefix: signature
      ? signature.substring(0, 12)
      : null
  }
);
    if (!secret) {
      console.error(
        "ROUTIFIC_WEBHOOK_SECRET is not configured."
      );

      return Response.json(
        { error: "Webhook configuration error" },
        { status: 500 }
      );
    }

    if (!signature) {
      console.error(
        "Routific webhook received without signature."
      );

      return Response.json(
        { error: "Missing signature" },
        { status: 401 }
      );
    }

    const expectedSignature =
      crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");

    const suppliedBuffer =
      Buffer.from(signature, "utf8");

    const expectedBuffer =
      Buffer.from(expectedSignature, "utf8");

    const signatureIsValid =
      suppliedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(
        suppliedBuffer,
        expectedBuffer
      );

    if (!signatureIsValid) {
      console.error(
        "Routific webhook signature verification failed."
      );

      return Response.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);

    console.log(
      "Verified Routific webhook:",
      JSON.stringify(payload)
    );

    return Response.json({
      success: true,
      verified: true
    });

  } catch (error) {
    console.error(
      "Routific webhook error:",
      error
    );

    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
