const fields = [
  { id: "first-name", name: "firstName", label: "First name", type: "text" },
  { id: "last-name", name: "lastName", label: "Last name", type: "text" },
  { id: "email", name: "email", label: "Email", type: "email" },
  { id: "phone", name: "phone", label: "Phone", type: "tel" },
];

export function ContactForm() {
  return (
    <form className="grid gap-5 rounded-[1.5rem] border border-ink/10 bg-white/40 p-5 shadow-xl shadow-ink/5 sm:p-7 lg:grid-cols-2 lg:p-8">
      {fields.map((field) => (
        <label key={field.id} className="grid gap-2 text-sm uppercase tracking-[0.2em] text-ink/60" htmlFor={field.id}>
          {field.label}
          <input
            className="min-w-0 rounded-xl border border-ink/15 bg-cream/70 px-4 py-3.5 text-base normal-case tracking-normal text-ink outline-none transition placeholder:text-ink/35 focus:border-clay focus:ring-4 focus:ring-clay/10"
            id={field.id}
            name={field.name}
            placeholder={field.label}
            type={field.type}
          />
        </label>
      ))}

      <button
        className="mt-1 rounded-full bg-clay px-8 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg shadow-clay/20 transition hover:-translate-y-0.5 hover:bg-ink lg:col-span-2 lg:justify-self-start"
        type="button"
      >
        Register interest
      </button>
    </form>
  );
}
