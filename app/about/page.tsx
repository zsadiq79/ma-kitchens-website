import { TwoColumnSection } from "@/components/TwoColumnSection";

export const metadata = {
  title: "About | Ma Kitchens",
};

export default function AboutPage() {
  return (
    <TwoColumnSection
      eyebrow="About Ma Kitchens"
      imageAlt="A home cook preparing fresh food in a warm kitchen"
      imageCaption="From your kitchen to your community."
      imageSrc="https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1600&q=85"
      title="Who we are"
    >
      <p>
        Ma Kitchens is an Australian startup helping talented multicultural home cooks become confident food entrepreneurs.
      </p>
      <p>
        We believe home-cooked meals carry tradition, memory and care. Our work is to help those dishes reach more tables while keeping the cook’s story at the centre.
      </p>
      <p>
        From kitchen to customer, we support cooks with practical steps, community encouragement and a calm pathway for navigating the early stages of selling food.
      </p>
      <p>
        The result is a growing network of local cooks sharing flavour, culture and opportunity with the communities around them.
      </p>
    </TwoColumnSection>
  );
}
