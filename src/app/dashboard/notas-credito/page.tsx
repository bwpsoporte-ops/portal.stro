"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState, MetricCard, SelectInput, TextInput } from "@/components/ui";

type Invoice = {
  id: string; document_number: string; customer_name: string; customer_rtn: string | null;
  currency: "USD" | "HNL"; subtotal: string; tax: string; total: string; amount_paid: string;
  credited_amount: string; available_to_credit: string; status: string; created_at: string;
};
type CreditNote = {
  id: string; credit_note_number: string; invoice_number: string; customer_name: string;
  currency: "USD" | "HNL"; reason: string; resolution: string; subtotal: string; tax: string;
  total: string; status: "ISSUED" | "CANCELLED"; created_at: string; cancellation_reason?: string;
};
type FiscalRange = { cai: string; current_number: number; range_end: number; expiration_date: string } | null;

const formatMoney = (value: number, currency: string) => `${currency === "HNL" ? "L" : "$"} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safeNumber = (value: string) => {
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function CreditNotesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [fiscal, setFiscal] = useState<FiscalRange>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState("BILLING_ERROR");
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState("ADJUST_BALANCE");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/credit-notes", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "No se pudo cargar el módulo.");
    setInvoices(data.invoices ?? []); setNotes(data.notes ?? []); setFiscal(data.fiscal ?? null);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = invoices.find((invoice) => invoice.id === invoiceId);
  const enteredTotal = safeNumber(amount);
  const taxShare = selected && Number(selected.total) > 0 ? Number(selected.tax) / Number(selected.total) : 0;
  const previewTax = Math.round(enteredTotal * taxShare * 100) / 100;
  const previewSubtotal = Math.round((enteredTotal - previewTax) * 100) / 100;
  const issued = notes.filter((note) => note.status === "ISSUED");
  const filtered = useMemo(() => notes.filter((note) => {
    const matchesStatus = statusFilter === "ALL" || note.status === statusFilter;
    const text = `${note.credit_note_number} ${note.invoice_number} ${note.customer_name} ${note.reason}`.toLowerCase();
    return matchesStatus && text.includes(search.toLowerCase());
  }), [notes,search,statusFilter]);

  const chooseInvoice = (id: string) => {
    setInvoiceId(id);
    const invoice = invoices.find((item) => item.id === id);
    setAmount(invoice ? Number(invoice.available_to_credit).toFixed(2) : "");
  };
  const issue = async () => {
    setMessage(""); setBusy(true);
    try {
      const response = await fetch("/api/credit-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceId, amount: enteredTotal, reasonCode, reason, resolution }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo emitir.");
      setMessage(`Nota de crédito ${data.note.creditNoteNumber} emitida correctamente.`);
      setInvoiceId(""); setAmount(""); setReason(""); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo emitir."); }
    finally { setBusy(false); }
  };
  const cancel = async (note: CreditNote) => {
    const cancellationReason = window.prompt(`Motivo de anulación de ${note.credit_note_number}:`);
    if (!cancellationReason) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/credit-notes/${note.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "CANCEL", reason: cancellationReason }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "No se pudo anular.");
      setMessage(`Nota ${note.credit_note_number} anulada; el crédito fue retirado de la factura.`); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo anular."); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader title="Notas de crédito" description="Emisión fiscal, control de saldos y trazabilidad de créditos vinculados a facturas de toda la plataforma." />
    <div className="space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Notas vigentes" value={String(issued.length)} hint="Documentos fiscales emitidos" />
        <MetricCard label="Total acreditado" value={formatMoney(issued.reduce((sum,note) => sum + Number(note.total),0), "USD")} hint="Vista consolidada nominal" />
        <MetricCard label="Facturas acreditables" value={String(invoices.length)} hint="Con monto disponible" />
        <MetricCard label="CAI nota de crédito" value={fiscal ? "Activo" : "No configurado"} hint={fiscal ? `${Number(fiscal.range_end)-Number(fiscal.current_number)+1} correlativos disponibles` : "Requiere serie fiscal tipo 03"} />
      </div>

      <section className={`rounded-lg border p-4 ${fiscal ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase text-slate-600">Control fiscal</p><p className="mt-1 font-black text-slate-950">{fiscal ? `CAI tipo 03 vigente hasta ${fiscal.expiration_date}` : "Falta configurar el CAI para Nota de crédito"}</p><p className="mt-1 text-sm text-slate-600">La nota mantiene la referencia a la factura original y consume una serie fiscal independiente.</p></div><StatusBadge tone={fiscal ? "green" : "amber"}>{fiscal ? "LISTO PARA EMITIR" : "CONFIGURACIÓN REQUERIDA"}</StatusBadge></div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4"><h2 className="font-black text-slate-950">Emitir nueva nota de crédito</h2><p className="mt-1 text-sm text-slate-500">El monto nunca puede superar lo aún disponible en la factura original.</p></div>
        <div className="grid gap-5 p-4 xl:grid-cols-[1.4fr_.8fr]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-black text-slate-700 md:col-span-2">Factura original<SelectInput value={invoiceId} onChange={(event) => chooseInvoice(event.target.value)}><option value="">Selecciona una factura</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.document_number} · {invoice.customer_name} · disponible {formatMoney(Number(invoice.available_to_credit),invoice.currency)}</option>)}</SelectInput></label>
            <label className="text-xs font-black text-slate-700">Tipo de motivo<SelectInput value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}><option value="BILLING_ERROR">Error de facturación</option><option value="RETURN">Devolución</option><option value="POST_SALE_DISCOUNT">Descuento posterior</option><option value="PARTIAL_CANCELLATION">Cancelación parcial</option><option value="TOTAL_CANCELLATION">Cancelación total</option><option value="OTHER">Otro</option></SelectInput></label>
            <label className="text-xs font-black text-slate-700">Aplicación del crédito<SelectInput value={resolution} onChange={(event) => setResolution(event.target.value)}><option value="ADJUST_BALANCE">Ajustar saldo de factura</option><option value="CUSTOMER_CREDIT">Saldo a favor del cliente</option><option value="BANK_REFUND">Reembolso bancario</option></SelectInput></label>
            <label className="text-xs font-black text-slate-700">Monto total del crédito<TextInput inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.currentTarget.value)} /></label>
            <label className="text-xs font-black text-slate-700 md:col-span-2">Descripción y justificación<textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-emerald-600" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe claramente por qué se emite esta nota de crédito." /></label>
          </div>
          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-500">Vista previa</p>
            {selected ? <div className="mt-3 space-y-3 text-sm"><div><p className="font-black">{selected.document_number}</p><p className="text-slate-500">{selected.customer_name}</p></div><div className="border-t pt-3"><div className="flex justify-between"><span>Total original</span><b>{formatMoney(Number(selected.total),selected.currency)}</b></div><div className="flex justify-between"><span>Ya acreditado</span><b>{formatMoney(Number(selected.credited_amount),selected.currency)}</b></div><div className="flex justify-between text-emerald-800"><span>Disponible</span><b>{formatMoney(Number(selected.available_to_credit),selected.currency)}</b></div></div><div className="border-t pt-3"><div className="flex justify-between"><span>Base acreditada</span><b>{formatMoney(previewSubtotal,selected.currency)}</b></div><div className="flex justify-between"><span>ISV acreditado</span><b>{formatMoney(previewTax,selected.currency)}</b></div><div className="mt-2 flex justify-between text-lg text-emerald-900"><span className="font-black">Total crédito</span><b>{formatMoney(enteredTotal,selected.currency)}</b></div></div></div> : <EmptyState text="Selecciona una factura para ver su saldo y cálculo fiscal." />}
            <button type="button" disabled={busy || !fiscal || !selected || enteredTotal<=0 || enteredTotal>Number(selected.available_to_credit) || reason.trim().length<5} onClick={() => void issue()} className="mt-4 w-full rounded-md bg-[#004B13] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Procesando…" : "Emitir nota de crédito"}</button>
          </aside>
        </div>
        {message ? <div className="m-4 mt-0 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{message}</div> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-black">Historial de notas de crédito</h2><p className="text-xs text-slate-500">{filtered.length} documento(s)</p></div><div className="flex gap-2"><TextInput className="max-w-72" placeholder="Número, factura o cliente" value={search} onChange={(event) => setSearch(event.target.value)} /><SelectInput className="max-w-44" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Todos los estados</option><option value="ISSUED">Vigentes</option><option value="CANCELLED">Anuladas</option></SelectInput></div></div>
        {!filtered.length ? <div className="p-4"><EmptyState text="Todavía no existen notas de crédito con estos filtros." /></div> : <div className="overflow-auto"><table><thead><tr><th>Nota de crédito</th><th>Factura original</th><th>Cliente</th><th>Motivo</th><th>Total</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map((note) => <tr key={note.id}><td className="font-mono text-xs font-black">{note.credit_note_number}</td><td className="font-mono text-xs">{note.invoice_number}</td><td>{note.customer_name}</td><td className="max-w-64 text-xs">{note.reason}</td><td className="font-black">{formatMoney(Number(note.total),note.currency)}</td><td>{new Date(note.created_at).toLocaleDateString("es-HN")}</td><td><StatusBadge tone={note.status === "ISSUED" ? "green" : "red"}>{note.status === "ISSUED" ? "VIGENTE" : "ANULADA"}</StatusBadge></td><td><div className="flex min-w-max gap-2"><a target="_blank" href={`/api/credit-notes/${note.id}/pdf`} className="rounded-md border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-800">Ver PDF</a>{note.status === "ISSUED" ? <button disabled={busy} onClick={() => void cancel(note)} className="rounded-md border border-rose-300 px-3 py-2 text-xs font-black text-rose-700">Anular</button> : null}</div></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </>;
}
