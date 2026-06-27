"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { ActionButton, MetricCard, SelectInput, TextInput } from "@/components/ui";
import {
  AlertLevel,
  activeCai,
  alerts,
  caiRanges,
  getAvailableCorrelatives,
  invoices,
  payments,
  shortDate,
  storeganiseEvents,
} from "@/lib/dashboard-data";

type AlertStatus = "PENDIENTE" | "EN_REVISION" | "RESUELTA" | "IGNORADA";
type AlertModule = "CAI / Correlativos" | "Pagos BAC" | "Facturas" | "Correos" | "Storeganise" | "PDF";

type OperationalAlert = {
  id: string;
  level: AlertLevel;
  type: string;
  message: string;
  module: AlertModule;
  reference: string;
  createdAt: string;
  status: AlertStatus;
  href: string;
  actionLabel: string;
  retryLabel: string;
  canRetry: boolean;
};

const modules: Array<AlertModule | "TODOS"> = [
  "TODOS",
  "CAI / Correlativos",
  "Pagos BAC",
  "Facturas",
  "Correos",
  "Storeganise",
  "PDF",
];

const statuses: Array<AlertStatus | "TODOS"> = ["TODOS", "PENDIENTE", "EN_REVISION", "RESUELTA", "IGNORADA"];
const levels: Array<AlertLevel | "TODOS"> = ["TODOS", "INFO", "WARNING", "CRITICAL"];

function daysUntil(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00-06:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function hoursSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
}

function defaultStatus(id: string, resolved = false): AlertStatus {
  if (resolved) return "RESUELTA";
  if (id.endsWith("004")) return "EN_REVISION";
  return "PENDIENTE";
}

