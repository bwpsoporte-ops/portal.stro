"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton, EmptyState, MetricCard, SelectInput, TextInput } from "@/components/ui";
import { activeCai, getAvailableCorrelatives, invoices, money, payments, shortDate } from "@/lib/dashboard-data";

type BacPaymentStatus =
  | "PAYMENT_CREATED"
  | "WAITING_BAC_CONFIRMATION"
  | "APPROVED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "COMPLETED"
  | "DUPLICATE_BLOCKED"
  | "IN_REVIEW";

type BacRow = {
  paymentId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: "HNL";
  status: BacPaymentStatus;
  bacReference: string;
  bacTransactionId: string;
  storeganiseInvoiceId: string;
  invoiceNumber?: string;
  createdAt: string;
  paidAt?: string;
  errorMessage?: string;
  rawBacResponse: Record<string, string | number | boolean | null>;
  fiscalData: {
    rtn: string;
    phone: string;
    address: string;
    type: "persona natural" | "empresa";
  };
  emailSent: boolean;
  storeganiseSync: "SYNCED" | "PENDING" | "FAILED";
};

const statuses: Array<BacPaymentStatus | "TODOS"> = [
  "TODOS",
  "PAYMENT_CREATED",
  "WAITING_BAC_CONFIRMATION",
  "APPROVED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "COMPLETED",
  "DUPLICATE_BLOCKED",
  "IN_REVIEW",
];

