import crypto from "crypto";

export async function POST(request) {
  try {
    /*
     * STEP 1
     * Read the exact raw body sent by Routific.
     * The HMAC signature must be checked against this
     * exact string before JSON parsing.
     */
    const rawBody = await request.text();

    const signature =
      request.headers.get("x-routific-signature");

    const routificSecret =
      process.env.ROUTIFIC_WEBHOOK_SECRET;

    if (!routificSecret) {
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

    /*
     * STEP 2
     * Verify Routific's HMAC SHA256 signature.
     */
    const expectedSignature =
      crypto
        .createHmac("sha256", routificSecret)
        .update(rawBody)
        .digest("hex");

    const suppliedSignature =
      signature.startsWith("v0=")
        ? signature.substring(3)
        : signature;

    const suppliedBuffer =
      Buffer.from(suppliedSignature, "utf8");

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

    /*
     * STEP 3
     * Only parse the payload after Routific has been
     * authenticated successfully.
     */
    const payload = JSON.parse(rawBody);

    console.log(
      "Verified Routific webhook:",
      JSON.stringify(payload)
    );

    /*
     * STEP 4
     * Load the private Control Tower forwarding settings.
     */
    const controlTowerUrl =
      process.env.CONTROL_TOWER_WEBHOOK_URL;

    const controlTowerSecret =
      process.env.CONTROL_TOWER_WEBHOOK_SECRET;

    if (!controlTowerUrl) {
      console.error(
        "CONTROL_TOWER_WEBHOOK_URL is not configured."
      );

      return Response.json(
        { error: "Control Tower URL is not configured" },
        { status: 500 }
      );
    }

    if (!controlTowerSecret) {
      console.error(
        "CONTROL_TOWER_WEBHOOK_SECRET is not configured."
      );

      return Response.json(
        { error: "Control Tower secret is not configured" },
        { status: 500 }
      );
    }

    /*
     * STEP 5
     * Forward only the already verified Routific payload
     * to the Apps Script Control Tower receiver.
     *
     * Apps Script Web Apps cannot reliably inspect arbitrary
     * request headers, so the private Vercel-to-Control-Tower
     * secret is included inside this JSON body.
     */
    const controlTowerResponse =
      await fetch(controlTowerUrl, {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          controlTowerSecret:
            controlTowerSecret,

          payload:
            payload
        }),

        redirect: "follow"
      });

    const controlTowerText =
      await controlTowerResponse.text();

    console.log(
      "Control Tower response:",
      controlTowerText
    );

    /*
     * Google Apps Script ContentService may return HTTP 200
     * even when its JSON body reports an application error.
     * Therefore inspect the JSON response as well.
     */
    let controlTowerResult;

    try {
      controlTowerResult =
        JSON.parse(controlTowerText);
    } catch (parseError) {
      console.error(
        "Control Tower returned non-JSON response."
      );

      return Response.json(
        {
          error:
            "Invalid response from Control Tower"
        },
        { status: 502 }
      );
    }

    if (
      controlTowerResult.status !== 200
    ) {
      console.error(
        "Control Tower rejected webhook:",
        controlTowerText
      );

      return Response.json(
        {
          error:
            "Control Tower rejected webhook",
          controlTowerStatus:
            controlTowerResult.status
        },
        { status: 502 }
      );
    }

    /*
     * STEP 6
     * Routific receives success only after the Control Tower
     * has accepted the forwarded event.
     */
    return Response.json({
      success: true,
      verified: true,
      controlTowerAccepted: true
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
