import type { Metadata } from "next";

import { DemoFeedbackForm } from "@/components/DemoFeedbackForm";

export const metadata: Metadata = {
  title: "Feedback Demonstration | Ma Kitchens",
  description: "A self-contained demonstration of the Ma Kitchens feedback form.",
  robots: { index: false, follow: false },
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
      imageUrl: "/menu-images/Dish-0003.jpg",
    },
    {
      itemCode: "M0004",
      dishName: "Aalo Gobhi",
      kitchenName: "CURRY IN A HURRY",
      imageUrl: "/menu-images/Dish-0004.jpg",
    },
    {
      itemCode: "M0012",
      dishName: "Chicken Biryani",
      kitchenName: "DASTARKHWAAN",
      imageUrl: "/menu-images/Dish-0012.jpg",
    },
    {
      itemCode: "M0015",
      dishName: "Gajrela",
      kitchenName: "FOODIE CLUB",
      imageUrl: "/menu-images/Dish-0015.jpg",
    },
    {
      itemCode: "M0016",
      dishName: "Crème caramel",
      kitchenName: "FOODIE CLUB",
      imageUrl: "/menu-images/Dish-0016.jpg",
    },
  ],
};

export default function DemoFeedbackPage() {
  return (
    <main className="min-h-screen bg-cream text-ink">
      <aside className="border-b border-clay/25 bg-oat px-5 py-5 text-center" aria-label="Demonstration notice">
        <p className="font-semibold text-clay">Demonstration only</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6">
          Sample order for Sameera. Ratings and comments stay in this page&apos;s memory.
          Nothing is sent, saved or tracked. Reloading clears your answers.
        </p>
      </aside>
      <DemoFeedbackForm {...demoFeedback} />
    </main>
  );
}
