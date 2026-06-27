"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { ActionButton, MetricCard, SelectInput, TextInput } from "@/components/ui";
import {
  EmailStatus,
  Invoice,
  PaymentStatus,
  alerts,
  caiRanges,
  getAvailableCorrelatives,
  invoices,
  money,
  payments,
  shortDate,
} from "@/lib/dashboard-data";

type ReportTab = "Resumen" | "Facturas" | "Pagos BAC" | "CAI / Correlativos" | "Correos" | "Errores";
type InvoiceStatus = "EMITIDA" | "PENDIENTE" | "ANULADA";

type ReportRow = {
  id: string;
  date: string;
  type: string;
  description: string;
  records: number;
  amount: number;
  generatedBy: string;
};

type PrintableReportProps = {
  format: "PDF" | "Imprimir";
  tab: ReportTab;
  reportType: string;
  from: string;
  to: string;
  metrics: {
    totalFacturado: number;
    totalIsv: number;
    neto: number;
    generatedInvoices: number;
    approvedPayments: number;
    pendingPayments: number;
  };
  filteredInvoices: Invoice[];
  filteredPayments: typeof payments;
  reportRows: ReportRow[];
};

const tabs: ReportTab[] = ["Resumen", "Facturas", "Pagos BAC", "CAI / Correlativos", "Correos", "Errores"];

const reportTypes = [
  "Reporte de facturas generadas",
  "Reporte de pagos BAC",
  "Reporte de ingresos por fecha",
  "Reporte de ISV",
  "Reporte de clientes facturados",
  "Reporte de CAI y correlativos",
  "Reporte de correlativos usados",
  "Reporte de correos enviados",
  "Reporte de errores del sistema",
  "Reporte fiscal para contador",
  "Reporte de facturas para contador",
];

function invoiceStatus(invoice: Invoice): InvoiceStatus {
  return invoice.number ? "EMITIDA" : "PENDIENTE";
}

function subtotalFromTotal(total: number) {
  return total / 1.15;
}

