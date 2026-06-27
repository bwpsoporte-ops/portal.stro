type Tone = "green" | "amber" | "red" | "blue" | "slate";

const tones: Record<Tone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
  blue: "border-sky-200 bg-sky-50 text-sky-700",
  slate: "border-slate-200 bg-white text-slate-700",
};

export function StatusBadge({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex min-w-20 items-center justify-center rounded-md border px-2 py-1 text-xs font-black shadow-sm ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (["APPROVED", "ACTIVO", "ENVIADA", "PROCESADO", "INFO"].includes(status)) return "green";
  if (["PENDING", "PENDIENTE", "WARNING", "RECIBIDO", "REINTENTO"].includes(status)) return "amber";
  if (["REJECTED", "FAILED", "FALLIDA", "CRITICAL", "ERROR", "VENCIDO", "AGOTADO"].includes(status)) return "red";
  if (["REFUNDED"].includes(status)) return "blue";
  return "slate";
}
