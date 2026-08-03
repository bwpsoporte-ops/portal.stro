"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, MetricCard, SelectInput, TextInput } from "@/components/ui";

type StorageAlert = {
  id: string; unit_code: string; customer_name: string; customer_email: string | null;
  customer_phone: string | null; next_due_date: string; days_remaining: number;
  alert_status: "OVERDUE" | "DUE_SOON" | "UPCOMING"; customer_units: string[];
  last_invoice_id: string | null;
  document_number: string | null; currency: "USD" | "HNL" | null; total: string | null;
  amount_paid: string | null; invoice_status: string | null;
};

const money = (value: number, currency: "USD" | "HNL" | null) => new Intl.NumberFormat(currency === "HNL" ? "es-HN" : "en-US", { style: "currency", currency: currency ?? "USD" }).format(value || 0);

export default function StorageAlertsPage() {
  const [alerts, setAlerts] = useState<StorageAlert[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void fetch("/api/storage-alerts", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.message); setAlerts(data.alerts ?? []); }).catch((failure) => setError(failure instanceof Error ? failure.message : "No se pudieron cargar las alertas.")); }, []);

  const visible = useMemo(() => alerts.filter((alert) => {
    const matchesSearch = [alert.unit_code, alert.customer_name, alert.customer_email, ...alert.customer_units].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "ALL" || (filter === "ACTION" ? ["OVERDUE", "DUE_SOON"].includes(alert.alert_status) : alert.alert_status === filter);
    return matchesSearch && matchesFilter;
  }), [alerts, filter, search]);

  return <><PageHeader title="Alertas de bodegas" description="Control de alquileres por ciclos de 30 días. Las alertas aparecen tres días antes del próximo pago y permanecen visibles si están vencidas." /><div className="space-y-5 p-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Bodegas ocupadas" value={String(alerts.length)} /><MetricCard label="Vencidas" value={String(alerts.filter((entry) => entry.alert_status === "OVERDUE").length)} /><MetricCard label="Vencen en 3 días" value={String(alerts.filter((entry) => entry.alert_status === "DUE_SOON").length)} /><MetricCard label="Próximas" value={String(alerts.filter((entry) => entry.alert_status === "UPCOMING").length)} /></div>
    <section className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4"><TextInput className="max-w-sm" placeholder="Cliente, correo o bodega" value={search} onChange={(event) => setSearch(event.target.value)} /><SelectInput className="max-w-56" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ACTION">Requieren atención</option><option value="OVERDUE">Vencidas</option><option value="DUE_SOON">Próximos 3 días</option><option value="UPCOMING">Próximas</option><option value="ALL">Todas</option></SelectInput></section>
    {error ? <div className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div> : null}
    {!visible.length ? <EmptyState text="No hay alertas de bodegas con estos filtros." /> : <div className="grid gap-4 lg:grid-cols-2">{visible.map((alert) => <article key={alert.id} className={`rounded-xl border p-5 ${alert.alert_status === "OVERDUE" ? "border-rose-300 bg-rose-50" : alert.alert_status === "DUE_SOON" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-slate-500">Bodega {alert.unit_code}</p><h2 className="text-lg font-black text-slate-950">{alert.customer_name}</h2><p className="text-sm text-slate-600">{alert.customer_email || "Sin correo"} · {alert.customer_phone || "Sin teléfono"}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black">{alert.alert_status === "OVERDUE" ? `${Math.abs(alert.days_remaining)} día(s) vencida` : `${alert.days_remaining} día(s)`}</span></div><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><p><strong>Próximo pago:</strong><br />{alert.next_due_date}</p><p><strong>Sus bodegas:</strong><br />{alert.customer_units.join(", ")}</p>{alert.document_number ? <p><strong>Última factura:</strong><br />{alert.document_number}</p> : null}{alert.total ? <p><strong>Total facturado:</strong><br />{money(Number(alert.total), alert.currency)}</p> : null}</div><div className="mt-4 flex flex-wrap gap-2"><Link className="rounded-md bg-sky-500 px-3 py-2 text-xs font-black text-white" href="/dashboard/caja">Cobrar alquiler</Link><Link className="rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-700" href="/dashboard/pagos-servicios">Revisar servicios</Link>{alert.last_invoice_id ? <Link className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black" href={`/api/billing/${alert.last_invoice_id}/pdf`} target="_blank">PDF</Link> : null}</div></article>)}</div>}
  </div></>;
}
