"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { EmptyState, MetricCard } from "@/components/ui";
import { alerts, money, overview as integrationOverview, payments, shortDate, storeganiseEvents } from "@/lib/dashboard-data";

type OverviewMetrics = {
  billed_today_hnl: string;
  billed_today_usd: string;
  billed_month_hnl: string;
  billed_month_usd: string;
  generated_invoices: number;
  sent_invoices: number;
};

type FiscalRange = {
  cai: string;
  range_start: number;
  range_end: number;
  current_number: number;
  expiration_date: string;
  establishment: string;
  emission_point: string;
  document_type: string;
  available: number;
};

type Invoice = {
  id: string;
  document_number: string;
  customer_name: string;
  total: string;
  currency: "USD" | "HNL";
  status: string;
  sent_at: string | null;
  created_at: string;
  source: string;
  total_hnl: string;
  total_usd: string;
};

const emptyMetrics: OverviewMetrics = {
  billed_today_hnl: "0",
  billed_today_usd: "0",
  billed_month_hnl: "0",
  billed_month_usd: "0",
  generated_invoices: 0,
  sent_invoices: 0,
};

const invoiceMoney = (value: number, currency: "USD" | "HNL") =>
  new Intl.NumberFormat(currency === "HNL" ? "es-HN" : "en-US", {
    style: "currency",
    currency,
  }).format(value || 0);
const hnlMoney = (value: number) => invoiceMoney(value, "HNL");
const usdMoney = (value: number) => invoiceMoney(value, "USD");

const sourceName: Record<string, string> = {
  CASH: "Caja",
  SERVICE: "Pagos de servicios",
  PROFORMA: "Proforma convertida",
  MANUAL: "Manual",
};