function buildAlerts(): OperationalAlert[] {
  const caiAlerts = caiRanges.flatMap((range) => {
    const available = getAvailableCorrelatives(range);
    const remainingDays = daysUntil(range.limitDate);
    const generated: OperationalAlert[] = [];

    if (remainingDays < 0 || range.status === "VENCIDO") {
      generated.push({
        id: `ALT-CAI-VENCIDO-${range.id}`,
        level: "CRITICAL",
        type: "CAI vencido",
        message: `El CAI ${range.cai} ya venció y debe bloquear emisión de facturas.`,
        module: "CAI / Correlativos",
        reference: range.id.toUpperCase(),
        createdAt: `${range.limitDate}T08:00:00-06:00`,
        status: "PENDIENTE",
        href: "/dashboard/cai-correlativos",
        actionLabel: "Ver CAI",
        retryLabel: "Renovar CAI",
        canRetry: false,
      });
    } else if ([30, 15].some((limit) => remainingDays <= limit) || remainingDays <= 7) {
      generated.push({
        id: `ALT-CAI-${range.id}`,
        level: remainingDays <= 7 ? "CRITICAL" : "WARNING",
        type: "CAI próximo a vencer",
        message: `El CAI activo vence en ${remainingDays} días, el ${range.limitDate}.`,
        module: "CAI / Correlativos",
        reference: range.id.toUpperCase(),
        createdAt: "2026-05-05T08:00:00-06:00",
        status: "PENDIENTE",
        href: "/dashboard/cai-correlativos",
        actionLabel: "Ver CAI",
        retryLabel: "Solicitar CAI",
        canRetry: false,
      });
    }

    if (available <= 0 || range.status === "AGOTADO") {
      generated.push({
        id: `ALT-CORR-0-${range.id}`,
        level: "CRITICAL",
        type: "Correlativos agotados",
        message: "No hay correlativos disponibles. La emisión de facturas debe quedar bloqueada.",
        module: "CAI / Correlativos",
        reference: range.id.toUpperCase(),
        createdAt: "2026-05-05T08:05:00-06:00",
        status: "PENDIENTE",
        href: "/dashboard/cai-correlativos",
        actionLabel: "Ver CAI",
        retryLabel: "Solicitar rango",
        canRetry: false,
      });
    } else if (available <= 25) {
      generated.push({
        id: `ALT-CORR-25-${range.id}`,
        level: "CRITICAL",
        type: "Correlativos bajos",
        message: `Quedan ${available} correlativos disponibles en el rango activo.`,
        module: "CAI / Correlativos",
        reference: range.id.toUpperCase(),
        createdAt: "2026-05-05T08:10:00-06:00",
        status: "PENDIENTE",
        href: "/dashboard/cai-correlativos",
        actionLabel: "Ver CAI",
        retryLabel: "Solicitar rango",
        canRetry: false,
      });
    } else if (available <= 50) {
      generated.push({
        id: `ALT-CORR-50-${range.id}`,
        level: "WARNING",
        type: "Correlativos bajos",
        message: `Quedan ${available} correlativos disponibles.`,
        module: "CAI / Correlativos",
        reference: range.id.toUpperCase(),
        createdAt: "2026-05-05T08:15:00-06:00",
        status: "PENDIENTE",
        href: "/dashboard/cai-correlativos",
        actionLabel: "Ver CAI",
        retryLabel: "Revisar rango",
        canRetry: false,
      });
    } else if (available <= 100) {
      generated.push({
        id: `ALT-CORR-100-${range.id}`,
        level: "INFO",
        type: "Correlativos bajos",
        message: `Quedan ${available} correlativos disponibles.`,
        module: "CAI / Correlativos",
        reference: range.id.toUpperCase(),
        createdAt: "2026-05-05T08:20:00-06:00",
        status: "PENDIENTE",
        href: "/dashboard/cai-correlativos",
        actionLabel: "Ver CAI",
        retryLabel: "Revisar rango",
        canRetry: false,
      });
    }

    return generated;
  });

  const bacAlerts: OperationalAlert[] = payments
    .filter((payment) => ["PENDING", "REJECTED", "FAILED"].includes(payment.status))
    .map((payment, index) => {
      const pendingHours = hoursSince(payment.paidAt);
      const overdue = payment.status === "PENDING" && pendingHours >= 24;

      return {
        id: `ALT-BAC-${String(index + 1).padStart(3, "0")}`,
        level: overdue || payment.status !== "PENDING" ? "CRITICAL" : "WARNING",
        type: overdue
          ? "Pago pendiente demasiado tiempo"
          : payment.status === "PENDING"
            ? "Pago BAC pendiente"
            : payment.status === "REJECTED"
              ? "Pago BAC rechazado"
              : "Error en webhook BAC",
        message: overdue
          ? `El pago ${payment.bacReference} lleva ${pendingHours} horas pendiente y requiere reintento o revisión manual.`
          : payment.error ?? payment.bankResponse,
        module: "Pagos BAC",
        reference: payment.bacReference,
        createdAt: payment.paidAt,
        status: payment.status === "PENDING" ? "EN_REVISION" : "PENDIENTE",
        href: "/dashboard/pagos-bac",
        actionLabel: "Ver pago",
        retryLabel: payment.status === "PENDING" ? "Reconsultar BAC" : "Reintentar BAC",
        canRetry: true,
      };
    });

  const invoiceAlerts: OperationalAlert[] = invoices
    .filter((invoice) => invoice.emailStatus !== "ENVIADA")
    .map((invoice, index) => ({
      id: `ALT-EMAIL-${String(index + 1).padStart(3, "0")}`,
      level: invoice.emailStatus === "FALLIDA" ? "WARNING" : "INFO",
      type: invoice.emailStatus === "FALLIDA" ? "Factura no enviada por correo" : "Factura sin correo enviado",
      message: `La factura ${invoice.number} tiene estado de correo ${invoice.emailStatus}.`,
      module: "Correos",
      reference: invoice.number,
      createdAt: invoice.issuedAt,
      status: invoice.emailStatus === "FALLIDA" ? "PENDIENTE" : "EN_REVISION",
      href: "/dashboard/facturas",
      actionLabel: "Ver factura",
      retryLabel: "Reenviar correo",
      canRetry: true,
    }));

  const storeganiseAlerts: OperationalAlert[] = storeganiseEvents
    .filter((event) => event.status === "ERROR" || event.status === "REINTENTO")
    .map((event, index) => ({
      id: `ALT-SG-${String(index + 1).padStart(3, "0")}`,
      level: event.status === "ERROR" ? "CRITICAL" : "WARNING",
      type: event.event.includes("webhook") ? "Error en webhook Storeganise" : "Error sincronizando con Storeganise",
      message: event.message,
      module: "Storeganise",
      reference: event.payloadRef,
      createdAt: event.receivedAt,
      status: "PENDIENTE",
      href: "/dashboard/storeganise",
      actionLabel: "Ver Storeganise",
      retryLabel: "Reintentar sync",
      canRetry: true,
    }));

  const systemAlerts: OperationalAlert[] = alerts.map((alert, index) => ({
    id: `ALT-${String(index + 1).padStart(3, "0")}`,
    level: alert.level,
    type: alert.title,
    message: alert.message,
    module:
      alert.area === "CAI"
        ? "CAI / Correlativos"
        : alert.area === "BAC"
          ? "Pagos BAC"
          : alert.area === "EMAIL"
            ? "Correos"
            : alert.area === "STOREGANISE"
              ? "Storeganise"
              : "PDF",
    reference: alert.area === "CAI" ? activeCai?.id.toUpperCase() ?? "SIN-CAI" : alert.area,
    createdAt: alert.createdAt,
    status: defaultStatus(alert.id, alert.resolved),
    href:
      alert.area === "CAI"
        ? "/dashboard/cai-correlativos"
        : alert.area === "BAC"
          ? "/dashboard/pagos-bac"
          : alert.area === "EMAIL"
            ? "/dashboard/facturas"
            : alert.area === "STOREGANISE"
              ? "/dashboard/storeganise"
              : "/dashboard/plantilla-factura",
    actionLabel:
      alert.area === "CAI"
        ? "Ver CAI"
        : alert.area === "BAC"
          ? "Ver pago"
          : alert.area === "EMAIL"
            ? "Ver factura"
            : alert.area === "STOREGANISE"
              ? "Ver Storeganise"
              : "Ver PDF",
    retryLabel:
      alert.area === "BAC"
        ? "Reintentar BAC"
        : alert.area === "EMAIL"
          ? "Reenviar correo"
          : alert.area === "STOREGANISE"
            ? "Reintentar sync"
            : alert.area === "PDF"
              ? "Regenerar PDF"
              : "Revisar",
    canRetry: ["BAC", "EMAIL", "STOREGANISE", "PDF"].includes(alert.area),
  }));

  return [...caiAlerts, ...bacAlerts, ...invoiceAlerts, ...storeganiseAlerts, ...systemAlerts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function alertStatusTone(status: AlertStatus) {
  if (status === "RESUELTA") return "green";
  if (status === "EN_REVISION") return "amber";
  if (status === "IGNORADA") return "slate";
  return "red";
}

export default function AlertasPage() {
  const sourceAlerts = useMemo(() => buildAlerts(), []);
  const [level, setLevel] = useState<AlertLevel | "TODOS">("TODOS");
  const [status, setStatus] = useState<AlertStatus | "TODOS">("TODOS");
  const [module, setModule] = useState<AlertModule | "TODOS">("TODOS");
  const [date, setDate] = useState("");
  const [query, setQuery] = useState("");
  const [statusById, setStatusById] = useState<Record<string, AlertStatus>>({});
  const [detail, setDetail] = useState<OperationalAlert | null>(null);
  const [message, setMessage] = useState("");

  const enrichedAlerts = useMemo(
    () => sourceAlerts.map((alert) => ({ ...alert, status: statusById[alert.id] ?? alert.status })),
    [sourceAlerts, statusById],
  );

  const filtered = useMemo(() => {
    return enrichedAlerts.filter((alert) => {
      const text = `${alert.message} ${alert.reference} ${alert.type}`.toLowerCase();
      const matchLevel = level === "TODOS" || alert.level === level;
      const matchStatus = status === "TODOS" || alert.status === status;
      const matchModule = module === "TODOS" || alert.module === module;
      const matchDate = !date || alert.createdAt.startsWith(date);
      const matchQuery = text.includes(query.toLowerCase());
      return matchLevel && matchStatus && matchModule && matchDate && matchQuery;
    });
  }, [date, enrichedAlerts, level, module, query, status]);

  const metrics = useMemo(
    () => ({
      critical: enrichedAlerts.filter((alert) => alert.level === "CRITICAL").length,
      pending: enrichedAlerts.filter((alert) => alert.status === "PENDIENTE").length,
      resolved: enrichedAlerts.filter((alert) => alert.status === "RESUELTA").length,
      caiExpiring: enrichedAlerts.filter((alert) => alert.type.includes("CAI próximo")).length,
      lowCorrelatives: enrichedAlerts.filter((alert) => alert.type.includes("Correlativos")).length,
      bacErrors: enrichedAlerts.filter((alert) => alert.module === "Pagos BAC" && alert.level === "CRITICAL").length,
      storeganiseErrors: enrichedAlerts.filter((alert) => alert.module === "Storeganise" && alert.level === "CRITICAL").length,
      failedEmails: enrichedAlerts.filter((alert) => alert.module === "Correos" && alert.type.includes("no enviada")).length,
    }),
    [enrichedAlerts],
  );

  const setAlertStatus = (id: string, nextStatus: AlertStatus) => {
    setStatusById((current) => ({ ...current, [id]: nextStatus }));
    setMessage(`Alerta ${id} marcada como ${nextStatus}.`);
  };

  const retryAlert = (alert: OperationalAlert) => {
    setStatusById((current) => ({ ...current, [alert.id]: "EN_REVISION" }));
    setMessage(`${alert.retryLabel} iniciado para ${alert.reference}. La alerta queda en revisión.`);
  };

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Monitoreo de eventos críticos relacionados con CAI, correlativos, pagos BAC, correos, facturas y Storeganise."
      />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Alertas críticas" value={String(metrics.critical)} hint="Riesgos que pueden bloquear operación" />
          <MetricCard label="Alertas pendientes" value={String(metrics.pending)} hint="Sin cierre operativo" />
          <MetricCard label="Alertas resueltas" value={String(metrics.resolved)} hint="Eventos ya atendidos" />
          <MetricCard label="CAI por vencer" value={String(metrics.caiExpiring)} hint="Control de vencimiento SAR" />
          <MetricCard label="Correlativos bajos" value={String(metrics.lowCorrelatives)} hint="Rangos cercanos al límite" />
          <MetricCard label="Errores BAC" value={String(metrics.bacErrors)} hint="Pagos o webhook bancario" />
          <MetricCard label="Errores Storeganise" value={String(metrics.storeganiseErrors)} hint="Sincronización y webhooks" />
          <MetricCard label="Correos fallidos" value={String(metrics.failedEmails)} hint="Facturas no entregadas" />
        </div>

        <section className="no-print grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
          <SelectInput value={level} onChange={(event) => setLevel(event.target.value as AlertLevel | "TODOS")}>
            {levels.map((item) => <option key={item} value={item}>{item === "TODOS" ? "Todos los niveles" : item}</option>)}
          </SelectInput>
          <SelectInput value={status} onChange={(event) => setStatus(event.target.value as AlertStatus | "TODOS")}>
            {statuses.map((item) => <option key={item} value={item}>{item === "TODOS" ? "Todos los estados" : item}</option>)}
          </SelectInput>
          <SelectInput value={module} onChange={(event) => setModule(event.target.value as AlertModule | "TODOS")}>
            {modules.map((item) => <option key={item} value={item}>{item === "TODOS" ? "Todos los módulos" : item}</option>)}
          </SelectInput>
          <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <TextInput placeholder="Buscar mensaje o referencia" value={query} onChange={(event) => setQuery(event.target.value)} />
          <ActionButton variant="secondary" onClick={() => { setLevel("TODOS"); setStatus("TODOS"); setModule("TODOS"); setDate(""); setQuery(""); }}>
            Limpiar filtros
          </ActionButton>
        </section>

        {detail ? (
          <section className="rounded-lg border border-sky-200 bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={statusTone(detail.level)}>{detail.level}</StatusBadge>
                  <StatusBadge tone={alertStatusTone(statusById[detail.id] ?? detail.status)}>{statusById[detail.id] ?? detail.status}</StatusBadge>
                </div>
                <h2 className="mt-3 text-lg font-black text-slate-950">{detail.type}</h2>
                <p className="mt-1 text-sm text-slate-600">{detail.message}</p>
                <p className="mt-2 text-xs font-bold text-slate-500">Referencia: {detail.reference} | Módulo: {detail.module}</p>
              </div>
              <ActionButton variant="secondary" onClick={() => setDetail(null)}>Cerrar detalle</ActionButton>
            </div>
          </section>
        ) : null}

        {message ? (
          <div className="no-print rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{message}</div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Tabla de alertas</h2>
            <p className="mt-1 text-sm text-slate-500">Centro de control operativo, fiscal y técnico.</p>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nivel</th>
                  <th>Tipo</th>
                  <th>Mensaje</th>
                  <th>Módulo relacionado</th>
                  <th>Referencia</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((alert) => {
                  const currentStatus = statusById[alert.id] ?? alert.status;
                  return (
                    <tr key={alert.id}>
                      <td className="font-mono text-xs">{alert.id}</td>
                      <td><StatusBadge tone={statusTone(alert.level)}>{alert.level}</StatusBadge></td>
                      <td className="font-bold text-slate-900">{alert.type}</td>
                      <td className="min-w-72">{alert.message}</td>
                      <td>{alert.module}</td>
                      <td className="font-mono text-xs">{alert.reference}</td>
                      <td>{shortDate(alert.createdAt)}</td>
                      <td><StatusBadge tone={alertStatusTone(currentStatus)}>{currentStatus}</StatusBadge></td>
                      <td>
                        <div className="flex min-w-96 flex-wrap gap-2">
                          <ActionButton variant="secondary" onClick={() => setDetail(alert)}>Ver detalle</ActionButton>
                          {alert.canRetry ? (
                            <ActionButton variant="secondary" onClick={() => retryAlert(alert)}>{alert.retryLabel}</ActionButton>
                          ) : null}
                          <ActionButton variant="secondary" onClick={() => setAlertStatus(alert.id, "EN_REVISION")}>Marcar revisada</ActionButton>
                          <ActionButton onClick={() => setAlertStatus(alert.id, "RESUELTA")}>Resolver</ActionButton>
                          <Link className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-black text-sky-700 transition hover:bg-sky-50" href={alert.href}>
                            {alert.actionLabel}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
