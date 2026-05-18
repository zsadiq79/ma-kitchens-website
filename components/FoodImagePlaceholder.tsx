type FoodImagePlaceholderProps = {
  label: string;
};

export function FoodImagePlaceholder({ label }: FoodImagePlaceholderProps) {
  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] border border-ink/10 bg-oat shadow-2xl shadow-ink/5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.9),transparent_28%),radial-gradient(circle_at_78%_32%,rgba(138,90,68,0.35),transparent_22%),radial-gradient(circle_at_44%_76%,rgba(119,123,104,0.35),transparent_24%)]" />
      <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink/10 bg-cream/80 p-6 shadow-xl shadow-ink/10">
        <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-clay/50 text-center font-serif text-3xl leading-tight text-clay">
          {label}
        </div>
      </div>
      <div className="absolute bottom-8 left-8 right-8 rounded-2xl bg-cream/80 p-5 text-sm leading-6 text-ink/70 backdrop-blur">
        A calm editorial placeholder for rich food photography, plated meals and kitchen moments.
      </div>
    </div>
  );
}
