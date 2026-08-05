"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { ActionButton, EmptyState, SelectInput, TextInput } from "@/components/ui";

type InvoiceDocument = {
  id: string;
  document_number: string;
  source: "CASH" | "SERVICE" | "PROFORMA" | "MANUAL";
  customer_name: string;
  customer_email: string | null;
  customer_rtn: string | null;
  unit_number: string | null;
  currency: "USD" | "HNL";
  subtotal: string;
  tax: string;
  total: string;
  amount_paid: string;
  credited_amount: string;
  status: string;
  cai: string | null;
  created_at: string;
  items: Array<{ description: string; total: string }>;
};

const money = (value: number, currency: "USD" | "HNL") => new Intl.NumberFormat(currency === "HNL" ? "es-HN" : "en-US", { style: "currency", currency }).format(value || 0);
const sourceName: Record<string, string> = { CASH: "Caja", SERVICE: "Servicios", PROFORMA: "Proforma", MANUAL: "Manual" };

export default function FacturasPage() {
  const [documents, setDocuments] = useState<InvoiceDocument[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [currency, setCurrency] = useState("ALL");
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/billing?type=INVOICE", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "No se pudieron cargar las facturas.");
    setDocuments(data.documents ?? []);
  }, []);

  useEffect(() => { void load().catch((failure) => setError(failure instanceof Error ? failure.message : "No se pudieron cargar las facturas.")); }, [load]);

  const filtered = useMemo(() => documents.filter((invoice) => {
    const haystack = [invoice.document_number, invoice.customer_name, invoice.customer_email, invoice.customer_rtn, invoice.unit_number, ...invoice.items.map((item) => item.description)].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(search.toLowerCase())
      && (status === "ALL" || invoice.status === status)
      && (source === "ALL" || invoice.source === source)
      && (currency === "ALL" || invoice.currency === currency)
      && (!date || invoice.created_at.startsWith(date));
  }), [currency, date, documents, search, source, status]);

  const send = async (id: string) => {
    setError(""); setMessage("");
    const response = await fetch(`/api/billing/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SEND" }) });
    const result = await response.json();
    if (!response.ok) { setError(result.message || "No se pudo enviar la factura."); return; }
    setMessage("Factura enviada por correo con su PDF fiscal.");
    await load();
  };

  return (
    <>
      <PageHeader title="Facturas" description="Consulta central de todas las facturas fiscales generadas por Caja, Pagos de Servicios y conversiones de proformas." />
      <div className="space-y-5 p-5">
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-3 xl:grid-cols-6">
          <TextInput placeholder="Número, cliente, RTN o bodega" value={search} onChange={(event) => setSearch(event.target.value)} />
          <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <SelectInput value={source} onChange={(event) => setSource(event.target.value)}><option value="ALL">Todos los módulos</option><option value="CASH">Caja</option><option value="SERVICE">Pagos de servicios</option><option value="PROFORMA">Proformas convertidas</option><option value="MANUAL">Manual</option></SelectInput>
          <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Todos los estados</option><option value="PENDING_PAYMENT">Pendiente</option><option value="PARTIALLY_PAID">Abonada</option><option value="PAID">Pagada</option></SelectInput>
          <SelectInput value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="ALL">USD y HNL</option><option value="USD">USD $</option><option value="HNL">HNL L</option></SelectInput>
          <ActionButton variant="secondary" onClick={() => { setSearch(""); setDate(""); setSource("ALL"); setStatus("ALL"); setCurrency("ALL"); }}>Restablecer filtros</ActionButton>
        </section>

        {message ? <div className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div> : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4"><h2 className="font-black text-slate-950">Facturas de toda la plataforma</h2><p className="text-xs text-slate-500">{filtered.length} factura(s) encontradas</p></div>
          {!filtered.length ? <div className="p-4"><EmptyState text="No hay facturas con estos filtros." /></div> : <div className="overflow-x-auto"><table><thead><tr><th>Número fiscal</th><th>Origen</th><th>Cliente</th><th>Bodega</th><th>Conceptos</th><th>Total</th><th>Acreditado</th><th>Pagado</th><th>Estado</th><th>Emisión</th><th>Acciones</th></tr></thead><tbody>{filtered.map((invoice) => <tr key={invoice.id}><td><p className="font-mono text-xs font-bold">{invoice.document_number}</p><p className="mt-1 max-w-52 truncate font-mono text-[10px] text-slate-400">CAI: {invoice.cai ?? "-"}</p></td><td>{sourceName[invoice.source] ?? invoice.source}</td><td><strong>{invoice.customer_name}</strong><br /><span className="text-xs text-slate-500">RTN: {invoice.customer_rtn ?? "-"}</span></td><td className="font-black">{invoice.unit_number ? `Bodega ${invoice.unit_number}` : "Global"}</td><td className="max-w-72 text-xs">{invoice.items.map((item) => item.description).join(", ")}</td><td className="font-black">{money(Number(invoice.total), invoice.currency)}</td><td>{money(Number(invoice.credited_amount || 0), invoice.currency)}</td><td>{money(Number(invoice.amount_paid), invoice.currency)}</td><td><StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge></td><td>{new Date(invoice.created_at).toLocaleDateString("es-HN")}</td><td><div className="flex min-w-max gap-2"><a href={`/api/billing/${invoice.id}/pdf`} target="_blank" className="rounded-md border border-sky-200 px-3 py-2 text-xs font-black text-sky-700">PDF fiscal</a><ActionButton variant="secondary" onClick={() => void send(invoice.id)}>Enviar</ActionButton></div></td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </>
  );
}
