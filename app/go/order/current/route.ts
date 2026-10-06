export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDERING_WHATSAPP_NUMBER = "61420246023";

type MenuMeal = {
  itemCode?: string;
  dishName?: string;
  price?: number;
  priceDisplay?: string;
  remainingServings?: number;
};

type MenuApiResponse = {
  ok?: boolean;
  status?: string;
  menuCycleId?: string;
  deliveryDateDisplay?: string;
  meals?: MenuMeal[];
  error?: string;
  message?: string;
};

async function fetchCurrentMenu(): Promise<MenuApiResponse> {
  const menuApiUrl = process.env.FLOW_MENU_API_URL;
  const menuApiSecret = process.env.FLOW_MENU_API_SECRET;

  if (!menuApiUrl || !menuApiSecret) {
    throw new Error("Menu service is not configured.");
  }

  const url = new URL(menuApiUrl);
  url.searchParams.set("action", "menu");

  const response = await fetch(url, {
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

  if (!response.ok) {
    throw new Error(`Menu service returned HTTP ${response.status}.`);
  }

  const menu = (await response.json()) as MenuApiResponse;

  if (
    !menu.ok ||
    menu.status !== "ACTIVE" ||
    !Array.isArray(menu.meals) ||
    menu.meals.length === 0
  ) {
    throw new Error(menu.message || menu.error || "No active menu is available.");
  }

  return menu;
}

function moneyLabel(meal: MenuMeal) {
  const display = String(meal.priceDisplay || "").trim();

  if (display) {
    return display;
  }

  const price = Number(meal.price);

  if (Number.isFinite(price) && price > 0) {
    return "$" + price.toFixed(2).replace(/\.00$/, "");
  }

  return "";
}

function buildEditableOrderMessage(menu: MenuApiResponse) {
  const availableMeals = (menu.meals || []).filter((meal) => {
    const name = String(meal.dishName || "").trim();
    const remaining = Number(meal.remainingServings ?? 0);

    return name && remaining > 0;
  });

  if (availableMeals.length === 0) {
    throw new Error("The current menu has no available dishes.");
  }

  const dishLines = availableMeals.map((meal) => {
    const name = String(meal.dishName || "").trim();
    const price = moneyLabel(meal);
    return `1 × ${name}${price ? ` - ${price}` : ""}`;
  });

  return [
    "Hi Ma Kitchens, I would like to place an order from this week's menu.",
    "",
    "Please edit this message before sending:",
    "• Change 1 to the quantity you want.",
    "• Delete any dishes you do not want.",
    "",
    menu.deliveryDateDisplay
      ? `Delivery: ${menu.deliveryDateDisplay}`
      : "",
    "",
    ...dishLines,
    "",
    "Please send this message after adjusting your order.",
  ]
    .filter((line, index, lines) => {
      if (line !== "") {
        return true;
      }

      return index > 0 && lines[index - 1] !== "";
    })
    .join("\n")
    .trim();
}

function whatsappUrl(message: string) {
  const url = new URL(`https://wa.me/${ORDERING_WHATSAPP_NUMBER}`);
  url.searchParams.set("text", message);
  return url;
}

export async function GET() {
  try {
    const menu = await fetchCurrentMenu();
    const message = buildEditableOrderMessage(menu);

    return Response.redirect(whatsappUrl(message), 302);
  } catch (error) {
    console.error("Unable to prepare current Ma Kitchens order message:", error);

    const fallbackMessage =
      "Hi Ma Kitchens, I would like to place an order. Please send me the current menu.";

    return Response.redirect(whatsappUrl(fallbackMessage), 302);
  }
}