export default function OverviewPage() {
  const [metrics, setMetrics] = useState<OverviewMetrics>(emptyMetrics);
  const [fiscal, setFiscal] = useState<FiscalRange | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/overview", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "No se pudo sincronizar Overview.");
    setMetrics(data.metrics ?? emptyMetrics);
    setFiscal(data.fiscal ?? null);
    setInvoices(data.invoices ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
        .catch((failure) => setError(failure instanceof Error ? failure.message : "No se pudo sincronizar Overview."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const criticalAlerts = alerts.filter((alert) =>
    (alert.level === "CRITICAL" || alert.level === "WARNING") && !alert.resolved,
  );
  const fiscalReady = Boolean(fiscal);
  const nextFiscalNumber = fiscal
    ? `${fiscal.establishment}-${fiscal.emission_point}-${fiscal.document_type}-${String(fiscal.current_number).padStart(8, "0")}`
    : "-";

  return (
    <>
      <PageHeader
        title="Overview"
        description="Vista general sincronizada con facturación, Caja y CAI / Correlativos. BAC y Storeganise permanecen preparados para su integración."
      />
      <div className="space-y-5 p-5">
        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div> : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total facturado hoy" value={hnlMoney(Number(metrics.billed_today_hnl))} hint={`${usdMoney(Number(metrics.billed_today_usd))} USD · referencia`} />
          <MetricCard label="Total facturado del mes" value={hnlMoney(Number(metrics.billed_month_hnl))} hint={`${usdMoney(Number(metrics.billed_month_usd))} USD · referencia`} />
          <MetricCard label="Pagos BAC aprobados" value={String(integrationOverview.approvedPayments)} hint="Pendiente de conexión BAC" />
          <MetricCard label="Pagos BAC pendientes" value={String(integrationOverview.pendingPayments)} hint="Pendiente de conexión BAC" />
          <MetricCard label="Facturas generadas" value={String(metrics.generated_invoices)} hint="Facturas fiscales vigentes" />
          <MetricCard label="Facturas enviadas" value={String(metrics.sent_invoices)} hint="Envíos reales registrados" />
          <MetricCard label="Correlativos disponibles" value={String(fiscal?.available ?? 0)} hint={fiscal?.cai ?? "Sin CAI activo"} />
          <MetricCard label="Alertas críticas" value={String(criticalAlerts.length)} hint="Storeganise pendiente de conexión" />
        </div>

        <section className={`rounded-lg border p-4 ${fiscalReady ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">CAI activo</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">{fiscal?.cai ?? (loading ? "Consultando…" : "No configurado")}</h2>
              {fiscal ? (
                <div className="mt-2 grid gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
                  <p><strong>Próximo correlativo:</strong> <span className="font-mono">{nextFiscalNumber}</span></p>
                  <p><strong>Disponibles:</strong> {fiscal.available}</p>
                  <p><strong>Fecha límite:</strong> {fiscal.expiration_date}</p>
                  <p><strong>Rango:</strong> {fiscal.range_start} al {fiscal.range_end}</p>
                </div>
              ) : <p className="mt-1 text-sm text-slate-600">No existe un CAI de factura tipo 01 activo, vigente y con correlativos disponibles.</p>}
            </div>
            <StatusBadge tone={fiscalReady ? "green" : "red"}>{fiscalReady ? "LISTO PARA FACTURAR" : "BLOQUEADO"}</StatusBadge>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-3">
          <section className="rounded-lg border border-slate-200 bg-white xl:col-span-2">
            <div className="border-b border-slate-200 p-4"><h2 className="font-black text-slate-950">Últimos pagos BAC</h2><p className="mt-1 text-xs text-amber-700">Integración BAC todavía no conectada</p></div>
            <div className="overflow-x-auto"><table><thead><tr><th>Cliente</th><th>Monto</th><th>Estado</th><th>Referencia</th><th>Fecha</th></tr></thead><tbody>{payments.slice(0, 5).map((payment) => <tr key={payment.id}><td>{payment.client}</td><td className="font-bold">{money(payment.amount)}</td><td><StatusBadge tone={statusTone(payment.status)}>{payment.status}</StatusBadge></td><td>{payment.bacReference}</td><td>{shortDate(payment.paidAt)}</td></tr>)}</tbody></table></div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4"><h2 className="font-black text-slate-950">Estado de Storeganise</h2><p className="mt-1 text-sm text-slate-500">{integrationOverview.storeganiseStatus}</p><p className="mt-1 text-xs font-bold text-emerald-700">Integración conectada</p></div>
            <div className="divide-y divide-slate-200">{storeganiseEvents.slice(0, 4).map((event) => <div key={event.id} className="p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-900">{event.event}</p><StatusBadge tone={statusTone(event.status)}>{event.status}</StatusBadge></div><p className="mt-1 text-xs text-slate-500">{shortDate(event.receivedAt)}</p></div>)}</div>
          </section>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4"><h2 className="font-black text-slate-950">Últimas facturas emitidas</h2><p className="mt-1 text-xs text-slate-500">Sincronizadas con Caja, Pagos de servicios y proformas convertidas</p></div>
          {!invoices.length ? <div className="p-4"><EmptyState text={loading ? "Consultando facturas…" : "Todavía no existen facturas emitidas."} /></div> : (
            <div className="overflow-x-auto"><table><thead><tr><th>Número</th><th>Origen</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Correo</th><th>Emisión</th><th>PDF</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td className="font-mono text-xs font-black">{invoice.document_number}</td><td>{sourceName[invoice.source] ?? invoice.source}</td><td>{invoice.customer_name}</td><td className="font-bold">{hnlMoney(Number(invoice.total_hnl))}<span className="block text-[10px] font-medium text-slate-500">{usdMoney(Number(invoice.total_usd))} USD</span></td><td><StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge></td><td><StatusBadge tone={invoice.sent_at ? "green" : "amber"}>{invoice.sent_at ? "ENVIADA" : "PENDIENTE"}</StatusBadge></td><td>{new Date(invoice.created_at).toLocaleDateString("es-HN")}</td><td><a href={`/api/billing/${invoice.id}/pdf`} target="_blank" className="rounded-md border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-800">Ver PDF</a></td></tr>)}</tbody></table></div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4"><h2 className="font-black text-slate-950">Alertas críticas</h2><p className="mt-1 text-xs text-amber-700">Se conservarán hasta conectar Storeganise</p></div>
          {!criticalAlerts.length ? <div className="p-4"><EmptyState text="No hay alertas críticas pendientes." /></div> : <div className="divide-y divide-slate-200">{criticalAlerts.map((alert) => <div key={alert.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-slate-950">{alert.title}</p><p className="text-sm text-slate-500">{alert.message}</p></div><StatusBadge tone={statusTone(alert.level)}>{alert.level}</StatusBadge></div>)}</div>}
        </section>
      </div>
    </>
  );
}
