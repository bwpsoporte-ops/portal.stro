"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton, EmptyState, MetricCard, SelectInput, TextInput } from "@/components/ui";
import {
  cardPaymentDate, cardPaymentLabels, cardPaymentMoney, cardPaymentOrigin, cardPaymentResult, hondurasDate,
  type CardPaymentRow, type CardPaymentsResponse, type CardPaymentStatus,
} from "@/lib/card-payments";

function statusTone(status: CardPaymentStatus) {
  if (status === "APPROVED") return "green";
  if (status === "RECORDED") return "blue";
  if (status === "FAILED" || status === "REJECTED") return "red";
  if (status === "PENDING" || status === "UNKNOWN") return "amber";
  if (status === "REFUNDED") return "blue";
  return "slate";
}

function totalsByCurrency(rows: CardPaymentRow[]) {
  const amounts = new Map<string, number>();
  for (const row of rows) amounts.set(row.currency, (amounts.get(row.currency) ?? 0) + Math.round(row.amount * 100));
  return [...amounts].sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, cents]) => `${cardPaymentMoney(cents / 100, currency)} ${currency}`).join(" · ") || "Sin pagos";
}

export default function PagosBacPage() {
  const [data, setData] = useState<CardPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CardPaymentStatus | "TODOS">("TODOS");
  const [date, setDate] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    setLoading(true);
    try {
      const response = await fetch("/api/pagos-bac", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !result.ok) throw new Error(result.message || "No se pudieron consultar los pagos.");
      if (!Array.isArray(result.payments)) throw new Error("La respuesta de pagos no es válida.");
      setData(result);
      setError("");
    } catch (failure) {
      if ((!controller.signal.aborted || timedOut) && activeRequest.current === controller) {
        setError(timedOut ? "La consulta tardó demasiado. Vuelve a actualizar." : failure instanceof Error ? failure.message : "No se pudieron cargar los pagos.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const interval = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [load]);

  const filtered = useMemo(() => (data?.payments ?? []).filter((payment) => {
    const searchable = [payment.customerName, payment.customerEmail, payment.reference, payment.transactionId,
      payment.paymentId, payment.unitLabel, payment.processor, payment.cardBrand,
      cardPaymentOrigin(payment), cardPaymentResult(payment)].join(" ").toLowerCase();
    return searchable.includes(query.trim().toLowerCase())
      && (status === "TODOS" || payment.status === status)
      && (!date || hondurasDate(payment.paidAt ?? payment.createdAt) === date)
      && `${payment.invoiceId} ${payment.invoiceNumber ?? ""}`.toLowerCase().includes(invoiceFilter.trim().toLowerCase());
  }), [data, date, invoiceFilter, query, status]);

  const selected = data?.payments.find((payment) => payment.key === selectedKey);
  const metrics = useMemo(() => {
    const received = filtered.filter((p) => p.status === "APPROVED" || p.status === "RECORDED");
    const pending = filtered.filter((p) => p.status === "PENDING");
    const dated = received.filter((p) => p.paidAt).sort((a, b) => b.paidAt!.localeCompare(a.paidAt!));
    return {
      received: received.length,
      rejected: filtered.filter((p) => p.status === "REJECTED").length,
      failed: filtered.filter((p) => p.status === "FAILED").length,
      charged: totalsByCurrency(received), pendingAmount: totalsByCurrency(pending),
      latest: dated[0] ? cardPaymentDate(dated[0].paidAt) : "Sin fecha informada",
    };
  }, [filtered]);
  const metric = (value: string | number) => data ? String(value) : "—";

  return (
    <>
      <PageHeader title="Pagos BAC" description="Pagos con tarjeta: clientes, procesador u origen, marca informada, resultado y factura vinculada." />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Pagos registrados / aprobados" value={metric(metrics.received)} hint="Con tarjeta · según Storeganise" />
          <MetricCard label="Pagos rechazados" value={metric(metrics.rejected)} hint="Según los registros recibidos" />
          <MetricCard label="Pagos fallidos" value={metric(metrics.failed)} hint="Según los registros recibidos" />
          <MetricCard label="Total registrado" value={metric(metrics.charged)} hint="Moneda original · sin mezclar USD y HNL" />
          <MetricCard label="Total pendiente" value={metric(metrics.pendingAmount)} hint="Según filtros · moneda original" />
          <MetricCard label="Último pago registrado" value={metric(metrics.latest)} hint="Fechas y horas de Honduras" />
        </div>

        <section className="no-print grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5">
          <TextInput aria-label="Buscar cliente, marca de tarjeta o referencia" placeholder="Cliente, bodega, tarjeta o referencia" value={query} onChange={(event) => setQuery(event.target.value)} />
          <TextInput aria-label="Buscar factura" placeholder="Factura Storeganise o fiscal" value={invoiceFilter} onChange={(event) => setInvoiceFilter(event.target.value)} />
          <SelectInput aria-label="Estado del pago" value={status} onChange={(event) => setStatus(event.target.value as CardPaymentStatus | "TODOS")}>
            <option value="TODOS">Todos los estados</option>
            {Object.entries(cardPaymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectInput>
          <TextInput aria-label="Fecha del pago en Honduras" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <ActionButton variant="secondary" onClick={() => { setQuery(""); setStatus("TODOS"); setDate(""); setInvoiceFilter(""); }}>Limpiar filtros</ActionButton>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <div>
            <p className="font-bold">Fuente: Storeganise · Actualización automática cada 30 segundos</p>
            <p>Consulta: {data ? cardPaymentDate(data.fetchedAt) : "Sin consulta completada"}. Última sincronización de cobros: {data?.lastSync ? cardPaymentDate(data.lastSync) : "Sin datos"}.</p>
            <p>Un registro con método tarjeta no acredita por sí solo una aprobación de BAC. Solo se identifica BAC cuando el origen lo informa.</p>
          </div>
          <button type="button" disabled={loading} onClick={() => void load()} className="rounded-md border border-sky-200 bg-white px-3 py-2 font-black text-sky-700 hover:bg-sky-50 disabled:opacity-50">{loading ? "Actualizando..." : "Actualizar"}</button>
        </section>
        {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}{data ? " Los datos visibles corresponden a la última consulta exitosa." : ""}</div> : null}
        {data?.invoiceLimitReached ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">La consulta abarca los pagos de las últimas 2,000 facturas sincronizadas. Los totales y filtros corresponden únicamente a ese conjunto, no a todo el historial.</p> : null}
        {data && (data.unclassifiedPayments > 0 || data.invalidPayments > 0) ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Hay {data.unclassifiedPayments} registro(s) cuyo método no permite identificar tarjeta y {data.invalidPayments} con importes o monedas no válidos. No se incluyen en los totales de tarjeta. No se modificaron esos registros.</p> : null}

        {selected ? (
          <section className="rounded-lg border border-sky-200 bg-white p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={statusTone(selected.status)}>{cardPaymentResult(selected)}</StatusBadge>
                  <StatusBadge tone="slate">{cardPaymentOrigin(selected)}</StatusBadge>
                  <StatusBadge tone="blue">{selected.cardBrand ?? "Marca de tarjeta no informada"}</StatusBadge>
                </div>
                <h2 className="mt-3 text-lg font-black text-slate-950">{selected.customerName}</h2>
                <p className="text-sm text-slate-600">{selected.customerEmail ?? "Sin correo informado"} · Bodega: {selected.unitLabel ?? "Sin bodega vinculada"}</p>
                <p className="mt-2 text-sm text-slate-600">Monto de esta transacción: {cardPaymentMoney(selected.amount, selected.currency)} {selected.currency}</p>
              </div>
              <ActionButton variant="secondary" onClick={() => setSelectedKey(null)}>Cerrar detalle</ActionButton>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-4 text-sm leading-6">
                <p><strong>Procesador / origen:</strong> {cardPaymentOrigin(selected)}</p>
                <p><strong>Marca de tarjeta:</strong> {selected.cardBrand ?? "No informada por Storeganise"}</p>
                <p><strong>Resultado del pago:</strong> {cardPaymentResult(selected)}</p>
                <p><strong>Referencia bancaria:</strong> {selected.reference ?? "No informada"}</p>
                <p><strong>ID transacción bancaria:</strong> {selected.transactionId ?? "No informado"}</p>
                <p><strong>ID pago Storeganise:</strong> {selected.paymentId ?? "No informado"}</p>
                <p><strong>Factura Storeganise:</strong> {selected.invoiceId}</p>
                <p><strong>Factura fiscal:</strong> {selected.invoiceNumber ?? "Sin factura fiscal vinculada"}</p>
                <p><strong>Creación:</strong> {cardPaymentDate(selected.createdAt)}</p>
                <p><strong>Fecha de pago informada:</strong> {cardPaymentDate(selected.paidAt)}</p>
              </div>
              <div className="rounded-lg bg-slate-950 p-4 text-sm leading-6 text-sky-50">
                <p className="font-black">Información de la transacción</p>
                <p>Estos datos proceden del último registro sincronizado de Storeganise, no de una consulta directa al banco.</p>
                <p>El monto corresponde al pago completo recibido. No se suma otra vez por la proforma del depósito.</p>
                <p>No se muestran números de tarjeta, CVV, vencimientos, tokens ni respuestas bancarias completas.</p>
                <p className="mt-3">Para corregir un pago, utiliza Storeganise y espera su siguiente notificación. Este módulo es de consulta y no realiza cobros.</p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Tabla principal de pagos BAC</h2>
            <p className="mt-1 text-sm text-slate-500">{filtered.length} transacción(es) con tarjeta según los filtros. No incluye efectivo ni transferencias identificadas. Los totales no incluyen pendientes, cancelados, rechazados ni reembolsados.</p>
          </div>
          {!data ? <div className="p-4"><EmptyState text={error ? "La consulta no está disponible; esto no significa que no existan pagos." : "Cargando transacciones de Storeganise..."} /></div>
            : filtered.length === 0 ? <div className="p-4"><EmptyState text="No hay transacciones identificadas como tarjeta con estos filtros. Revisa que Storeganise registre el método del pago." /></div>
            : (
              <div className="overflow-x-auto">
                <table>
                  <thead><tr>
                    <th>Cliente</th><th>Correo</th><th>Monto</th><th>Referencia</th><th>Transacción</th><th>Factura Storeganise</th><th>Factura fiscal</th><th>Fecha creación</th><th>Fecha pago</th><th>Acciones</th>
                  </tr></thead>
                  <tbody>{filtered.map((payment) => (
                    <tr key={payment.key}>
                      <td className="font-bold text-slate-900">{payment.customerName}<p className="text-xs font-normal text-slate-500">Bodega: {payment.unitLabel ?? "Sin vincular"}</p></td>
                      <td>{payment.customerEmail ?? "Sin correo"}</td>
                      <td className="font-black">{cardPaymentMoney(payment.amount, payment.currency)} {payment.currency}</td>
                      <td className="min-w-48">
                        <p className="break-all font-mono text-xs text-slate-800">{payment.reference || payment.paymentId || "No informada"}</p>
                        {payment.reference || payment.paymentId ? (
                          <p className="mt-1 text-xs text-slate-500">{payment.reference ? "Referencia bancaria" : "ID pago Storeganise"}</p>
                        ) : null}
                      </td>
                      <td className="min-w-44"><StatusBadge tone={statusTone(payment.status)}>{cardPaymentResult(payment)}</StatusBadge></td>
                      <td>{payment.invoiceId}</td><td className="font-mono">{payment.invoiceNumber ?? "Sin vincular"}</td>
                      <td>{cardPaymentDate(payment.createdAt)}</td><td>{cardPaymentDate(payment.paidAt)}</td>
                      <td><div className="flex min-w-64 flex-wrap gap-2">
                        <ActionButton variant="secondary" onClick={() => setSelectedKey(payment.key)}>Ver detalle</ActionButton>
                        {payment.documentId ? <a className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-black text-sky-700 hover:bg-sky-50" href={`/api/billing/${encodeURIComponent(payment.documentId)}/pdf`} target="_blank" rel="noopener noreferrer">Ver factura / PDF</a> : null}
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        </section>
      </div>
    </>
  );
}
