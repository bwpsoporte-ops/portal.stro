"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { ActionButton, EmptyState, SelectInput, TextInput } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

type Invoice = {
  id: string; document_number: string; source: string; customer_name: string;
  customer_email: string | null; unit_number: string | null; currency: "USD" | "HNL";
  total: string; amount_paid: string; status: string; cai: string | null; created_at: string;
  cancelled_at: string | null; cancellation_reason: string | null; cancelled_by: string | null;
};

const reasons = ["Error en los datos del cliente", "Error en los conceptos o montos", "Factura duplicada", "Operación no realizada", "Otro motivo documentado"];
const money = (value: number, currency: "USD" | "HNL") => new Intl.NumberFormat(currency === "HNL" ? "es-HN" : "en-US", { style: "currency", currency }).format(value || 0);

export default function CancelInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [reason, setReason] = useState(reasons[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/billing?type=INVOICE&includeCancelled=true", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    setInvoices(data.documents ?? []);
  }, []);
  useEffect(() => { void load().catch((failure) => setError(failure instanceof Error ? failure.message : "No se pudieron cargar las facturas.")); }, [load]);

  const visible = useMemo(() => invoices.filter((invoice) => {
    const text = [invoice.document_number,invoice.customer_name,invoice.customer_email,invoice.unit_number].filter(Boolean).join(" ").toLowerCase();
    return text.includes(search.toLowerCase()) && (status === "ALL" || (status === "CANCELLED" ? invoice.status === "CANCELLED" : invoice.status !== "CANCELLED"));
  }), [invoices, search, status]);

  const cancelInvoice = async () => {
    if (!selected) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const currentUser = getCurrentUser();
      const response = await fetch(`/api/billing/${selected.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "CANCEL", reason, notes, cancelledBy: currentUser?.email ?? "Usuario administrativo" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setMessage(`Factura ${selected.document_number} anulada y retirada de los módulos operativos. Las bodegas relacionadas quedaron liberadas.`);
      setSelected(null); setNotes(""); setStatus("CANCELLED"); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo anular la factura."); } finally { setSaving(false); }
  };

  const resetTestInvoices = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/billing", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmText: resetText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      const next = data.result?.nextRanges?.map((range: { next_number: number }) => range.next_number).join(", ") || "inicio";
      setMessage(`${data.result?.removedInvoices ?? 0} factura(s) y ${data.result?.removedProformas ?? 0} proforma(s) de prueba eliminadas. Todas las bodegas quedaron libres. Próximo correlativo: ${next}.`);
      setShowReset(false); setResetText(""); setStatus("ACTIVE"); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudieron reiniciar las pruebas."); } finally { setSaving(false); }
  };

  return <><PageHeader title="Anulación de facturas" description="Anula documentos fiscales conservando CAI, correlativo, PDF y trazabilidad conforme al régimen de facturación." /><div className="space-y-5 p-5">
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-black">Control fiscal importante</p><p className="mt-1">Una factura anulada no se elimina y su correlativo no vuelve al rango disponible. El documento permanece en orden cronológico con la marca ANULADA.</p></section>
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><TextInput className="max-w-md" placeholder="Número, cliente o bodega" value={search} onChange={(event) => setSearch(event.target.value)} /><SelectInput className="max-w-56" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ACTIVE">Facturas vigentes</option><option value="CANCELLED">Facturas anuladas</option><option value="ALL">Todas</option></SelectInput><button type="button" onClick={() => { setShowReset(true); setResetText(""); }} className="rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-black text-rose-700 hover:bg-rose-50">Reiniciar correlativos de prueba</button></section>
    {message ? <div className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</div> : null}{error ? <div className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div> : null}
    <section className="rounded-xl border border-slate-200 bg-white"><div className="border-b p-4"><h2 className="font-black">Documentos fiscales</h2><p className="text-xs text-slate-500">{visible.length} documento(s)</p></div>{!visible.length ? <div className="p-4"><EmptyState text="No hay facturas con estos filtros." /></div> : <div className="overflow-x-auto"><table><thead><tr><th>Número fiscal</th><th>Cliente</th><th>Bodega</th><th>Total</th><th>Pagado</th><th>Estado</th><th>Emisión</th><th>Acciones</th></tr></thead><tbody>{visible.map((invoice) => <tr key={invoice.id}><td><p className="font-mono text-xs font-black">{invoice.document_number}</p><p className="font-mono text-[10px] text-slate-400">CAI: {invoice.cai ?? "-"}</p></td><td>{invoice.customer_name}</td><td>{invoice.unit_number || "Global"}</td><td className="font-black">{money(Number(invoice.total),invoice.currency)}</td><td>{money(Number(invoice.amount_paid),invoice.currency)}</td><td><StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge>{invoice.cancellation_reason ? <p className="mt-1 text-xs text-rose-700">{invoice.cancellation_reason}</p> : null}</td><td>{new Date(invoice.created_at).toLocaleDateString("es-HN")}</td><td><div className="flex min-w-max gap-2"><a className="rounded-md border border-sky-200 px-3 py-2 text-xs font-black text-sky-700" href={`/api/billing/${invoice.id}/pdf`} target="_blank">PDF</a>{invoice.status !== "CANCELLED" ? <button type="button" onClick={() => { setSelected(invoice); setReason(reasons[0]); setNotes(""); }} className="rounded-md bg-rose-600 px-3 py-2 text-xs font-black text-white hover:bg-rose-700">Anular factura</button> : <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-black text-slate-500">Anulada</span>}</div></td></tr>)}</tbody></table></div>}</section>
  </div>
  {selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><section className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><p className="text-xs font-black uppercase text-rose-600">Anulación fiscal permanente</p><h2 className="mt-1 text-xl font-black">{selected.document_number}</h2><p className="mt-2 text-sm text-slate-600">La factura desaparecerá de los módulos operativos y quedará solamente en el historial de anuladas. El correlativo continuará registrado como utilizado y anulado.</p><div className="mt-5 space-y-3">{Number(selected.amount_paid) > 0 ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Esta factura tiene un pago registrado.</strong><br />La anulación conservará ese pago como antecedente de auditoría; no se borrará su registro histórico.</div> : null}<label className="block text-xs font-black">Motivo<SelectInput value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map((item) => <option key={item}>{item}</option>)}</SelectInput></label><label className="block text-xs font-black">Explicación y evidencia<textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-200 p-3 text-sm" required value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Describe qué ocurrió y quién autorizó la anulación." /></label>{selected.unit_number ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Liberación automática de bodegas</strong><br />Al confirmar, todas las bodegas relacionadas volverán a aparecer disponibles en color verde.</div> : null}</div><div className="mt-5 flex justify-end gap-2"><ActionButton variant="secondary" onClick={() => setSelected(null)}>Cerrar</ActionButton><ActionButton variant="danger" onClick={() => void cancelInvoice()}>{saving ? "Anulando…" : "Confirmar anulación"}</ActionButton></div></section></div> : null}
  {showReset ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><p className="text-xs font-black uppercase text-rose-600">Solo para datos de prueba</p><h2 className="mt-1 text-xl font-black">Reiniciar facturación de prueba</h2><p className="mt-2 text-sm text-slate-600">Esta acción eliminará todas las facturas y proformas de prueba, aunque estén pendientes, pagadas o anuladas. También eliminará sus pagos y detalles, liberará todas las bodegas y devolverá cada CAI a su correlativo inicial.</p><div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">El sistema comprobará que no quede ningún documento, ninguna bodega ocupada y que el próximo correlativo sea el primero del rango.</div><label className="mt-4 block text-xs font-black">Escribe REINICIAR PRUEBAS<TextInput className="mt-1" value={resetText} onChange={(event) => setResetText(event.target.value)} placeholder="REINICIAR PRUEBAS" /></label><div className="mt-5 flex justify-end gap-2"><ActionButton variant="secondary" onClick={() => setShowReset(false)}>Cerrar</ActionButton><ActionButton variant="danger" onClick={() => void resetTestInvoices()}>{saving ? "Reiniciando…" : "Confirmar reinicio"}</ActionButton></div></section></div> : null}
  </>;
}
