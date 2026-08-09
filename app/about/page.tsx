import { TwoColumnSection } from "@/components/TwoColumnSection";

export const metadata = {
  title: "About | Ma Kitchens",
};

export default function AboutPage() {
  return (
    <TwoColumnSection
      eyebrow="About Ma Kitchens"
      imageAlt="A home cook preparing fresh food in a bright kitchen"
      imageLabel="Kitchen to customer"
      imageSrc="https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1600&q=85"
      priority
      title="Who we are"
    >
      <p className="body-copy">
        Ma Kitchens is an Australian startup helping talented multicultural home cooks become confident food entrepreneurs.
      </p>
      <p className="body-copy">
        We believe home-cooked meals carry tradition, memory and care. Our work is to help those dishes reach more tables while keeping the cook’s story at the centre.
      </p>
      <p className="body-copy">
        From kitchen to customer, we support cooks with practical steps, community encouragement and a calm pathway for navigating the early stages of selling food.
      </p>
      <p className="body-copy">
        The result is a growing network of local cooks sharing flavour, culture and opportunity with the communities around them.
      </p>
    </TwoColumnSection>
  );
}
