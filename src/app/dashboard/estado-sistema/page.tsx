"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton, MetricCard } from "@/components/ui";
import { getCurrentUser, isRootUser } from "@/lib/auth";
import {
  alerts,
  getAvailableCorrelatives,
  invoices,
  payments,
  shortDate,
  storeganiseEvents,
} from "@/lib/dashboard-data";

type HealthStatus = "OPERATIVO" | "DEGRADADO" | "CRITICO";
type QueueStatus = "PENDIENTE" | "EN_REVISION" | "BLOQUEADO" | "COMPLETADO";

type ServiceHealth = {
  id: string;
  name: string;
  status: HealthStatus;
  detail: string;
  lastCheck: string;
  href: string;
};

type QueueItem = {
  id: string;
  process: string;
  module: string;
  reference: string;
  priority: "Alta" | "Media" | "Baja";
  status: QueueStatus;
  createdAt: string;
  action: string;
  href: string;
};

const healthTone: Record<HealthStatus, "green" | "amber" | "red"> = {
  OPERATIVO: "green",
  DEGRADADO: "amber",
  CRITICO: "red",
};

const queueTone: Record<QueueStatus, "green" | "amber" | "red" | "slate"> = {
  PENDIENTE: "amber",
  EN_REVISION: "amber",
  BLOQUEADO: "red",
  COMPLETADO: "green",
};

function newestDate(values: string[]) {
  return values.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? new Date().toISOString();
}

function getServiceHealth(): ServiceHealth[] {
  const bacPending = payments.filter((payment) => payment.status === "PENDING").length;
  const bacFailed = payments.filter((payment) => ["FAILED", "REJECTED"].includes(payment.status)).length;
  const storeganiseFailed = storeganiseEvents.filter((event) => event.status === "ERROR").length;
  const storeganiseRetry = storeganiseEvents.filter((event) => event.status === "REINTENTO").length;
  const failedEmails = invoices.filter((invoice) => invoice.emailStatus === "FALLIDA").length;
  const pendingEmails = invoices.filter((invoice) => invoice.emailStatus === "PENDIENTE").length;
  const pdfIssues = alerts.filter((alert) => alert.area === "PDF" && !alert.resolved).length;
  const availableCorrelatives = getAvailableCorrelatives();

  return [
    {
      id: "bac",
      name: "BAC",
      status: bacFailed > 0 ? "CRITICO" : bacPending > 0 ? "DEGRADADO" : "OPERATIVO",
      detail: bacFailed > 0 ? `${bacFailed} pago(s) fallidos o rechazados.` : `${bacPending} pago(s) pendientes de confirmacion.`,
      lastCheck: newestDate(payments.map((payment) => payment.paidAt)),
      href: "/dashboard/pagos-bac",
    },
    {
      id: "storeganise",
      name: "Storeganise",
      status: storeganiseFailed > 0 ? "CRITICO" : storeganiseRetry > 0 ? "DEGRADADO" : "OPERATIVO",
      detail: storeganiseFailed > 0 ? `${storeganiseFailed} evento(s) con error.` : `${storeganiseRetry} evento(s) en reintento.`,
      lastCheck: newestDate(storeganiseEvents.map((event) => event.receivedAt)),
      href: "/dashboard/storeganise",
    },
    {
      id: "correo",
      name: "Correo",
      status: failedEmails > 0 ? "CRITICO" : pendingEmails > 0 ? "DEGRADADO" : "OPERATIVO",
      detail: failedEmails > 0 ? `${failedEmails} factura(s) no enviadas.` : `${pendingEmails} correo(s) pendientes.`,
      lastCheck: newestDate(invoices.map((invoice) => invoice.issuedAt)),
      href: "/dashboard/facturas",
    },
    {
      id: "pdf",
      name: "PDF",
      status: pdfIssues > 0 ? "DEGRADADO" : "OPERATIVO",
      detail: pdfIssues > 0 ? `${pdfIssues} alerta(s) de PDF pendientes.` : "Plantilla y generacion listas.",
      lastCheck: newestDate(alerts.filter((alert) => alert.area === "PDF").map((alert) => alert.createdAt)),
      href: "/dashboard/plantilla-factura",
    },
    {
      id: "correlativos",
      name: "Correlativos",
      status: availableCorrelatives <= 25 ? "CRITICO" : availableCorrelatives <= 100 ? "DEGRADADO" : "OPERATIVO",
      detail: `${availableCorrelatives} correlativo(s) disponibles.`,
      lastCheck: new Date().toISOString(),
      href: "/dashboard/cai-correlativos",
    },
  ];
}

