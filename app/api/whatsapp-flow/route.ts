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

type MenuMeal = {
  id: string;
  itemCode: string;
  kitchenName: string;
  dishName: string;
  description: string;
  portion: string;
  price: number;
  priceDisplay: string;
  imageUrl: string;
  remainingServings: number;
};

type MenuApiResponse = {
  ok: boolean;
  status?: string;
  menuCycleId?: string;
  deliveryDate?: string;
  deliveryDateDisplay?: string;
  orderDeadline?: string;
  orderDeadlineDisplay?: string;
  mealCount?: number;
  meals?: MenuMeal[];
  error?: string;
  message?: string;
};

type FlowMealOption = {
  id: string;
  title: string;
  description: string;
  metadata: string;
  image?: string;
  "alt-text"?: string;
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

function truncate(value: string, maxLength: number) {
  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}

async function fetchActiveMenu(): Promise<MenuApiResponse> {
  const menuApiUrl = process.env.FLOW_MENU_API_URL;
  const menuApiSecret = process.env.FLOW_MENU_API_SECRET;

  if (!menuApiUrl || !menuApiSecret) {
    throw new FlowEndpointError(
      503,
      "WhatsApp Flow menu environment variables are not configured.",
    );
  }

  const url = new URL(menuApiUrl);
  url.searchParams.set("action", "menu");

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: menuApiSecret,
      }),
      cache: "no-store",
      redirect: "follow",
    });
  } catch (error) {
    console.error("Unable to reach Apps Script menu feed:", error);
    throw new FlowEndpointError(502, "Unable to reach the menu service.");
  }

  if (!response.ok) {
    console.error("Apps Script menu feed returned HTTP", response.status);
    throw new FlowEndpointError(502, "Menu service returned an error.");
  }

  let menu: MenuApiResponse;

  try {
    menu = (await response.json()) as MenuApiResponse;
  } catch (error) {
    console.error("Apps Script menu feed returned invalid JSON:", error);
    throw new FlowEndpointError(502, "Menu service returned invalid data.");
  }

  if (!menu.ok) {
    console.error("Apps Script menu feed error:", menu.error, menu.message);
    throw new FlowEndpointError(502, "Menu service could not build the menu.");
  }

  if (menu.status !== "ACTIVE" || !Array.isArray(menu.meals)) {
    throw new FlowEndpointError(409, "No active menu is currently available.");
  }

  return menu;
}

function getFlowThumbnailUrl(imageUrl: string) {
  const baseUrl =
    process.env.FLOW_THUMBNAIL_BASE_URL ||
    "https://www.makitchens.com.au/flow-thumbnails";

  try {
    const pathname = new URL(imageUrl).pathname;
    const filename = pathname.split("/").pop() || "";
    const stem = filename.replace(/\.[^.]+$/, "");
    const safeStem = stem.replace(/[^A-Za-z0-9_-]/g, "");

    if (!safeStem) {
      return null;
    }

    return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(safeStem)}.jpg`;
  } catch {
    return null;
  }
}

async function fetchThumbnailBase64(imageUrl: string) {
  const thumbnailUrl = getFlowThumbnailUrl(imageUrl);

  if (!thumbnailUrl) {
    return undefined;
  }

  try {
    const response = await fetch(thumbnailUrl, {
      cache: "force-cache",
    });

    if (!response.ok) {
      console.warn("Flow thumbnail unavailable:", thumbnailUrl, response.status);
      return undefined;
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    // Meta's CheckboxGroup image limit is 100 KB. Keep a little safety margin.
    if (bytes.length > 95 * 1024) {
      console.warn("Flow thumbnail exceeds safe size limit:", thumbnailUrl);
      return undefined;
    }

    return bytes.toString("base64");
  } catch (error) {
    console.warn("Unable to load Flow thumbnail:", thumbnailUrl, error);
    return undefined;
  }
}

async function buildFlowMealOptions(meals: MenuMeal[]): Promise<FlowMealOption[]> {
  return Promise.all(
    meals.map(async (meal) => {
      const image = meal.imageUrl
        ? await fetchThumbnailBase64(meal.imageUrl)
        : undefined;

      const descriptionParts = [meal.kitchenName, meal.description]
        .map((value) => value.trim())
        .filter(Boolean);

      const metadataParts = [meal.portion, meal.priceDisplay]
        .map((value) => value.trim())
        .filter(Boolean);

      const option: FlowMealOption = {
        id: meal.itemCode || meal.id,
        title: truncate(meal.dishName, 30),
        description: truncate(descriptionParts.join(" · "), 300),
        metadata: truncate(metadataParts.join(" · "), 20),
      };

      if (image) {
        option.image = image;
        option["alt-text"] = truncate(meal.dishName, 80);
      }

      return option;
    }),
  );
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

  if (action === "INIT") {
    const menu = await fetchActiveMenu();
    const meals = await buildFlowMealOptions(menu.meals || []);

    if (meals.length === 0) {
      throw new FlowEndpointError(409, "No orderable meals are currently available.");
    }

    console.log("WhatsApp Flow active menu loaded:", {
      menuCycleId: menu.menuCycleId,
      deliveryDate: menu.deliveryDate,
      mealCount: meals.length,
    });

    return {
      screen: "SELECT_MEALS",
      data: {
        meals,
      },
    };
  }

  if (action === "data_exchange") {
    if (screen === "SELECT_MEALS") {
      return {
        screen: "QUANTITIES",
        data: {},
      };
    }

    return {
      screen: screen || "SELECT_MEALS",
      data: {
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