function isvFromTotal(total: number) {
  return total - subtotalFromTotal(total);
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadExcel(filename: string, rows: string[][]) {
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const table = rows
    .map((row, index) => {
      const cellTag = index === 0 ? "th" : "td";
      const cells = row.map((cell) => `<${cellTag}>${escapeHtml(cell)}</${cellTag}>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const workbook = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; width: 100%; }
      th { background: #e0f2fe; color: #075985; font-weight: 700; }
      th, td { border: 1px solid #bae6fd; padding: 8px; font-family: Arial, sans-serif; font-size: 12px; }
    </style>
  </head>
  <body>
    <table>${table}</table>
  </body>
</html>`;

  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function PrintableReport({
  format,
  tab,
  reportType,
  from,
  to,
  metrics,
  filteredInvoices,
  filteredPayments,
  reportRows,
}: PrintableReportProps) {
  const issuedInvoices = filteredInvoices.slice(0, 8);
  const reportPayments = filteredPayments.slice(0, 8);
  const reportSummaryRows = reportRows.slice(0, 8);

  return (
    <div className="print-area hidden">
      <article className="print-page bg-white text-slate-900">
        <header className="grid grid-cols-[1fr_auto] gap-6 border-b border-sky-700 pb-5">
          <div>
            <p className="text-xs font-black uppercase text-sky-700">Roatan Self Storage</p>
            <h1 className="mt-1 text-3xl font-black text-slate-950">{reportType}</h1>
            <p className="mt-2 text-sm text-slate-600">Periodo: {from} al {to}</p>
            <p className="text-sm text-slate-600">Vista: {tab}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black uppercase text-slate-500">Formato</p>
            <p className="mt-1 text-xl font-black text-sky-700">{format}</p>
            <p className="mt-3 text-sm text-slate-600">{new Date().toLocaleDateString("es-HN")}</p>
          </div>
        </header>

        <section className="grid grid-cols-3 gap-3 py-5">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs font-black uppercase text-slate-500">Total facturado</p>
            <p className="mt-1 text-lg font-black text-slate-950">{money(metrics.totalFacturado)}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs font-black uppercase text-slate-500">Total ISV</p>
            <p className="mt-1 text-lg font-black text-slate-950">{money(metrics.totalIsv)}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs font-black uppercase text-slate-500">Ingresos netos</p>
            <p className="mt-1 text-lg font-black text-slate-950">{money(metrics.neto)}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs font-black uppercase text-slate-500">Facturas</p>
            <p className="mt-1 text-lg font-black text-slate-950">{metrics.generatedInvoices}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs font-black uppercase text-slate-500">BAC aprobados</p>
            <p className="mt-1 text-lg font-black text-slate-950">{metrics.approvedPayments}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs font-black uppercase text-slate-500">BAC pendientes</p>
            <p className="mt-1 text-lg font-black text-slate-950">{metrics.pendingPayments}</p>
          </div>
        </section>

        {tab === "Resumen" ? (
          <section>
            <h2 className="mb-3 text-xl font-black text-slate-950">Resumen de reportes</h2>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Registros</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {reportSummaryRows.map((row) => (
                  <tr key={row.id}>
                    <td>{shortDate(row.date)}</td>
                    <td className="font-bold">{row.type}</td>
                    <td>{row.records}</td>
                    <td>{row.amount ? money(row.amount) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {tab === "Pagos BAC" ? (
          <section>
            <h2 className="mb-3 text-xl font-black text-slate-950">Pagos BAC</h2>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {reportPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{shortDate(payment.paidAt)}</td>
                    <td className="font-bold">{payment.client}</td>
                    <td>{money(payment.amount)}</td>
                    <td>{payment.status}</td>
                    <td>{payment.bacReference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <section>
            <h2 className="mb-3 text-xl font-black text-slate-950">Facturas del reporte</h2>
            <table>
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Cliente</th>
                  <th>RTN</th>
                  <th>Subtotal</th>
                  <th>ISV</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {issuedInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-mono">{invoice.number}</td>
                    <td className="font-bold">{invoice.client}</td>
                    <td>{invoice.rtn}</td>
                    <td>{money(subtotalFromTotal(invoice.total))}</td>
                    <td>{money(isvFromTotal(invoice.total))}</td>
                    <td className="font-black">{money(invoice.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          <p>Documento generado desde el modulo de reportes.</p>
        </footer>
      </article>
    </div>
  );
}

export default function ReportesPage() {
  const [tab, setTab] = useState<ReportTab>("Resumen");
  const [reportType, setReportType] = useState("Reporte de facturas para contador");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState("2026-05-31");
  const [client, setClient] = useState("");
  const [rtn, setRtn] = useState("");
  const [invoiceState, setInvoiceState] = useState<InvoiceStatus | "TODOS">("TODOS");
  const [paymentState, setPaymentState] = useState<PaymentStatus | "TODOS">("TODOS");
  const [cai, setCai] = useState("TODOS");
  const [emailState, setEmailState] = useState<EmailStatus | "TODOS">("TODOS");
  const [message, setMessage] = useState("");
  const [printFormat, setPrintFormat] = useState<"PDF" | "Imprimir" | null>(null);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const issuedDate = invoice.issuedAt.slice(0, 10);
      const payment = payments.find((item) => item.id === invoice.paymentId);
      const matchDate = issuedDate >= from && issuedDate <= to;
      const matchClient = invoice.client.toLowerCase().includes(client.toLowerCase()) || invoice.email.toLowerCase().includes(client.toLowerCase());
      const matchRtn = invoice.rtn.includes(rtn);
      const matchInvoiceState = invoiceState === "TODOS" || invoiceStatus(invoice) === invoiceState;
      const matchPaymentState = paymentState === "TODOS" || payment?.status === paymentState;
      const matchCai = cai === "TODOS" || invoice.cai === cai;
      const matchEmail = emailState === "TODOS" || invoice.emailStatus === emailState;
      return matchDate && matchClient && matchRtn && matchInvoiceState && matchPaymentState && matchCai && matchEmail;
    });
  }, [cai, client, emailState, from, invoiceState, paymentState, rtn, to]);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const paidDate = payment.paidAt.slice(0, 10);
      const matchDate = paidDate >= from && paidDate <= to;
      const matchClient = payment.client.toLowerCase().includes(client.toLowerCase()) || payment.email.toLowerCase().includes(client.toLowerCase());
      const matchPaymentState = paymentState === "TODOS" || payment.status === paymentState;
      return matchDate && matchClient && matchPaymentState;
    });
  }, [client, from, paymentState, to]);

  const metrics = useMemo(() => {
    const totalFacturado = filteredInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const totalIsv = filteredInvoices.reduce((sum, invoice) => sum + invoice.isv, 0);
    const neto = filteredInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const usedCorrelatives = caiRanges.reduce((sum, range) => sum + Math.max(range.current - range.initial + 1, 0), 0);
    const availableCorrelatives = caiRanges.reduce((sum, range) => sum + getAvailableCorrelatives(range), 0);

    return {
      totalFacturado,
      totalIsv,
      neto,
      generatedInvoices: filteredInvoices.length,
      approvedPayments: filteredPayments.filter((payment) => payment.status === "APPROVED").length,
      pendingPayments: filteredPayments.filter((payment) => payment.status === "PENDING").length,
      sentEmails: filteredInvoices.filter((invoice) => invoice.emailStatus === "ENVIADA").length,
      failedEmails: filteredInvoices.filter((invoice) => invoice.emailStatus === "FALLIDA").length,
      usedCorrelatives,
      availableCorrelatives,
    };
  }, [filteredInvoices, filteredPayments]);

  const reportRows: ReportRow[] = useMemo(
    () => [
      {
        id: "REP-001",
        date: "2026-05-05T09:00:00-06:00",
        type: "Reporte de facturas para contador",
        description: "Resumen fiscal de facturas emitidas por pagos BAC confirmados.",
        records: filteredInvoices.length,
        amount: metrics.totalFacturado,
        generatedBy: "Administración",
      },
      {
        id: "REP-002",
        date: "2026-05-05T09:10:00-06:00",
        type: "Reporte de pagos BAC",
        description: "Separación de pagos aprobados, rechazados, fallidos y pendientes.",
        records: filteredPayments.length,
        amount: filteredPayments.reduce((sum, payment) => sum + payment.amount, 0),
        generatedBy: "Tesorería",
      },
      {
        id: "REP-003",
        date: "2026-05-05T09:20:00-06:00",
        type: "Reporte de CAI y correlativos",
        description: "Control de rangos SAR, correlativos usados y disponibles.",
        records: caiRanges.length,
        amount: 0,
        generatedBy: "Contabilidad",
      },
      {
        id: "REP-004",
        date: "2026-05-05T09:30:00-06:00",
        type: "Reporte de errores del sistema",
        description: "Alertas de correo, PDF, Storeganise, BAC y CAI.",
        records: alerts.filter((alert) => !alert.resolved).length,
        amount: 0,
        generatedBy: "Sistema",
      },
    ],
    [filteredInvoices.length, filteredPayments, metrics.totalFacturado],
  );

  useEffect(() => {
    if (!printFormat) return;

    const clearPrint = () => setPrintFormat(null);
    window.addEventListener("afterprint", clearPrint, { once: true });
    const printTimer = window.setTimeout(() => window.print(), 80);

    return () => {
      window.clearTimeout(printTimer);
      window.removeEventListener("afterprint", clearPrint);
    };
  }, [printFormat]);

  const exportReport = (format: "PDF" | "Excel" | "CSV" | "Imprimir") => {
    setMessage(`Reporte "${reportType}" generado en formato ${format}.`);

    if (format === "PDF" || format === "Imprimir") {
      setPrintFormat(format);
      return;
    }

    const invoiceRows = [
      ["Número de factura", "Cliente", "RTN", "Correo", "Subtotal", "ISV", "Total", "CAI", "Correlativo", "Fecha de emisión", "Referencia BAC", "Estado correo", "Estado factura"],
      ...filteredInvoices.map((invoice) => [
        invoice.number,
        invoice.client,
        invoice.rtn,
        invoice.email,
        subtotalFromTotal(invoice.total).toFixed(2),
        isvFromTotal(invoice.total).toFixed(2),
        invoice.total.toFixed(2),
        invoice.cai,
        invoice.correlative,
        invoice.issuedAt,
        invoice.bacReference,
        invoice.emailStatus,
        invoiceStatus(invoice),
      ]),
    ];

    if (format === "CSV") {
      downloadCsv("reporte-facturas-contador.csv", invoiceRows);
      return;
    }

    if (format === "Excel") {
      downloadExcel("reporte-facturas-contador.xls", invoiceRows);
    }
  };

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Generación de reportes de facturación, pagos BAC, ingresos, CAI, correlativos, correos y actividad fiscal."
        actions={
          <>
            <ActionButton variant="secondary" onClick={() => exportReport("PDF")}>Exportar PDF</ActionButton>
            <ActionButton variant="secondary" onClick={() => exportReport("Excel")}>Exportar Excel</ActionButton>
            <ActionButton variant="secondary" onClick={() => exportReport("CSV")}>Exportar CSV</ActionButton>
            <ActionButton onClick={() => exportReport("Imprimir")}>Imprimir</ActionButton>
          </>
        }
      />

      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total facturado" value={money(metrics.totalFacturado)} hint="Facturas emitidas" />
          <MetricCard label="Total ISV" value={money(metrics.totalIsv)} hint="Impuesto calculado" />
          <MetricCard label="Ingresos netos" value={money(metrics.neto)} hint="Subtotal sin ISV" />
          <MetricCard label="Facturas generadas" value={String(metrics.generatedInvoices)} hint="Documentos fiscales" />
          <MetricCard label="BAC aprobados" value={String(metrics.approvedPayments)} hint="Pagos confirmados" />
          <MetricCard label="BAC pendientes" value={String(metrics.pendingPayments)} hint="En validación" />
          <MetricCard label="Correos enviados" value={String(metrics.sentEmails)} hint="Facturas entregadas" />
          <MetricCard label="Errores de correo" value={String(metrics.failedEmails)} hint="Requieren reenvío" />
          <MetricCard label="Correlativos usados" value={String(metrics.usedCorrelatives)} hint="Rangos SAR" />
          <MetricCard label="Correlativos disponibles" value={String(metrics.availableCorrelatives)} hint="Capacidad fiscal" />
        </div>

        <section className="no-print rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-8">
            <SelectInput value={reportType} onChange={(event) => setReportType(event.target.value)}>
              {reportTypes.map((item) => <option key={item}>{item}</option>)}
            </SelectInput>
            <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            <TextInput placeholder="Cliente" value={client} onChange={(event) => setClient(event.target.value)} />
            <TextInput placeholder="RTN" value={rtn} onChange={(event) => setRtn(event.target.value)} />
            <SelectInput value={invoiceState} onChange={(event) => setInvoiceState(event.target.value as InvoiceStatus | "TODOS")}>
              <option value="TODOS">Estado factura</option>
              <option value="EMITIDA">EMITIDA</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="ANULADA">ANULADA</option>
            </SelectInput>
            <SelectInput value={paymentState} onChange={(event) => setPaymentState(event.target.value as PaymentStatus | "TODOS")}>
              <option value="TODOS">Estado BAC</option>
              <option value="APPROVED">APPROVED</option>
              <option value="PENDING">PENDING</option>
              <option value="REJECTED">REJECTED</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="REFUNDED">REFUNDED</option>
            </SelectInput>
            <SelectInput value={emailState} onChange={(event) => setEmailState(event.target.value as EmailStatus | "TODOS")}>
              <option value="TODOS">Estado correo</option>
              <option value="ENVIADA">ENVIADA</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="FALLIDA">FALLIDA</option>
            </SelectInput>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <SelectInput value={cai} onChange={(event) => setCai(event.target.value)}>
              <option value="TODOS">Todos los CAI</option>
              {caiRanges.map((range) => <option key={range.id} value={range.cai}>{range.cai}</option>)}
            </SelectInput>
            <ActionButton onClick={() => setMessage(`Reporte "${reportType}" actualizado con ${filteredInvoices.length} facturas.`)}>Generar</ActionButton>
            <ActionButton variant="secondary" onClick={() => { setFrom("2026-04-01"); setTo("2026-05-31"); setClient(""); setRtn(""); setInvoiceState("TODOS"); setPaymentState("TODOS"); setCai("TODOS"); setEmailState("TODOS"); }}>
              Limpiar filtros
            </ActionButton>
          </div>
        </section>

        {message ? <div className="no-print rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{message}</div> : null}

        <section className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`rounded-md px-3 py-2 text-sm font-black transition ${
                  tab === item ? "bg-[#4188ef] text-white shadow-sm shadow-sky-900/20" : "text-slate-600 hover:bg-sky-50 hover:text-sky-700"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {tab === "Resumen" ? (
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-black text-slate-950">Tabla principal de reportes</h2>
              <p className="mt-1 text-sm text-slate-500">Reportes administrativos, contables y fiscales disponibles.</p>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo de reporte</th>
                    <th>Descripción</th>
                    <th>Total registros</th>
                    <th>Total monto</th>
                    <th>Generado por</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.id}>
                      <td>{shortDate(row.date)}</td>
                      <td className="font-bold text-slate-900">{row.type}</td>
                      <td>{row.description}</td>
                      <td>{row.records}</td>
                      <td className="font-black">{row.amount ? money(row.amount) : "-"}</td>
                      <td>{row.generatedBy}</td>
                      <td>
                        <div className="flex min-w-96 flex-wrap gap-2">
                          <ActionButton variant="secondary" onClick={() => setReportType(row.type)}>Generar</ActionButton>
                          <ActionButton variant="secondary" onClick={() => exportReport("PDF")}>PDF</ActionButton>
                          <ActionButton variant="secondary" onClick={() => exportReport("Excel")}>Excel</ActionButton>
                          <ActionButton variant="secondary" onClick={() => exportReport("CSV")}>CSV</ActionButton>
                          <ActionButton onClick={() => exportReport("Imprimir")}>Imprimir</ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "Facturas" ? (
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-black text-slate-950">Reporte de facturas para contador</h2>
              <p className="mt-1 text-sm text-slate-500">Solo incluye facturas fiscales emitidas automáticamente por pagos BAC confirmados.</p>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Número de factura</th>
                    <th>Cliente</th>
                    <th>RTN</th>
                    <th>Correo</th>
                    <th>Subtotal</th>
                    <th>ISV</th>
                    <th>Total</th>
                    <th>CAI</th>
                    <th>Correlativo</th>
                    <th>Fecha de emisión</th>
                    <th>Referencia BAC</th>
                    <th>Estado correo</th>
                    <th>Estado factura</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="font-mono">{invoice.number}</td>
                      <td className="font-bold text-slate-900">{invoice.client}</td>
                      <td>{invoice.rtn}</td>
                      <td>{invoice.email}</td>
                      <td>{money(subtotalFromTotal(invoice.total))}</td>
                      <td>{money(isvFromTotal(invoice.total))}</td>
                      <td className="font-black">{money(invoice.total)}</td>
                      <td className="min-w-72 font-mono text-xs">{invoice.cai}</td>
                      <td>{invoice.correlative}</td>
                      <td>{shortDate(invoice.issuedAt)}</td>
                      <td>{invoice.bacReference}</td>
                      <td><StatusBadge tone={statusTone(invoice.emailStatus)}>{invoice.emailStatus}</StatusBadge></td>
                      <td><StatusBadge tone="green">{invoiceStatus(invoice)}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "Pagos BAC" ? (
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-black text-slate-950">Reporte de pagos BAC</h2>
              <p className="mt-1 text-sm text-slate-500">Separación de aprobados, rechazados, fallidos, cancelados, reembolsados y pendientes.</p>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Correo</th>
                    <th>Monto BAC</th>
                    <th>Estado</th>
                    <th>Referencia BAC</th>
                    <th>ID transacción</th>
                    <th>Factura</th>
                    <th>Respuesta banco</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{shortDate(payment.paidAt)}</td>
                      <td className="font-bold text-slate-900">{payment.client}</td>
                      <td>{payment.email}</td>
                      <td className="font-black">{money(payment.amount)}</td>
                      <td><StatusBadge tone={statusTone(payment.status)}>{payment.status}</StatusBadge></td>
                      <td>{payment.bacReference}</td>
                      <td>{payment.transactionId}</td>
                      <td className="font-mono">{payment.invoiceNumber ?? "Sin factura"}</td>
                      <td>{payment.error ?? payment.bankResponse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "CAI / Correlativos" ? (
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-black text-slate-950">Reporte de CAI y correlativos</h2>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>CAI</th>
                    <th>Rango inicial</th>
                    <th>Rango final</th>
                    <th>Actual</th>
                    <th>Usados</th>
                    <th>Disponibles</th>
                    <th>Fecha límite</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {caiRanges.map((range) => (
                    <tr key={range.id}>
                      <td className="min-w-72 font-mono text-xs">{range.cai}</td>
                      <td>{range.initial}</td>
                      <td>{range.final}</td>
                      <td>{range.current}</td>
                      <td>{Math.max(range.current - range.initial + 1, 0)}</td>
                      <td className="font-black">{getAvailableCorrelatives(range)}</td>
                      <td>{range.limitDate}</td>
                      <td><StatusBadge tone={statusTone(range.status)}>{range.status}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "Correos" ? (
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-black text-slate-950">Reporte de correos enviados</h2>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>Cliente</th>
                    <th>Correo</th>
                    <th>Estado correo</th>
                    <th>Fecha emisión</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="font-mono">{invoice.number}</td>
                      <td className="font-bold text-slate-900">{invoice.client}</td>
                      <td>{invoice.email}</td>
                      <td><StatusBadge tone={statusTone(invoice.emailStatus)}>{invoice.emailStatus}</StatusBadge></td>
                      <td>{shortDate(invoice.issuedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "Errores" ? (
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-black text-slate-950">Reporte de errores del sistema</h2>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nivel</th>
                    <th>Módulo</th>
                    <th>Mensaje</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr key={alert.id}>
                      <td>{shortDate(alert.createdAt)}</td>
                      <td><StatusBadge tone={statusTone(alert.level)}>{alert.level}</StatusBadge></td>
                      <td>{alert.area}</td>
                      <td>{alert.message}</td>
                      <td><StatusBadge tone={alert.resolved ? "green" : "amber"}>{alert.resolved ? "RESUELTA" : "PENDIENTE"}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
      {printFormat ? (
        <PrintableReport
          format={printFormat}
          tab={tab}
          reportType={reportType}
          from={from}
          to={to}
          metrics={metrics}
          filteredInvoices={filteredInvoices}
          filteredPayments={filteredPayments}
          reportRows={reportRows}
        />
      ) : null}
    </>
  );
}
