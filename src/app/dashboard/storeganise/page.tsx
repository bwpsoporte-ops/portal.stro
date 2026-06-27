"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton, EmptyState, MetricCard, SelectInput, TextInput } from "@/components/ui";
import { invoices, money, payments, shortDate, storeganiseEvents } from "@/lib/dashboard-data";

type StoreganiseStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "RETRYING" | "IGNORED";

type StoreganiseLog = {
  id: string;
  event: string;
  customer: string;
  email: string;
  storeganiseInvoiceId: string;
  storeganiseUserId: string;
  amount: number;
  status: StoreganiseStatus;
  receivedAt: string;
  processedAt?: string;
  error?: string;
  retries: number;
  invoiceNumber?: string;
  bacReference?: string;
  payload: Record<string, string | number | boolean | null>;
  reviewed: boolean;
};

const eventTypes = [
  "unitRental.invoice.created",
  "invoice.updated",
  "invoice.state.updated",
  "invoice.payments.updated",
  "user.created",
  "user.updated",
  "user.billing.updated",
  "addon.dailyEvent.started",
];

const statuses: Array<StoreganiseStatus | "TODOS"> = ["TODOS", "RECEIVED", "PROCESSING", "PROCESSED", "FAILED", "RETRYING", "IGNORED"];

function mapStatus(status: string): StoreganiseStatus {
  if (status === "PROCESADO") return "PROCESSED";
  if (status === "ERROR") return "FAILED";
  if (status === "REINTENTO") return "RETRYING";
  return "RECEIVED";
}

function buildLogs(): StoreganiseLog[] {
  return storeganiseEvents.map((event, index) => {
    const invoice = invoices[index % invoices.length];
    const payment = payments.find((item) => item.invoiceNumber === invoice?.number);
    const status = mapStatus(event.status);

    return {
      id: event.id.toUpperCase(),
      event: event.event,
      customer: invoice?.client ?? "Cliente Storeganise",
      email: invoice?.email ?? "cliente@storeganise.local",
      storeganiseInvoiceId: event.payloadRef.startsWith("SG-INV") ? event.payloadRef : `SG-INV-${8800 + index}`,
      storeganiseUserId: event.payloadRef.startsWith("SG-USER") ? event.payloadRef : `SG-USER-${1900 + index}`,
      amount: invoice?.total ?? 0,
      status,
      receivedAt: event.receivedAt,
      processedAt: status === "PROCESSED" ? event.receivedAt : undefined,
      error: status === "FAILED" ? event.message : undefined,
      retries: event.retries,
      invoiceNumber: invoice?.number,
      bacReference: payment?.bacReference,
      reviewed: status === "PROCESSED",
      payload: {
        event_id: event.id,
        event_type: event.event,
        storeganise_invoice_id: event.payloadRef,
        customer_name: invoice?.client ?? null,
        customer_email: invoice?.email ?? null,
        amount: invoice?.total ?? 0,
        status,
        duplicate_guard: Boolean(payment?.transactionId),
      },
    };
  });
}

function statusToneForStoreganise(status: StoreganiseStatus) {
  if (status === "PROCESSED") return "green";
  if (status === "FAILED") return "red";
  if (status === "RETRYING" || status === "PROCESSING") return "amber";
  if (status === "RECEIVED") return "blue";
  return "slate";
}