function mapPaymentStatus(status: string, confirmed: boolean): BacPaymentStatus {
  if (status === "APPROVED" && confirmed) return "COMPLETED";
  if (status === "PENDING") return "WAITING_BAC_CONFIRMATION";
  if (status === "REJECTED") return "REJECTED";
  if (status === "FAILED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "REFUNDED") return "REFUNDED";
  return "PAYMENT_CREATED";
}

function buildRows(): BacRow[] {
  return payments.map((payment, index) => {
    const invoice = invoices.find((item) => item.number === payment.invoiceNumber);
    const status = mapPaymentStatus(payment.status, payment.confirmed);

    return {
      paymentId: payment.id.toUpperCase(),
      customerId: `CUS-${String(index + 1).padStart(4, "0")}`,
      customerName: payment.client,
      customerEmail: payment.email,
      amount: payment.amount,
      currency: "HNL",
      status,
      bacReference: payment.bacReference,
      bacTransactionId: payment.transactionId,
      storeganiseInvoiceId: `SG-INV-${payment.bacReference.replace("BAC-", "")}`,
      invoiceNumber: payment.invoiceNumber,
      createdAt: payment.paidAt,
      paidAt: payment.confirmed ? payment.paidAt : undefined,
      errorMessage: payment.error,
      rawBacResponse: {
        payment_id: payment.id,
        bac_transaction_id: payment.transactionId,
        bac_reference: payment.bacReference,
        status: payment.status,
        confirmed: payment.confirmed,
        bank_response: payment.bankResponse,
        amount: payment.amount,
      },
      fiscalData: {
        rtn: invoice?.rtn ?? "Pendiente",
        phone: "+504 2400-0000",
        address: "Roatán, Islas de la Bahía",
        type: invoice?.rtn ? "empresa" : "persona natural",
      },
      emailSent: invoice?.emailStatus === "ENVIADA",
      storeganiseSync: payment.confirmed ? "SYNCED" : payment.status === "FAILED" ? "FAILED" : "PENDING",
    };
  });
}

function statusToneForBac(status: BacPaymentStatus) {
  if (status === "COMPLETED" || status === "APPROVED") return "green";
  if (status === "FAILED" || status === "REJECTED" || status === "DUPLICATE_BLOCKED") return "red";
  if (status === "WAITING_BAC_CONFIRMATION" || status === "IN_REVIEW" || status === "PAYMENT_CREATED") return "amber";
  if (status === "REFUNDED") return "blue";
  return "slate";
}

export default function PagosBacPage() {
  const sourceRows = useMemo(() => buildRows(), []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<BacPaymentStatus | "TODOS">("TODOS");
  const [date, setDate] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [selected, setSelected] = useState<BacRow | null>(null);
  const [overrides, setOverrides] = useState<Record<string, BacPaymentStatus>>({});
  const [message, setMessage] = useState("");

  const rows = useMemo(
    () => sourceRows.map((row) => ({ ...row, status: overrides[row.paymentId] ?? row.status })),
    [overrides, sourceRows],
  );

  const filtered = useMemo(() => {
    return rows.filter((payment) => {
      const text = `${payment.customerName} ${payment.customerEmail} ${payment.bacReference} ${payment.bacTransactionId}`.toLowerCase();
      const matchText = text.includes(query.toLowerCase());
      const matchStatus = status === "TODOS" || payment.status === status;
      const matchDate = !date || payment.createdAt.startsWith(date) || payment.paidAt?.startsWith(date);
      const matchInvoice = `${payment.storeganiseInvoiceId} ${payment.invoiceNumber ?? ""}`.toLowerCase().includes(invoiceFilter.toLowerCase());
      return matchText && matchStatus && matchDate && matchInvoice;
    });
  }, [date, invoiceFilter, query, rows, status]);

  const metrics = useMemo(() => {
    const approved = rows.filter((payment) => payment.status === "APPROVED" || payment.status === "COMPLETED");
    const pending = rows.filter((payment) => payment.status === "WAITING_BAC_CONFIRMATION" || payment.status === "PAYMENT_CREATED");
    const lastConfirmed = approved.sort((a, b) => new Date(b.paidAt ?? b.createdAt).getTime() - new Date(a.paidAt ?? a.createdAt).getTime())[0];
    return {
      approved: approved.length,
      pending: pending.length,
      rejected: rows.filter((payment) => payment.status === "REJECTED").length,
      failed: rows.filter((payment) => payment.status === "FAILED").length,
      charged: approved.reduce((sum, payment) => sum + payment.amount, 0),
      pendingAmount: pending.reduce((sum, payment) => sum + payment.amount, 0),
      lastConfirmation: lastConfirmed ? shortDate(lastConfirmed.paidAt ?? lastConfirmed.createdAt) : "Sin confirmar",
      errors: rows.filter((payment) => payment.errorMessage || ["FAILED", "REJECTED", "DUPLICATE_BLOCKED"].includes(payment.status)).length,
      duplicates: rows.filter((payment) => payment.status === "DUPLICATE_BLOCKED").length,
    };
  }, [rows]);

  const retry = (payment: BacRow) => {
    setOverrides((current) => ({ ...current, [payment.paymentId]: "WAITING_BAC_CONFIRMATION" }));
    setMessage(`Confirmación BAC reintentada para ${payment.bacReference}. Validando firma, monto, transaction_id e idempotencia.`);
  };

  const validateCriticalRules = (payment: BacRow) => {
    const rules = [
      payment.status === "APPROVED" || payment.status === "COMPLETED" ? "BAC aprobado" : "No generar factura: BAC no aprobado",
      payment.amount > 0 ? "Monto válido" : "No generar factura: monto inválido",
      payment.customerId ? "Cliente asociado" : "No generar factura: falta cliente",
      activeCai ? "CAI activo encontrado" : "No generar factura: falta CAI activo",
      activeCai && new Date(activeCai.limitDate) >= new Date("2026-05-05") ? "CAI vigente" : "No generar factura: CAI vencido",
      getAvailableCorrelatives(activeCai) > 0 ? "Correlativos disponibles" : "No generar factura: sin correlativos",
      payment.status !== "DUPLICATE_BLOCKED" ? "Idempotencia OK" : "Pago ya procesado anteriormente",
    ];
    setMessage(rules.join(" | "));
  };

  return (
    <>
      <PageHeader
        title="Pagos BAC"
        description="Monitoreo de pagos procesados por BAC: estado real, referencia bancaria, confirmación, idempotencia y relación con la factura fiscal."
      />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Pagos aprobados" value={String(metrics.approved)} hint="APPROVED / COMPLETED" />
          <MetricCard label="Pagos pendientes" value={String(metrics.pending)} hint="Esperando confirmación BAC" />
          <MetricCard label="Pagos rechazados" value={String(metrics.rejected)} hint="No generan factura" />
          <MetricCard label="Pagos fallidos" value={String(metrics.failed)} hint="Crean alerta operativa" />
          <MetricCard label="Total cobrado" value={money(metrics.charged)} hint="Pagos aprobados" />
          <MetricCard label="Total pendiente" value={money(metrics.pendingAmount)} hint="Por confirmar" />
          <MetricCard label="Última confirmación BAC" value={metrics.lastConfirmation} hint="Webhook /webhooks/bac" />
          <MetricCard label="Errores BAC" value={String(metrics.errors)} hint={`${metrics.duplicates} duplicados bloqueados`} />
        </div>

        <section className="no-print grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5">
          <TextInput placeholder="Cliente, correo, referencia o transacción" value={query} onChange={(event) => setQuery(event.target.value)} />
          <TextInput placeholder="Factura Storeganise o fiscal" value={invoiceFilter} onChange={(event) => setInvoiceFilter(event.target.value)} />
          <SelectInput value={status} onChange={(event) => setStatus(event.target.value as BacPaymentStatus | "TODOS")}>
            {statuses.map((item) => <option key={item} value={item}>{item === "TODOS" ? "Todos los estados" : item}</option>)}
          </SelectInput>
          <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <ActionButton variant="secondary" onClick={() => { setQuery(""); setStatus("TODOS"); setDate(""); setInvoiceFilter(""); }}>Limpiar filtros</ActionButton>
        </section>

        {message ? <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{message}</div> : null}

        {selected ? (
          <section className="rounded-lg border border-sky-200 bg-white p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={statusToneForBac(selected.status)}>{selected.status}</StatusBadge>
                  <StatusBadge tone={selected.emailSent ? "green" : "amber"}>{selected.emailSent ? "CORREO ENVIADO" : "CORREO PENDIENTE"}</StatusBadge>
                  <StatusBadge tone={selected.storeganiseSync === "SYNCED" ? "green" : selected.storeganiseSync === "FAILED" ? "red" : "amber"}>{selected.storeganiseSync}</StatusBadge>
                </div>
                <h2 className="mt-3 text-lg font-black text-slate-950">{selected.customerName}</h2>
                <p className="text-sm text-slate-600">{selected.customerEmail} | {selected.fiscalData.type} | RTN: {selected.fiscalData.rtn}</p>
                <p className="mt-2 text-sm text-slate-600">Monto: {money(selected.amount)} | ISV estimado: {money(selected.amount - selected.amount / 1.15)}</p>
              </div>
              <ActionButton variant="secondary" onClick={() => setSelected(null)}>Cerrar detalle</ActionButton>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-4 text-sm">
                <p><strong>Referencia BAC:</strong> {selected.bacReference}</p>
                <p><strong>ID transacción:</strong> {selected.bacTransactionId}</p>
                <p><strong>Factura Storeganise:</strong> {selected.storeganiseInvoiceId}</p>
                <p><strong>Factura fiscal:</strong> {selected.invoiceNumber ?? "Pendiente"}</p>
                <p><strong>Creación:</strong> {shortDate(selected.createdAt)}</p>
                <p><strong>Confirmación:</strong> {selected.paidAt ? shortDate(selected.paidAt) : "Pendiente"}</p>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-sky-50">{JSON.stringify(selected.rawBacResponse, null, 2)}</pre>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Tabla principal de pagos BAC</h2>
            <p className="mt-1 text-sm text-slate-500">Una factura fiscal solo nace de un pago BAC aprobado y validado contra idempotencia.</p>
          </div>
          {filtered.length === 0 ? (
            <div className="p-4"><EmptyState text="No hay pagos BAC con esos filtros." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>ID Pago</th>
                    <th>Cliente</th>
                    <th>Correo</th>
                    <th>Monto</th>
                    <th>Estado BAC</th>
                    <th>Referencia BAC</th>
                    <th>Transacción BAC</th>
                    <th>Factura Storeganise</th>
                    <th>Factura fiscal</th>
                    <th>Fecha creación</th>
                    <th>Fecha pago</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((payment) => (
                    <tr key={payment.paymentId}>
                      <td className="font-mono text-xs">{payment.paymentId}</td>
                      <td className="font-bold text-slate-900">{payment.customerName}</td>
                      <td>{payment.customerEmail}</td>
                      <td className="font-black">{money(payment.amount)}</td>
                      <td><StatusBadge tone={statusToneForBac(payment.status)}>{payment.status}</StatusBadge></td>
                      <td>{payment.bacReference}</td>
                      <td>{payment.bacTransactionId}</td>
                      <td>{payment.storeganiseInvoiceId}</td>
                      <td className="font-mono">{payment.invoiceNumber ?? "Pendiente"}</td>
                      <td>{shortDate(payment.createdAt)}</td>
                      <td>{payment.paidAt ? shortDate(payment.paidAt) : "Sin pago"}</td>
                      <td>
                        <div className="flex min-w-[620px] flex-wrap gap-2">
                          <ActionButton variant="secondary" onClick={() => setSelected(payment)}>Ver detalle</ActionButton>
                          <ActionButton variant="secondary" onClick={() => validateCriticalRules(payment)}>Consultar BAC</ActionButton>
                          <ActionButton variant="secondary" onClick={() => retry(payment)}>Reintentar</ActionButton>
                          <Link className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-black text-sky-700 transition hover:bg-sky-50" href="/dashboard/facturas">Ver factura</Link>
                          <ActionButton variant="secondary" onClick={() => setMessage(`Cliente ${payment.customerId}: ${payment.customerName}. Datos fiscales listos para auditoría.`)}>Ver cliente</ActionButton>
                          <ActionButton variant="secondary" onClick={() => setSelected(payment)}>Respuesta BAC</ActionButton>
                          <ActionButton onClick={() => setOverrides((current) => ({ ...current, [payment.paymentId]: "IN_REVIEW" }))}>En revisión</ActionButton>
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
