import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FeedbackForm } from "@/components/FeedbackForm";

export const metadata: Metadata = {
  title: "Order Feedback | Ma Kitchens",
  description: "Share feedback on your Ma Kitchens order.",
};

const demoFeedback = {
  customerName: "Sameera",
  deliveryDate: "24 September 2026",
  orderId: "ORD-000017",
  dishes: [
    {
      itemCode: "M0003",
      dishName: "Tadka Daal",
      kitchenName: "CURRY IN A HURRY",
      imageUrl: "https://www.makitchens.com.au/menu-images/Dish-0003.jpg",
    },
    {
      itemCode: "M0004",
      dishName: "Aalo Gobhi",
      kitchenName: "CURRY IN A HURRY",
      imageUrl: "https://www.makitchens.com.au/menu-images/Dish-0004.jpg",
    },
    {
      itemCode: "M0012",
      dishName: "Chicken Biryani",
      kitchenName: "DASTARKHWAAN",
      imageUrl: "https://www.makitchens.com.au/menu-images/Dish-0012.jpg",
    },
    {
      itemCode: "M0015",
      dishName: "Gajrela",
      kitchenName: "FOODIE CLUB",
      imageUrl: "https://www.makitchens.com.au/menu-images/Dish-0015.jpg",
    },
    {
      itemCode: "M0016",
      dishName: "Crème caramel",
      kitchenName: "FOODIE CLUB",
      imageUrl: "https://www.makitchens.com.au/menu-images/Dish-0016.jpg",
    },
  ],
};

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (token !== "demo-sameera") {
    notFound();
  }

  return (
    <div className="min-h-[70vh] bg-cream text-ink">
      <FeedbackForm {...demoFeedback} />
    </div>
  );
}