export default function StoreganisePage() {
  const sourceLogs = useMemo(() => buildLogs(), []);
  const [query, setQuery] = useState("");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [eventType, setEventType] = useState("TODOS");
  const [status, setStatus] = useState<StoreganiseStatus | "TODOS">("TODOS");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<StoreganiseLog | null>(null);
  const [overrides, setOverrides] = useState<Record<string, StoreganiseStatus>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");

  const logs = useMemo(
    () => sourceLogs.map((log) => ({ ...log, status: overrides[log.id] ?? log.status, reviewed: reviewed[log.id] ?? log.reviewed })),
    [overrides, reviewed, sourceLogs],
  );

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const matchQuery = `${log.customer} ${log.email}`.toLowerCase().includes(query.toLowerCase());
      const matchInvoice = `${log.storeganiseInvoiceId} ${log.invoiceNumber ?? ""}`.toLowerCase().includes(invoiceQuery.toLowerCase());
      const matchEvent = eventType === "TODOS" || log.event === eventType;
      const matchStatus = status === "TODOS" || log.status === status;
      const matchDate = !date || log.receivedAt.startsWith(date);
      return matchQuery && matchInvoice && matchEvent && matchStatus && matchDate;
    });
  }, [date, eventType, invoiceQuery, logs, query, status]);

  const metrics = useMemo(() => {
    const today = logs.filter((log) => log.receivedAt.startsWith("2026-05-02")).length;
    const lastSync = [...logs].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
    return {
      today,
      processed: logs.filter((log) => log.status === "PROCESSED").length,
      failed: logs.filter((log) => log.status === "FAILED").length,
      invoices: logs.filter((log) => log.storeganiseInvoiceId.startsWith("SG-INV")).length,
      customers: new Set(logs.map((log) => log.storeganiseUserId)).size,
      lastSync: lastSync ? shortDate(lastSync.receivedAt) : "Sin sincronización",
      retries: logs.filter((log) => log.status === "RETRYING" || log.retries > 0).length,
      api: logs.some((log) => log.status === "FAILED") ? "CON ERRORES" : "OPERATIVA",
    };
  }, [logs]);

  const retryEvent = (id: string) => {
    setOverrides((current) => ({ ...current, [id]: "RETRYING" }));
    setMessage(`Evento ${id} marcado para reintento. Estado interno: RETRYING.`);
  };

  return (
    <>
      <PageHeader
        title="Storeganise"
        description="Monitoreo de webhooks, eventos, facturas recibidas, clientes sincronizados, errores y reintentos entre Storeganise, BAC, facturación y dashboard."
      />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Eventos recibidos hoy" value={String(metrics.today)} hint="POST /webhooks/storeganise" />
          <MetricCard label="Eventos procesados" value={String(metrics.processed)} hint="Estado final PROCESSED" />
          <MetricCard label="Eventos fallidos" value={String(metrics.failed)} hint="Requieren revisión técnica" />
          <MetricCard label="Facturas Storeganise" value={String(metrics.invoices)} hint="unitRental.invoice.created" />
          <MetricCard label="Clientes sincronizados" value={String(metrics.customers)} hint="user.created / user.updated" />
          <MetricCard label="Última sincronización" value={metrics.lastSync} hint="Último evento recibido" />
          <MetricCard label="Reintentos pendientes" value={String(metrics.retries)} hint="Eventos en cola de retry" />
          <MetricCard label="Estado API Storeganise" value={metrics.api} hint="Conexión del integrador" />
        </div>

        <section className="no-print grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
          <TextInput placeholder="Buscar por cliente o correo" value={query} onChange={(event) => setQuery(event.target.value)} />
          <TextInput placeholder="Factura Storeganise" value={invoiceQuery} onChange={(event) => setInvoiceQuery(event.target.value)} />
          <SelectInput value={eventType} onChange={(event) => setEventType(event.target.value)}>
            <option value="TODOS">Todos los eventos</option>
            {eventTypes.map((event) => <option key={event} value={event}>{event}</option>)}
          </SelectInput>
          <SelectInput value={status} onChange={(event) => setStatus(event.target.value as StoreganiseStatus | "TODOS")}>
            {statuses.map((item) => <option key={item} value={item}>{item === "TODOS" ? "Todos los estados" : item}</option>)}
          </SelectInput>
          <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <ActionButton variant="secondary" onClick={() => { setQuery(""); setInvoiceQuery(""); setEventType("TODOS"); setStatus("TODOS"); setDate(""); }}>
            Limpiar filtros
          </ActionButton>
        </section>

        {message ? <div className="no-print rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{message}</div> : null}

        {selected ? (
          <section className="rounded-lg border border-sky-200 bg-white p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={statusToneForStoreganise(selected.status)}>{selected.status}</StatusBadge>
                  <StatusBadge tone={selected.reviewed ? "green" : "amber"}>{selected.reviewed ? "REVISADO" : "SIN REVISAR"}</StatusBadge>
                </div>
                <h2 className="mt-3 text-lg font-black text-slate-950">{selected.event}</h2>
                <p className="mt-1 text-sm text-slate-600">{selected.customer} | {selected.storeganiseInvoiceId}</p>
                {selected.error ? <p className="mt-2 text-sm font-bold text-rose-700">{selected.error}</p> : null}
              </div>
              <ActionButton variant="secondary" onClick={() => setSelected(null)}>Cerrar payload</ActionButton>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-sky-50">{JSON.stringify(selected.payload, null, 2)}</pre>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Tabla principal de webhooks</h2>
            <p className="mt-1 text-sm text-slate-500">Todo evento recibido se conserva aunque falle; los duplicados se identifican antes de generar registros.</p>
          </div>
          {filtered.length === 0 ? (
            <div className="p-4"><EmptyState text="No hay eventos Storeganise con esos filtros." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Evento</th>
                    <th>Cliente</th>
                    <th>Factura Storeganise</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th>Fecha recibido</th>
                    <th>Procesado</th>
                    <th>Error</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id}>
                      <td className="font-mono text-xs">{log.id}</td>
                      <td className="min-w-64 font-mono text-xs">{log.event}</td>
                      <td>
                        <p className="font-bold text-slate-900">{log.customer}</p>
                        <p className="text-xs text-slate-500">{log.email}</p>
                      </td>
                      <td>{log.storeganiseInvoiceId}</td>
                      <td className="font-black">{money(log.amount)}</td>
                      <td><StatusBadge tone={statusToneForStoreganise(log.status)}>{log.status}</StatusBadge></td>
                      <td>{shortDate(log.receivedAt)}</td>
                      <td>{log.processedAt ? shortDate(log.processedAt) : "Pendiente"}</td>
                      <td className="min-w-60">{log.error ?? "Sin error"}</td>
                      <td>
                        <div className="flex min-w-[520px] flex-wrap gap-2">
                          <ActionButton variant="secondary" onClick={() => setSelected(log)}>Ver payload</ActionButton>
                          <ActionButton variant="secondary" onClick={() => retryEvent(log.id)}>Reintentar</ActionButton>
                          <ActionButton variant="secondary" onClick={() => setReviewed((current) => ({ ...current, [log.id]: true }))}>Marcar revisado</ActionButton>
                          <Link className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-black text-sky-700 transition hover:bg-sky-50" href="/dashboard/facturas">Ver factura</Link>
                          <Link className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-black text-sky-700 transition hover:bg-sky-50" href="/dashboard/pagos-bac">Ver pago</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-black text-slate-950">Flujo de integración</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {["Storeganise recibe evento", "Pagos BAC genera transacción", "Facturas emite al pagar", "Alertas detecta errores", "Reportes consolida"].map((step) => (
              <div key={step} className="rounded-md border border-sky-100 bg-sky-50 p-3 text-sm font-bold text-slate-700">{step}</div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
