export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <section className="rounded-lg border border-sky-100 bg-white/95 p-4 shadow-sm shadow-sky-900/5 ring-1 ring-white">
      <div className="mb-3 h-1 w-10 rounded-full bg-sky-400" />
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </section>
  );
}

export function ActionButton({
  children,
  onClick,
  variant = "primary",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-sky-500 text-white shadow-sm shadow-sky-900/20 hover:bg-sky-600",
    secondary: "border border-sky-200 bg-white text-sky-700 hover:bg-sky-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-sky-300 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 ${props.className ?? ""}`}
    />
  );
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border border-sky-100 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 ${props.className ?? ""}`}
    />
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-sky-200 bg-sky-50/50 p-8 text-center text-sm font-semibold text-slate-500">{text}</div>;
}
