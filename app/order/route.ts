import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDERING_WHATSAPP_NUMBER = "61420426023";

type MenuMeal = {
  itemCode?: string;
  dishName?: string;
  priceDisplay?: string;
  remainingServings?: number;
};

type MenuApiResponse = {
  ok?: boolean;
  status?: string;
  deliveryDateDisplay?: string;
  meals?: MenuMeal[];
};

async function fetchActiveMenu(): Promise<MenuApiResponse> {
  const menuApiUrl = process.env.FLOW_MENU_API_URL;
  const menuApiSecret = process.env.FLOW_MENU_API_SECRET;

  if (!menuApiUrl || !menuApiSecret) {
    throw new Error("Menu service is not configured.");
  }

  const url = new URL(menuApiUrl);
  url.searchParams.set("action", "menu");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: menuApiSecret }),
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error("Menu service returned an error.");
  }

  const menu = (await response.json()) as MenuApiResponse;

  if (!menu.ok || menu.status !== "ACTIVE" || !Array.isArray(menu.meals)) {
    throw new Error("No active menu is available.");
  }

  return menu;
}

function buildPrefilledOrderMessage(menu: MenuApiResponse) {
  const availableMeals = (menu.meals || []).filter((meal) => {
    const remaining = Number(meal.remainingServings ?? 0);
    return String(meal.dishName || "").trim() && remaining > 0;
  });

  if (!availableMeals.length) {
    throw new Error("No meals are currently available.");
  }

  const lines = availableMeals.map((meal) => {
    const name = String(meal.dishName || "").trim();
    const price = String(meal.priceDisplay || "").trim();
    const itemCode = String(meal.itemCode || "").trim();
    const label = [itemCode, name].filter(Boolean).join(" - ");
    return "1 x " + label + (price ? " (" + price + ")" : "");
  });

  return [
    "Hi Ma Kitchens, I would like to place an order.",
    "",
    "IMPORTANT: Please edit this list before sending.",
    "Delete any dishes you do not want and change 1 to the quantity you want for each dish.",
    "",
    menu.deliveryDateDisplay
      ? "Delivery: " + menu.deliveryDateDisplay
      : "",
    "",
    ...lines,
  ]
    .filter((line, index, all) => {
      if (line !== "") return true;
      return index === 0 || all[index - 1] !== "";
    })
    .join("\n")
    .trim();
}

function orderingChatUrl(text: string) {
  const url = new URL("https://wa.me/" + ORDERING_WHATSAPP_NUMBER);
  url.searchParams.set("text", text);
  return url;
}

export async function GET() {
  try {
    const menu = await fetchActiveMenu();
    const message = buildPrefilledOrderMessage(menu);

    return NextResponse.redirect(orderingChatUrl(message), 302);
  } catch (error) {
    console.error("Unable to build prefilled Ma Kitchens order:", error);

    return NextResponse.redirect(
      orderingChatUrl(
        "Hi Ma Kitchens, I would like to place an order. Please send me the current menu."
      ),
      302,
    );
  }
}
