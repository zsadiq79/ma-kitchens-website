const fields = [
  { id: "first-name", name: "firstName", label: "First name", type: "text" },
  { id: "last-name", name: "lastName", label: "Last name", type: "text" },
  { id: "email", name: "email", label: "Email", type: "email" },
  { id: "phone", name: "phone", label: "Phone", type: "tel" },
];

export function ContactForm() {
  return (
    <form className="grid gap-5 rounded-[2rem] border border-ink/10 bg-cream p-6 shadow-2xl shadow-ink/5 md:grid-cols-2 md:p-8">
      {fields.map((field) => (
        <label key={field.id} className="grid gap-2 text-sm uppercase tracking-[0.2em] text-ink/60" htmlFor={field.id}>
          {field.label}
          <input
            className="rounded-full border border-ink/15 bg-white/60 px-5 py-4 text-base normal-case tracking-normal text-ink outline-none transition placeholder:text-ink/35 focus:border-clay focus:ring-4 focus:ring-clay/10"
            id={field.id}
            name={field.name}
            placeholder={field.label}
            type={field.type}
          />
        </label>
      ))}

      <button
        className="mt-2 rounded-full bg-ink px-8 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-cream transition hover:bg-clay md:col-span-2 md:justify-self-start"
        type="button"
      >
        Register interest
      </button>
    </form>
  );
}
