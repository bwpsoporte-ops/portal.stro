"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  ActionButton,
  EmptyState,
  MetricCard,
  SelectInput,
  TextInput,
} from "@/components/ui";

type Invoice = {
  id: string;
  document_number: string;
  customer_name: string;
  currency: "USD" | "HNL";
  total: string;
  amount_paid: string;
  credited_amount: string;
  total_hnl: number;
  amount_paid_hnl: number;
  credited_amount_hnl: number;
  status: string;
  sent_at: string | null;
  created_at: string;
};
type Range = {
  id: string;
  cai: string;
  range_start: number;
  range_end: number;
  current_number: number;
  expiration_date: string;
  status: string;
  document_type: string;
  available: number;
};
type OperationalAlert = {
  id: string;
  level: "INFO" | "WARNING" | "CRITICAL";
  module: "CAI / Correlativos" | "Facturas" | "Correos" | "BAC" | "Storeganise";
  title: string;
  message: string;
  reference: string;
  createdAt: string;
  href: string;
};
type StoreganiseLog = {
  id: string;
  event: string;
  status: string;
  error?: string;
  receivedAt: string;
};
type IntegrationState = {
  status: string;
  configured: boolean;
  apiConfigured: boolean;
  webhookConfigured: boolean;
  webhookConnected: boolean;
};
const days = (date: string) =>
  Math.ceil(
    (new Date(`${date}T23:59:59-06:00`).getTime() - Date.now()) / 86_400_000,
  );
const ageDays = (date: string) =>
  Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
const money = (value: number, currency: string) =>
  new Intl.NumberFormat(currency === "HNL" ? "es-HN" : "en-US", {
    style: "currency",
    currency,
  }).format(value || 0);
const tone = (level: string) =>
  level === "CRITICAL"
    ? "red"
    : level === "WARNING"
      ? "amber"
      : level === "INFO"
        ? "blue"
        : "slate";