function getQueue(): QueueItem[] {
  const paymentQueue: QueueItem[] = payments
    .filter((payment) => ["PENDING", "FAILED", "REJECTED"].includes(payment.status))
    .map((payment) => ({
      id: `Q-BAC-${payment.id}`,
      process: payment.status === "PENDING" ? "Confirmar pago BAC" : "Revisar pago BAC",
      module: "Pagos BAC",
      reference: payment.bacReference,
      priority: payment.status === "PENDING" ? "Media" : "Alta",
      status: payment.status === "PENDING" ? "EN_REVISION" : "BLOQUEADO",
      createdAt: payment.paidAt,
      action: payment.status === "PENDING" ? "Reconsultar BAC" : "Reintentar validacion",
      href: "/dashboard/pagos-bac",
    }));

  const emailQueue: QueueItem[] = invoices
    .filter((invoice) => invoice.emailStatus !== "ENVIADA")
    .map((invoice) => ({
      id: `Q-EMAIL-${invoice.id}`,
      process: "Enviar factura por correo",
      module: "Correos",
      reference: invoice.number,
      priority: invoice.emailStatus === "FALLIDA" ? "Alta" : "Media",
      status: invoice.emailStatus === "FALLIDA" ? "BLOQUEADO" : "PENDIENTE",
      createdAt: invoice.issuedAt,
      action: "Reenviar correo",
      href: "/dashboard/facturas",
    }));

  const storeganiseQueue: QueueItem[] = storeganiseEvents
    .filter((event) => event.status === "ERROR" || event.status === "REINTENTO")
    .map((event) => ({
      id: `Q-SG-${event.id}`,
      process: "Sincronizar evento Storeganise",
      module: "Storeganise",
      reference: event.payloadRef,
      priority: event.status === "ERROR" ? "Alta" : "Media",
      status: event.status === "ERROR" ? "BLOQUEADO" : "EN_REVISION",
      createdAt: event.receivedAt,
      action: "Reintentar sync",
      href: "/dashboard/storeganise",
    }));

  return [...paymentQueue, ...emailQueue, ...storeganiseQueue].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export default function EstadoSistemaPage() {
  const router = useRouter();
  const [canViewSystemStatus, setCanViewSystemStatus] = useState(false);
  const services = useMemo(() => getServiceHealth(), []);
  const queue = useMemo(() => getQueue(), []);
  const [statusById, setStatusById] = useState<Record<string, QueueStatus>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!isRootUser(getCurrentUser())) {
        router.replace("/dashboard/overview");
        return;
      }

      setCanViewSystemStatus(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [router]);

  const latestWebhook = useMemo(
    () => [...storeganiseEvents].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0],
    [],
  );
  const latestInvoice = useMemo(
    () => [...invoices].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0],
    [],
  );

  const visibleQueue = queue.map((item) => ({ ...item, status: statusById[item.id] ?? item.status }));
  const criticalServices = services.filter((service) => service.status === "CRITICO").length;
  const degradedServices = services.filter((service) => service.status === "DEGRADADO").length;
  const pendingQueue = visibleQueue.filter((item) => item.status !== "COMPLETADO").length;

  const systemStatus: HealthStatus = criticalServices > 0 ? "CRITICO" : degradedServices > 0 ? "DEGRADADO" : "OPERATIVO";

  const runQueueAction = (item: QueueItem) => {
    setStatusById((current) => ({ ...current, [item.id]: "EN_REVISION" }));
    setMessage(`${item.action} iniciado para ${item.reference}. El proceso queda en revision.`);
  };

  const completeQueueItem = (item: QueueItem) => {
    setStatusById((current) => ({ ...current, [item.id]: "COMPLETADO" }));
    setMessage(`Proceso ${item.reference} marcado como completado.`);
  };

  if (!canViewSystemStatus) return null;

  return (
    <>
      <PageHeader
        title="Estado del Sistema"
        description="Panel de salud operativa para BAC, Storeganise, correo, PDF, webhooks, facturas y procesos pendientes."
        actions={
          <StatusBadge tone={healthTone[systemStatus]}>
            {systemStatus}
          </StatusBadge>
        }
      />

      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Servicios críticos" value={String(criticalServices)} hint="Requieren atención inmediata" />
          <MetricCard label="Servicios degradados" value={String(degradedServices)} hint="Operan con pendientes" />
          <MetricCard label="Procesos en cola" value={String(pendingQueue)} hint="Pendientes o bloqueados" />
          <MetricCard label="Correlativos disponibles" value={String(getAvailableCorrelatives())} hint="Capacidad fiscal actual" />
        </div>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Salud por servicio</h2>
            <p className="mt-1 text-sm text-slate-500">Estado calculado desde pagos, eventos, facturas, PDF y correlativos.</p>
          </div>
          <div className="grid gap-0 divide-y divide-slate-200 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
            {services.map((service) => (
              <div key={service.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black text-slate-950">{service.name}</h3>
                  <StatusBadge tone={healthTone[service.status]}>{service.status}</StatusBadge>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{service.detail}</p>
                <p className="mt-3 text-xs font-bold text-slate-500">Ultima revision: {shortDate(service.lastCheck)}</p>
                <Link className="mt-4 inline-flex rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-black text-sky-700 transition hover:bg-sky-50" href={service.href}>
                  Abrir modulo
                </Link>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-500">Ultimo webhook recibido</p>
            <h2 className="mt-2 text-lg font-black text-slate-950">{latestWebhook?.event ?? "Sin webhook"}</h2>
            <p className="mt-1 text-sm text-slate-600">{latestWebhook?.message ?? "No hay eventos registrados."}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge tone={latestWebhook?.status === "ERROR" ? "red" : latestWebhook?.status === "REINTENTO" ? "amber" : "green"}>
                {latestWebhook?.status ?? "SIN DATOS"}
              </StatusBadge>
              <span className="text-sm font-bold text-slate-500">{latestWebhook ? shortDate(latestWebhook.receivedAt) : "-"}</span>
              <span className="font-mono text-xs text-slate-500">{latestWebhook?.payloadRef}</span>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-500">Ultima factura generada</p>
            <h2 className="mt-2 font-mono text-lg font-black text-slate-950">{latestInvoice?.number ?? "Sin factura"}</h2>
            <p className="mt-1 text-sm text-slate-600">{latestInvoice?.client ?? "No hay facturas registradas."}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge tone={latestInvoice?.emailStatus === "ENVIADA" ? "green" : latestInvoice?.emailStatus === "PENDIENTE" ? "amber" : "red"}>
                {latestInvoice?.emailStatus ?? "SIN DATOS"}
              </StatusBadge>
              <span className="text-sm font-bold text-slate-500">{latestInvoice ? shortDate(latestInvoice.issuedAt) : "-"}</span>
              <span className="font-mono text-xs text-slate-500">{latestInvoice?.bacReference}</span>
            </div>
          </section>
        </div>

        {message ? <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{message}</div> : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Cola de procesos pendientes</h2>
            <p className="mt-1 text-sm text-slate-500">Pagos por confirmar, correos por reenviar y eventos por sincronizar.</p>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Proceso</th>
                  <th>Modulo</th>
                  <th>Referencia</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleQueue.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center font-bold text-slate-500">No hay procesos pendientes.</td>
                  </tr>
                ) : (
                  visibleQueue.map((item) => (
                    <tr key={item.id}>
                      <td className="font-bold text-slate-950">{item.process}</td>
                      <td>{item.module}</td>
                      <td className="font-mono text-xs">{item.reference}</td>
                      <td>{item.priority}</td>
                      <td><StatusBadge tone={queueTone[item.status]}>{item.status}</StatusBadge></td>
                      <td>{shortDate(item.createdAt)}</td>
                      <td>
                        <div className="flex min-w-80 flex-wrap gap-2">
                          <ActionButton variant="secondary" onClick={() => runQueueAction(item)}>{item.action}</ActionButton>
                          <ActionButton onClick={() => completeQueueItem(item)}>Completar</ActionButton>
                          <Link className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-black text-sky-700 transition hover:bg-sky-50" href={item.href}>
                            Ver origen
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
