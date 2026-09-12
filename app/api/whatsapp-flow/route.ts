import crypto from "node:crypto";

export const runtime = "nodejs";

type EncryptedFlowRequest = {
  encrypted_aes_key: string;
  encrypted_flow_data: string;
  initial_vector: string;
};

type FlowRequestBody = {
  version?: string;
  action?: string;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
};

class FlowEndpointError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "FlowEndpointError";
    this.statusCode = statusCode;
  }
}

function normalizePem(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function isEncryptedFlowRequest(value: unknown): value is EncryptedFlowRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;

  return (
    typeof body.encrypted_aes_key === "string" &&
    typeof body.encrypted_flow_data === "string" &&
    typeof body.initial_vector === "string"
  );
}

function isRequestSignatureValid(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
) {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const receivedHex = signatureHeader.slice("sha256=".length);
  const expectedHex = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  if (receivedHex.length !== expectedHex.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(receivedHex, "utf8"),
    Buffer.from(expectedHex, "utf8"),
  );
}

function decryptRequest(
  body: EncryptedFlowRequest,
  privatePem: string,
  passphrase: string,
) {
  const privateKey = crypto.createPrivateKey({
    key: privatePem,
    passphrase,
  });

  let aesKeyBuffer: Buffer;

  try {
    aesKeyBuffer = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(body.encrypted_aes_key, "base64"),
    );
  } catch (error) {
    console.error("WhatsApp Flow AES key decryption failed:", error);

    // Meta uses 421 to request a refresh of the business public key.
    throw new FlowEndpointError(
      421,
      "Unable to decrypt the WhatsApp Flow request.",
    );
  }

  const flowDataBuffer = Buffer.from(body.encrypted_flow_data, "base64");
  const initialVectorBuffer = Buffer.from(body.initial_vector, "base64");
  const tagLength = 16;

  if (flowDataBuffer.length <= tagLength) {
    throw new FlowEndpointError(400, "Invalid encrypted Flow payload.");
  }

  const encryptedBody = flowDataBuffer.subarray(0, -tagLength);
  const authTag = flowDataBuffer.subarray(-tagLength);

  const decipher = crypto.createDecipheriv(
    "aes-128-gcm",
    aesKeyBuffer,
    initialVectorBuffer,
  );

  decipher.setAuthTag(authTag);

  const decryptedJson = Buffer.concat([
    decipher.update(encryptedBody),
    decipher.final(),
  ]).toString("utf8");

  return {
    decryptedBody: JSON.parse(decryptedJson) as FlowRequestBody,
    aesKeyBuffer,
    initialVectorBuffer,
  };
}

function encryptResponse(
  response: Record<string, unknown>,
  aesKeyBuffer: Buffer,
  initialVectorBuffer: Buffer,
) {
  // Meta's Flow protocol requires every bit of the request IV to be flipped
  // before encrypting the response.
  const flippedIv = Buffer.from(
    initialVectorBuffer.map((byte) => byte ^ 0xff),
  );

  const cipher = crypto.createCipheriv(
    "aes-128-gcm",
    aesKeyBuffer,
    flippedIv,
  );

  return Buffer.concat([
    cipher.update(JSON.stringify(response), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}

async function getNextScreen(body: FlowRequestBody) {
  const { action, data, screen, flow_token: flowToken } = body;

  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  if (data?.error) {
    console.warn("WhatsApp Flow client reported an error:", data);

    return {
      data: {
        acknowledged: true,
      },
    };
  }

  // The ordering screens will be connected in the next build step.
  if (action === "INIT") {
    return {
      screen: "SELECT_MEALS",
      data: {
        endpoint_ready: true,
      },
    };
  }

  if (action === "data_exchange") {
    return {
      screen: screen || "SELECT_MEALS",
      data: {
        endpoint_ready: true,
        flow_token: flowToken || "",
      },
    };
  }

  throw new FlowEndpointError(400, "Unhandled WhatsApp Flow request.");
}

export async function GET() {
  return Response.json({
    service: "ma-kitchens-whatsapp-flow",
    status: "ok",
  });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const privateKeyValue = process.env.WHATSAPP_FLOW_PRIVATE_KEY;
  const passphrase = process.env.WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE || "";

  if (!appSecret || !privateKeyValue) {
    console.error(
      "WhatsApp Flow endpoint environment variables are not configured.",
    );
    return new Response("Endpoint not configured", { status: 503 });
  }

  const rawBody = await request.text();

  if (
    !isRequestSignatureValid(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      appSecret,
    )
  ) {
    console.error("WhatsApp Flow request signature did not match.");
    return new Response(null, { status: 432 });
  }

  let encryptedRequest: unknown;

  try {
    encryptedRequest = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!isEncryptedFlowRequest(encryptedRequest)) {
    return new Response("Invalid Flow request", { status: 400 });
  }

  try {
    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(
      encryptedRequest,
      normalizePem(privateKeyValue),
      passphrase,
    );

    console.log("WhatsApp Flow request:", {
      action: decryptedBody.action,
      screen: decryptedBody.screen,
      version: decryptedBody.version,
    });

    const response = await getNextScreen(decryptedBody);
    const encryptedResponse = encryptResponse(
      response,
      aesKeyBuffer,
      initialVectorBuffer,
    );

    return new Response(encryptedResponse, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("WhatsApp Flow endpoint error:", error);

    if (error instanceof FlowEndpointError) {
      return new Response(error.message, { status: error.statusCode });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}
