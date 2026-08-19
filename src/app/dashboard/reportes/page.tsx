"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { ActionButton, EmptyState, MetricCard, SelectInput, TextInput } from "@/components/ui";

type Invoice = {
  id: string;
  document_number: string;
  source: string;
  customer_name: string;
  customer_email: string | null;
  customer_rtn: string | null;
  unit_label: string | null;
  currency: "USD" | "HNL";
  exchange_rate: number;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  amount_paid: string;
  credited_amount: string;
  status: string;
  cai: string | null;
  fiscal_correlative: number | null;
  sent_at: string | null;
  created_at: string;
  subtotal_hnl: number;
  discount_hnl: number;
  tax_hnl: number;
  total_hnl: number;
  amount_paid_hnl: number;
  credited_amount_hnl: number;
  subtotal_usd: number;
  discount_usd: number;
  tax_usd: number;
  total_usd: number;
  amount_paid_usd: number;
  credited_amount_usd: number;
};

type Payment = {
  id: string;
  document_id: string;
  amount: string;
  method: string;
  reference: string | null;
  paid_at: string;
  document_number: string;
  customer_name: string;
  currency: "USD" | "HNL";
  exchange_rate: number;
  amount_hnl: number;
  amount_usd: number;
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
  establishment: string;
  emission_point: string;
  available: number;
  used: number;
};

type CreditNote = {
  id: string;
  credit_note_number: string;
  invoice_number: string;
  customer_name: string;
  currency: "USD" | "HNL";
  total: string;
  status: string;
  created_at: string;
  exchange_rate: number;
  total_hnl: number;
  total_usd: number;
};

type Company = {
  trade_name: string;
  legal_name: string;
  rtn: string;
};

type Tab = "Resumen" | "Facturas" | "Pagos" | "CAI / Correlativos" | "Notas de crédito";

const tabs: Tab[] = ["Resumen", "Facturas", "Pagos", "CAI / Correlativos", "Notas de crédito"];

function money(value: number, currency: "USD" | "HNL" = "HNL") {
  return new Intl.NumberFormat(currency === "HNL" ? "es-HN" : "en-US", {
    style: "currency",
    currency,
  }).format(value || 0);
}

function localIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const todayIso = () => localIso(new Date());
const monthStart = () => `${todayIso().slice(0, 7)}-01`;
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReportesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [tab, setTab] = useState<Tab>("Resumen");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayIso);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/operations", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    setInvoices(data.invoices ?? []);
    setPayments(data.payments ?? []);
    setRanges(data.ranges ?? []);
    setCreditNotes(data.creditNotes ?? []);
    setCompany(data.company ?? null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((failure) => {
        setError(failure instanceof Error ? failure.message : "No se pudieron cargar los reportes.");
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const inPeriod = useCallback(
    (value: string) => localIso(value) >= from && localIso(value) <= to,
    [from, to],
  );

  const normalizedSearch = search.toLowerCase();

  const filtered = useMemo(() => {
    return invoices.filter((invoice) => {
      const searchable = [
        invoice.document_number,
        invoice.customer_name,
        invoice.customer_rtn,
        invoice.unit_label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        inPeriod(invoice.created_at) &&
        searchable.includes(normalizedSearch) &&
        (status === "ALL" || invoice.status === status) &&
        (source === "ALL" || invoice.source === source)
      );
    });
  }, [inPeriod, invoices, normalizedSearch, source, status]);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const searchable = [payment.document_number, payment.customer_name, payment.reference]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return inPeriod(payment.paid_at) && searchable.includes(normalizedSearch);
    });
  }, [inPeriod, normalizedSearch, payments]);

  const filteredNotes = useMemo(() => {
    return creditNotes.filter((note) => {
      const searchable = [note.credit_note_number, note.invoice_number, note.customer_name]
        .join(" ")
        .toLowerCase();

      return inPeriod(note.created_at) && searchable.includes(normalizedSearch);
    });
  }, [creditNotes, inPeriod, normalizedSearch]);

  const metrics = useMemo(() => {
    const valid = filtered.filter((invoice) => invoice.status !== "CANCELLED");

    return {
      subtotal: valid.reduce((sum, invoice) => sum + Number(invoice.subtotal_hnl), 0),
      subtotalUsd: valid.reduce((sum, invoice) => sum + Number(invoice.subtotal_usd), 0),
      tax: valid.reduce((sum, invoice) => sum + Number(invoice.tax_hnl), 0),
      taxUsd: valid.reduce((sum, invoice) => sum + Number(invoice.tax_usd), 0),
      total: valid.reduce((sum, invoice) => sum + Number(invoice.total_hnl), 0),
      totalUsd: valid.reduce((sum, invoice) => sum + Number(invoice.total_usd), 0),
      invoices: filtered.length,
      cancelled: filtered.filter((invoice) => invoice.status === "CANCELLED").length,
      paid: filteredPayments.reduce((sum, payment) => sum + Number(payment.amount_hnl), 0),
      paidUsd: filteredPayments.reduce((sum, payment) => sum + Number(payment.amount_usd), 0),
      sent: filtered.filter((invoice) => invoice.sent_at).length,
      notes: filteredNotes.filter((note) => note.status !== "CANCELLED").length,
    };
  }, [filtered, filteredNotes, filteredPayments]);

  const activeInvoiceRange = ranges.find(
    (range) => range.status === "ACTIVE" && range.document_type === "01",
  );

  const reportQuery = new URLSearchParams({
    from,
    to,
    ...(search ? { search } : {}),
    ...(status !== "ALL" ? { status } : {}),
    ...(source !== "ALL" ? { source } : {}),
  }).toString();

  const resetFilters = () => {
    setFrom(monthStart());
    setTo(todayIso());
    setSearch("");
    setSource("ALL");
    setStatus("ALL");
  };

  const exportCsv = () => {
    const rows: unknown[][] = [
      ["REPORTE CONTABLE CONSOLIDADO"],
      [company?.legal_name ?? "BODEGAS SEGURAS ROATAN", `RTN ${company?.rtn ?? "-"}`],
      [`Período ${from} al ${to}`, "Moneda contable HNL"],
      [],
      [
        "Factura", "Fecha", "Cliente", "RTN", "Bodega", "Origen", "Estado", "CAI",
        "Correlativo", "Moneda original", "Tasa USD/HNL", "Subtotal HNL", "Descuento HNL",
        "ISV HNL", "Total HNL", "Pagado HNL", "Acreditado HNL", "Saldo HNL",
      ],
      ...filtered.map((invoice) => [
        invoice.document_number,
        localIso(invoice.created_at),
        invoice.customer_name,
        invoice.customer_rtn ?? "",
        invoice.unit_label ?? "Global",
        invoice.source,
        invoice.status,
        invoice.cai ?? "",
        invoice.fiscal_correlative ?? "",
        invoice.currency,
        invoice.exchange_rate || "",
        invoice.subtotal_hnl,
        invoice.discount_hnl,
        invoice.tax_hnl,
        invoice.total_hnl,
        invoice.amount_paid_hnl,
        invoice.credited_amount_hnl,
        Math.max(0, invoice.total_hnl - invoice.amount_paid_hnl - invoice.credited_amount_hnl),
      ]),
      [],
      ["RESUMEN HNL"],
      ["Base gravada", metrics.subtotal],
      ["ISV", metrics.tax],
      ["Total facturado", metrics.total],
      ["Pagos registrados", metrics.paid],
    ];

    const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    download(`reporte-contable-${from}-${to}.csv`, `\uFEFF${content}`, "text/csv;charset=utf-8");
  };

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Reportes fiscales y operativos sincronizados con facturas, pagos, CAI, correlativos y notas de crédito."
        actions={
          <>
            <ActionButton variant="secondary" onClick={exportCsv}>Exportar CSV</ActionButton>
            <ActionButton
              onClick={() => window.open(
                `/api/reports/accounting-pdf?${reportQuery}`,
                "_blank",
                "noopener,noreferrer",
              )}
            >
              Imprimir / PDF
            </ActionButton>
          </>
        }
      />

      <div className="space-y-5 p-5">
        {error ? (
          <div className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>
        ) : null}

        <MetricsGrid
          metrics={metrics}
          activeInvoiceRange={activeInvoiceRange}
        />

        <section className="no-print grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-3 xl:grid-cols-6">
          <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <TextInput
            placeholder="Factura, cliente, RTN o bodega"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <SelectInput value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="ALL">Todos los orígenes</option>
            <option value="CASH">Caja</option>
            <option value="SERVICE">Servicios</option>
            <option value="PROFORMA">Proforma convertida</option>
          </SelectInput>
          <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ALL">Todos los estados</option>
            <option value="PENDING_PAYMENT">Pendiente</option>
            <option value="PARTIALLY_PAID">Abonada</option>
            <option value="PAID">Pagada</option>
            <option value="CANCELLED">Anulada</option>
            <option value="CREDITED">Acreditada</option>
          </SelectInput>
          <ActionButton variant="secondary" onClick={resetFilters}>Restablecer</ActionButton>
        </section>

        <div className="no-print flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`rounded-md px-4 py-2 text-sm font-black ${
                tab === item ? "bg-[#004B13] text-white" : "border bg-white text-slate-700"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "Resumen" ? (
          <SummarySection
            from={from}
            to={to}
            range={activeInvoiceRange}
            totalHnl={metrics.total}
            totalUsd={metrics.totalUsd}
          />
        ) : null}

        {tab === "Facturas" ? (
          <DataTable
            empty="No hay facturas en este período."
            headers={["Número", "Fecha", "Cliente", "Origen", "Subtotal HNL", "ISV HNL", "Total HNL", "Estado", "PDF"]}
            rows={filtered.map((invoice) => [
              invoice.document_number,
              new Date(invoice.created_at).toLocaleDateString("es-HN"),
              invoice.customer_name,
              invoice.source,
              money(invoice.subtotal_hnl),
              money(invoice.tax_hnl),
              <DualAmount key={`${invoice.id}-total`} hnl={invoice.total_hnl} usd={invoice.total_usd} />,
              invoice.status,
              <a key={invoice.id} href={`/api/billing/${invoice.id}/pdf`} target="_blank" className="font-black text-emerald-800">Abrir</a>,
            ])}
          />
        ) : null}

        {tab === "Pagos" ? (
          <DataTable
            empty="No hay pagos registrados en este período."
            headers={["Factura", "Fecha", "Cliente", "Método", "Referencia", "Monto HNL"]}
            rows={filteredPayments.map((payment) => [
              payment.document_number,
              new Date(payment.paid_at).toLocaleDateString("es-HN"),
              payment.customer_name,
              payment.method,
              payment.reference ?? "-",
              <DualAmount key={payment.id} hnl={payment.amount_hnl} usd={payment.amount_usd} />,
            ])}
          />
        ) : null}

        {tab === "CAI / Correlativos" ? (
          <DataTable
            empty="No hay rangos CAI."
            headers={["Documento", "CAI", "Rango", "Próximo", "Usados", "Disponibles", "Vence", "Estado"]}
            rows={ranges.map((range) => [
              range.document_type === "03" ? "Nota de crédito" : "Factura",
              range.cai,
              `${range.range_start}–${range.range_end}`,
              range.current_number,
              range.used,
              range.available,
              range.expiration_date,
              <StatusBadge key={range.id} tone={statusTone(range.status)}>{range.status}</StatusBadge>,
            ])}
          />
        ) : null}

        {tab === "Notas de crédito" ? (
          <DataTable
            empty="No hay notas de crédito en este período."
            headers={["Número", "Factura", "Fecha", "Cliente", "Total HNL", "Estado"]}
            rows={filteredNotes.map((note) => [
              note.credit_note_number,
              note.invoice_number,
              new Date(note.created_at).toLocaleDateString("es-HN"),
              note.customer_name,
              <DualAmount key={note.id} hnl={note.total_hnl} usd={note.total_usd} />,
              note.status,
            ])}
          />
        ) : null}
      </div>
    </>
  );
}