export default function AlertasPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [storeganiseLogs, setStoreganiseLogs] = useState<StoreganiseLog[]>([]);
  const [integration, setIntegration] = useState<IntegrationState | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [level, setLevel] = useState("ALL");
  const [module, setModule] = useState("ALL");
  const [query, setQuery] = useState("");
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [operationsResponse, storeganiseResponse, healthResponse] =
      await Promise.all([
        fetch("/api/operations", { cache: "no-store" }),
        fetch("/api/integrations/storeganise", { cache: "no-store" }),
        fetch("/api/integrations/health", { cache: "no-store" }),
      ]);
    const operations = await operationsResponse.json();
    const storeganise = await storeganiseResponse.json();
    const health = await healthResponse.json();
    if (!operationsResponse.ok) throw new Error(operations.message);
    if (!storeganiseResponse.ok) throw new Error(storeganise.message);
    setInvoices(operations.invoices ?? []);
    setRanges(operations.ranges ?? []);
    setStoreganiseLogs(storeganise.logs ?? []);
    setIntegration(storeganise.connection ?? null);
    setSmtpConfigured(Boolean(health.smtp?.configured));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load().catch((f) =>
          setError(
            f instanceof Error
              ? f.message
              : "No se pudieron cargar las alertas.",
          ),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const alerts = useMemo(() => {
    const result: OperationalAlert[] = [];
    const now = new Date().toISOString();
    const activeInvoice = ranges.find(
      (r) =>
        r.status === "ACTIVE" &&
        r.document_type === "01" &&
        days(r.expiration_date) >= 0 &&
        r.available > 0,
    );
    if (!activeInvoice)
      result.push({
        id: "CAI-NO-ACTIVO",
        level: "CRITICAL",
        module: "CAI / Correlativos",
        title: "No existe CAI de factura disponible",
        message:
          "Caja no podrá emitir nuevas facturas hasta activar un CAI tipo 01 vigente y con correlativos.",
        reference: "FACTURA-01",
        createdAt: now,
        href: "/dashboard/cai-correlativos",
      });
    for (const range of ranges) {
      const remaining = days(range.expiration_date);
      const document =
        range.document_type === "03" ? "Nota de crédito" : "Factura";
      if (remaining < 0 && range.status === "ACTIVE")
        result.push({
          id: `CAI-VENCIDO-${range.id}`,
          level: "CRITICAL",
          module: "CAI / Correlativos",
          title: `CAI de ${document} vencido`,
          message: `El CAI venció hace ${Math.abs(remaining)} día(s) y debe darse de baja.`,
          reference: range.cai,
          createdAt: now,
          href: "/dashboard/cai-correlativos",
        });
      else if (range.status === "ACTIVE" && remaining <= 30)
        result.push({
          id: `CAI-VENCE-${range.id}`,
          level: remaining <= 7 ? "CRITICAL" : "WARNING",
          module: "CAI / Correlativos",
          title: `CAI de ${document} próximo a vencer`,
          message: `Fecha límite ${range.expiration_date}; quedan ${remaining} día(s).`,
          reference: range.cai,
          createdAt: now,
          href: "/dashboard/cai-correlativos",
        });
      if (range.status === "ACTIVE" && range.available <= 100)
        result.push({
          id: `CAI-BAJO-${range.id}`,
          level: range.available <= 25 ? "CRITICAL" : "WARNING",
          module: "CAI / Correlativos",
          title: `Correlativos bajos para ${document}`,
          message: `Solamente quedan ${range.available} correlativos disponibles.`,
          reference: range.cai,
          createdAt: now,
          href: "/dashboard/cai-correlativos",
        });
    }
    for (const invoice of invoices) {
      if (invoice.status === "CANCELLED") continue;
      const balance = Math.max(
        0,
        Number(invoice.total_hnl) -
          Number(invoice.amount_paid_hnl) -
          Number(invoice.credited_amount_hnl || 0),
      );
      const age = ageDays(invoice.created_at);
      if (balance > 0 && age >= 7)
        result.push({
          id: `SALDO-${invoice.id}`,
          level: age >= 30 ? "CRITICAL" : "WARNING",
          module: "Facturas",
          title:
            age >= 30
              ? "Factura con saldo vencido"
              : "Factura pendiente de cobro",
          message: `${invoice.customer_name} mantiene un saldo de ${money(balance, "HNL")} desde hace ${age} día(s).`,
          reference: invoice.document_number,
          createdAt: invoice.created_at,
          href: "/dashboard/facturas",
        });
      if (invoice.status === "PAID" && !invoice.sent_at)
        result.push({
          id: `CORREO-${invoice.id}`,
          level: "WARNING",
          module: "Correos",
          title: "Factura pagada pendiente de envío",
          message: `La factura de ${invoice.customer_name} está pagada, pero todavía no registra envío por correo.`,
          reference: invoice.document_number,
          createdAt: invoice.created_at,
          href: "/dashboard/facturas",
        });
    }
    if (integration && !integration.configured)
      result.push({
        id: "STOREGANISE-CONFIG",
        level: "CRITICAL",
        module: "Storeganise",
        title: "Configuración de Storeganise incompleta",
        message:
          "Revisa la URL, API Key y secreto del webhook en la configuración del despliegue.",
        reference: "STOREGANISE",
        createdAt: now,
        href: "/dashboard/storeganise",
      });
    for (const event of storeganiseLogs.filter(
      (entry) => entry.status === "FAILED",
    )) {
      result.push({
        id: `STOREGANISE-${event.id}`,
        level: "CRITICAL",
        module: "Storeganise",
        title: "Webhook de Storeganise fallido",
        message: event.error || `El evento ${event.event} no pudo procesarse.`,
        reference: event.event,
        createdAt: event.receivedAt,
        href: "/dashboard/storeganise",
      });
    }
    if (!smtpConfigured)
      result.push({
        id: "SMTP-NO-CONFIGURADO",
        level: "WARNING",
        module: "Correos",
        title: "Correo SMTP no configurado",
        message:
          "El envío automático de facturas necesita una configuración SMTP completa.",
        reference: "SMTP",
        createdAt: now,
        href: "/dashboard/configuracion",
      });
    return result.sort(
      (a, b) =>
        (a.level === "CRITICAL" ? 0 : 1) - (b.level === "CRITICAL" ? 0 : 1),
    );
  }, [integration, invoices, ranges, smtpConfigured, storeganiseLogs]);
  const visible = useMemo(
    () =>
      alerts.filter(
        (a) =>
          (level === "ALL" || a.level === level) &&
          (module === "ALL" || a.module === module) &&
          `${a.title} ${a.message} ${a.reference}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [alerts, level, module, query],
  );
  const pending = alerts.filter((a) => !resolved.has(a.id));
  const metrics = {
    critical: pending.filter((a) => a.level === "CRITICAL").length,
    warning: pending.filter((a) => a.level === "WARNING").length,
    cai: pending.filter((a) => a.module === "CAI / Correlativos").length,
    invoices: pending.filter((a) => a.module === "Facturas").length,
  };
  return (
    <>
      <PageHeader
        title="Alertas"
        description="Centro operativo sincronizado con CAI, correlativos, facturas y saldos reales."
      />
      <div className="space-y-5 p-5">
        {error ? (
          <div className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">
            {error}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Alertas críticas"
            value={String(metrics.critical)}
            hint="Requieren atención inmediata"
          />
          <MetricCard
            label="Advertencias"
            value={String(metrics.warning)}
            hint="Atención preventiva"
          />
          <MetricCard
            label="Alertas CAI"
            value={String(metrics.cai)}
            hint="Vigencia y correlativos"
          />
          <MetricCard
            label="Facturas pendientes"
            value={String(metrics.invoices)}
            hint="Saldos con 7 días o más"
          />
        </div>
        <section className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-4">
          <SelectInput value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="ALL">Todos los niveles</option>
            <option value="CRITICAL">Críticas</option>
            <option value="WARNING">Advertencias</option>
          </SelectInput>
          <SelectInput
            value={module}
            onChange={(e) => setModule(e.target.value)}
          >
            <option value="ALL">Todos los módulos</option>
            <option value="CAI / Correlativos">CAI / Correlativos</option>
            <option value="Facturas">Facturas</option>
            <option value="Correos">Correos</option>
            <option value="Storeganise">Storeganise</option>
            <option value="BAC">BAC</option>
          </SelectInput>
          <TextInput
            placeholder="Buscar alerta o referencia"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ActionButton
            variant="secondary"
            onClick={() => {
              setLevel("ALL");
              setModule("ALL");
              setQuery("");
            }}
          >
            Restablecer
          </ActionButton>
        </section>
        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="font-black text-amber-900">
              BAC pendiente de integración
            </p>
            <p className="mt-1 text-sm text-amber-800">
              No se generan alertas bancarias hasta conectar webhooks y
              conciliación BAC.
            </p>
          </div>
          <div
            className={`rounded-lg border p-4 ${integration?.status === "CONECTADA" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
          >
            <p
              className={`font-black ${integration?.status === "CONECTADA" ? "text-emerald-900" : "text-amber-900"}`}
            >
              Storeganise{" "}
              {integration?.status === "CONECTADA"
                ? "conectado"
                : "en verificación"}
            </p>
            <p
              className={`mt-1 text-sm ${integration?.status === "CONECTADA" ? "text-emerald-800" : "text-amber-800"}`}
            >
              {integration?.status === "CONECTADA"
                ? "Clientes, bodegas, facturas y webhooks están conectados al monitor de alertas."
                : "El backend está comprobando la configuración y los eventos recibidos."}
            </p>
          </div>
        </section>
        <section className="rounded-lg border bg-white">
          <div className="border-b p-4">
            <h2 className="font-black">Alertas operativas reales</h2>
            <p className="text-xs text-slate-500">
              {visible.length} alerta(s) con los filtros actuales
            </p>
          </div>
          {!visible.length ? (
            <div className="p-4">
              <EmptyState text="No existen alertas operativas con estos filtros." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Nivel</th>
                    <th>Tipo</th>
                    <th>Mensaje</th>
                    <th>Módulo</th>
                    <th>Referencia</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((alert) => (
                    <tr
                      key={alert.id}
                      className={resolved.has(alert.id) ? "opacity-50" : ""}
                    >
                      <td>
                        <StatusBadge tone={tone(alert.level)}>
                          {alert.level}
                        </StatusBadge>
                      </td>
                      <td className="font-black">{alert.title}</td>
                      <td className="min-w-80">{alert.message}</td>
                      <td>{alert.module}</td>
                      <td className="font-mono text-xs">{alert.reference}</td>
                      <td>
                        <StatusBadge
                          tone={resolved.has(alert.id) ? "green" : "amber"}
                        >
                          {resolved.has(alert.id) ? "REVISADA" : "PENDIENTE"}
                        </StatusBadge>
                      </td>
                      <td>
                        <div className="flex min-w-max gap-2">
                          <Link
                            href={alert.href}
                            className="rounded-md border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-800"
                          >
                            Revisar módulo
                          </Link>
                          <ActionButton
                            onClick={() =>
                              setResolved((current) => {
                                const next = new Set(current);
                                next.add(alert.id);
                                return next;
                              })
                            }
                          >
                            Marcar revisada
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
