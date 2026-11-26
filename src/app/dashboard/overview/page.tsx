"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { EmptyState, MetricCard } from "@/components/ui";
import { alerts, overview as integrationOverview, shortDate, storeganiseEvents } from "@/lib/dashboard-data";

type CardSummary = {
  received: number;
  lastSync: string | null;
};

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
  const [cards, setCards] = useState<CardSummary | null>(null);
  const [cardsUnavailable, setCardsUnavailable] = useState(false);

  useEffect(() => {
    let disposed = false;
    let active: AbortController | null = null;
    async function refresh() {
      if (active || document.hidden || disposed) return;
      const controller = new AbortController();
      active = controller;
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch("/api/overview/card-payments", {
          cache: "no-store", credentials: "same-origin", signal: controller.signal,
        });
        if (!response.ok) throw new Error("No disponible");
        const summary: CardSummary = await response.json();
        if (!Number.isSafeInteger(summary.received) || summary.received < 0) throw new Error("Resumen inválido");
        if (!disposed) {
          setCards(summary);
          setCardsUnavailable(false);
        }
      } catch {
        if (!disposed) setCardsUnavailable(true);
      } finally {
        window.clearTimeout(timeout);
        active = null;
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      active?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

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
  const bacConnected = Boolean(cards?.lastSync) && !cardsUnavailable;
  const nextFiscalNumber = fiscal
    ? `${fiscal.establishment}-${fiscal.emission_point}-${fiscal.document_type}-${String(fiscal.current_number).padStart(8, "0")}`
    : "-";

  return (
    <>
      <PageHeader
        title="Overview"
        description="Vista general de facturación, Caja, CAI / Correlativos y pagos con tarjeta recibidos de Storeganise."
      />
      <div className="space-y-5 p-5">
        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div> : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total facturado hoy" value={hnlMoney(Number(metrics.billed_today_hnl))} hint={`${usdMoney(Number(metrics.billed_today_usd))} USD · referencia`} />
          <MetricCard label="Total facturado del mes" value={hnlMoney(Number(metrics.billed_month_hnl))} hint={`${usdMoney(Number(metrics.billed_month_usd))} USD · referencia`} />
          <Link href="/dashboard/pagos-bac" className="rounded-lg focus-visible:outline-2 focus-visible:outline-sky-600" aria-label="Ver pagos con tarjeta en Pagos BAC">
            <MetricCard label="Pagos BAC · pagos con tarjeta" value={cards ? String(cards.received) : "—"}
              hint={cardsUnavailable ? (cards ? "Último total recibido de Storeganise" : "Actualización pendiente")
                : cards?.lastSync ? "Conectado vía Storeganise · total recibido" : cards ? "Sin pagos sincronizados" : "Consultando Storeganise…"} />
          </Link>
          <MetricCard label="Facturas generadas" value={String(metrics.generated_invoices)} hint="Facturas fiscales vigentes" />
          <MetricCard label="Facturas enviadas" value={String(metrics.sent_invoices)} hint="Envíos reales registrados" />
          <MetricCard label="Correlativos disponibles" value={String(fiscal?.available ?? 0)} hint={fiscal?.cai ?? "Sin CAI activo"} />
          <MetricCard label="Alertas críticas" value={String(criticalAlerts.length)} hint="Avisos de atención pendientes" />
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

        <div className="grid gap-5 md:grid-cols-2">
          <section aria-labelledby="ultimos-pagos-bac" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <h2 id="ultimos-pagos-bac" className="font-black text-slate-950">Últimos pagos BAC</h2>
              <p className="mt-1 text-sm text-slate-600">Pagos con tarjeta recibidos de Storeganise</p>
            </div>
            <StatusBadge tone={bacConnected ? "green" : cardsUnavailable ? "amber" : "slate"}>
              {bacConnected ? "Conectado vía Storeganise" : cardsUnavailable ? "Actualización pendiente"
                : cards ? "Sin pagos sincronizados" : "Consultando…"}
            </StatusBadge>
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
          <div className="border-b border-slate-200 p-4"><h2 className="font-black text-slate-950">Alertas críticas</h2><p className="mt-1 text-xs text-slate-600">Avisos pendientes de revisión</p></div>
          {!criticalAlerts.length ? <div className="p-4"><EmptyState text="No hay alertas críticas pendientes." /></div> : <div className="divide-y divide-slate-200">{criticalAlerts.map((alert) => <div key={alert.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-slate-950">{alert.title}</p><p className="text-sm text-slate-500">{alert.message}</p></div><StatusBadge tone={statusTone(alert.level)}>{alert.level}</StatusBadge></div>)}</div>}
        </section>
      </div>
    </>
  );
}