function MetricsGrid({
  metrics,
  activeInvoiceRange,
}: {
  metrics: {
    subtotal: number;
    subtotalUsd: number;
    tax: number;
    taxUsd: number;
    total: number;
    totalUsd: number;
    invoices: number;
    cancelled: number;
    paid: number;
    paidUsd: number;
    sent: number;
    notes: number;
  };
  activeInvoiceRange?: Range;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Total facturado" value={money(metrics.total)} hint={`${money(metrics.totalUsd, "USD")} USD · referencia`} />
      <MetricCard label="Base gravada" value={money(metrics.subtotal)} hint={`${money(metrics.subtotalUsd, "USD")} USD · sin ISV`} />
      <MetricCard label="ISV facturado" value={money(metrics.tax)} hint={`${money(metrics.taxUsd, "USD")} USD · referencia`} />
      <MetricCard label="Pagos registrados" value={money(metrics.paid)} hint={`${money(metrics.paidUsd, "USD")} USD · referencia`} />
      <MetricCard label="Facturas" value={String(metrics.invoices)} hint={`${metrics.cancelled} anulada(s)`} />
      <MetricCard label="Correos enviados" value={String(metrics.sent)} hint="Envíos registrados" />
      <MetricCard label="Notas de crédito" value={String(metrics.notes)} hint="Vigentes en el período" />
      <MetricCard label="Correlativos disponibles" value={String(activeInvoiceRange?.available ?? 0)} hint={activeInvoiceRange?.cai ?? "Sin CAI activo"} />
    </div>
  );
}

function SummarySection({
  from,
  to,
  range,
  totalHnl,
  totalUsd,
}: {
  from: string;
  to: string;
  range?: Range;
  totalHnl: number;
  totalUsd: number;
}) {
  const nextCorrelative = range
    ? `${range.establishment}-${range.emission_point}-01-${String(range.current_number).padStart(8, "0")}`
    : "-";

  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="font-black">Resumen fiscal del período</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <p>Período: <strong>{from} al {to}</strong></p>
        <p>CAI factura activo: <strong>{range?.cai ?? "No configurado"}</strong></p>
        <p>Próximo correlativo: <strong>{nextCorrelative}</strong></p>
        <p>
          Facturación neta: <strong>{money(totalHnl)}</strong>
          <span className="ml-2 text-xs text-slate-500">{money(totalUsd, "USD")} USD</span>
        </p>
      </div>
      <p className="mt-4 rounded-md bg-sky-50 p-3 text-xs font-bold text-sky-800">
        Informe contable consolidado en HNL. Los equivalentes USD son informativos y utilizan la tasa almacenada en cada documento.
      </p>
    </section>
  );
}

function DualAmount({ hnl, usd }: { hnl: number; usd: number }) {
  return (
    <span className="font-black">
      {money(hnl)}
      <small className="block font-medium text-slate-500">{money(usd, "USD")} USD</small>
    </span>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (!rows.length) {
    return (
      <section className="rounded-lg border bg-white">
        <div className="p-4"><EmptyState text={empty} /></div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-white">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
