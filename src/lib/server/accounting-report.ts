import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";
import PDFDocument from "pdfkit";

export type AccountingFilters = { from?: string; to?: string; search?: string; status?: string; source?: string };

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const iso = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) && !value.includes("T")) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

function conversion(currency: string, rateValue: unknown, originalTotal: unknown, equivalentTotal: unknown) {
  const original = number(originalTotal);
  const equivalent = number(equivalentTotal);
  const storedRate = number(rateValue);
  const rate = storedRate > 0 ? storedRate : currency === "USD" && original > 0 && equivalent > 0 ? equivalent / original : 0;
  return {
    rate,
    toHnl: (value: unknown) => round(currency === "HNL" ? number(value) : number(value) * rate),
    toUsd: (value: unknown) => round(currency === "USD" ? number(value) : rate > 0 ? number(value) / rate : 0),
  };
}

export async function getAccountingReport(filters: AccountingFilters = {}) {
  await ensureIntegrationSchema();
  const db = getPool();
  const [invoiceResult, paymentResult, rangeResult, noteResult, companyResult] = await Promise.all([
    db.query(`SELECT d.id,d.document_number,d.source,d.customer_name,d.customer_email,d.customer_rtn,d.unit_label,d.currency,d.exchange_rate,d.equivalent_total,d.subtotal,d.discount,d.tax,d.total,d.amount_paid,d.credited_amount,d.status,d.cai,d.fiscal_correlative,d.sent_at,d.created_at FROM billing_documents d WHERE d.document_type='INVOICE' ORDER BY d.created_at DESC LIMIT 5000`),
    db.query(`SELECT p.id,p.document_id,p.amount,p.method,p.reference,p.notes,p.paid_at,d.document_number,d.customer_name,d.currency,d.exchange_rate,d.total,d.equivalent_total FROM billing_payments p JOIN billing_documents d ON d.id=p.document_id ORDER BY p.paid_at DESC LIMIT 5000`),
    db.query(`SELECT id,cai,range_start,range_end,current_number,expiration_date::text AS expiration_date,authorization_date::text AS authorization_date,status::text AS status,document_type,establishment,emission_point,branch,created_at,GREATEST(range_end-current_number+1,0)::integer AS available,GREATEST(current_number-range_start,0)::integer AS used FROM cai_ranges ORDER BY created_at DESC`),
    db.query(`SELECT id,credit_note_number,invoice_number,customer_name,customer_rtn,customer_email,currency,total,status,created_at FROM credit_notes ORDER BY created_at DESC LIMIT 2000`),
    db.query(`SELECT trade_name,legal_name,rtn,address,head_office_address,establishment_address,phone,email FROM invoice_templates WHERE is_active=true ORDER BY updated_at DESC LIMIT 1`),
  ]);

  const search = (filters.search ?? "").trim().toLowerCase();
  const dateMatch = (value: unknown) => (!filters.from || iso(value) >= filters.from) && (!filters.to || iso(value) <= filters.to);
  const allInvoices = invoiceResult.rows.map((row) => {
    const convert = conversion(row.currency, row.exchange_rate, row.total, row.equivalent_total);
    return {
      ...row,
      exchange_rate: convert.rate,
      subtotal_hnl: convert.toHnl(row.subtotal), discount_hnl: convert.toHnl(row.discount), tax_hnl: convert.toHnl(row.tax), total_hnl: convert.toHnl(row.total), amount_paid_hnl: convert.toHnl(row.amount_paid), credited_amount_hnl: convert.toHnl(row.credited_amount),
      subtotal_usd: convert.toUsd(row.subtotal), discount_usd: convert.toUsd(row.discount), tax_usd: convert.toUsd(row.tax), total_usd: convert.toUsd(row.total), amount_paid_usd: convert.toUsd(row.amount_paid), credited_amount_usd: convert.toUsd(row.credited_amount),
    };
  });
  const invoices = allInvoices.filter((row) => dateMatch(row.created_at)
    && (!search || `${row.document_number} ${row.customer_name} ${row.customer_rtn ?? ""} ${row.unit_label ?? ""}`.toLowerCase().includes(search))
    && (!filters.status || filters.status === "ALL" || row.status === filters.status)
    && (!filters.source || filters.source === "ALL" || row.source === filters.source));

  const payments = paymentResult.rows.map((row) => {
    const convert = conversion(row.currency, row.exchange_rate, row.total, row.equivalent_total);
    return { ...row, exchange_rate: convert.rate, amount_hnl: convert.toHnl(row.amount), amount_usd: convert.toUsd(row.amount) };
  }).filter((row) => {
    const invoice = allInvoices.find((entry) => entry.id === row.document_id);
    return dateMatch(row.paid_at)
      && (!search || `${row.document_number} ${row.customer_name} ${row.reference ?? ""}`.toLowerCase().includes(search))
      && (!filters.status || filters.status === "ALL" || invoice?.status === filters.status)
      && (!filters.source || filters.source === "ALL" || invoice?.source === filters.source);
  });

  const creditNotes = noteResult.rows.map((row) => {
    const invoice = allInvoices.find((entry) => entry.document_number === row.invoice_number);
    const rate = invoice?.exchange_rate || 0;
    const totalHnl = row.currency === "HNL" ? number(row.total) : round(number(row.total) * rate);
    const totalUsd = row.currency === "USD" ? number(row.total) : rate > 0 ? round(number(row.total) / rate) : 0;
    return { ...row, exchange_rate: rate, total_hnl: totalHnl, total_usd: totalUsd };
  }).filter((row) => dateMatch(row.created_at) && (!search || `${row.credit_note_number} ${row.invoice_number} ${row.customer_name}`.toLowerCase().includes(search)));

  const valid = invoices.filter((row) => row.status !== "CANCELLED");
  const metrics = {
    subtotal_hnl: round(valid.reduce((sum, row) => sum + row.subtotal_hnl, 0)),
    discount_hnl: round(valid.reduce((sum, row) => sum + row.discount_hnl, 0)),
    tax_hnl: round(valid.reduce((sum, row) => sum + row.tax_hnl, 0)),
    total_hnl: round(valid.reduce((sum, row) => sum + row.total_hnl, 0)),
    total_usd: round(valid.reduce((sum, row) => sum + row.total_usd, 0)),
    paid_hnl: round(payments.reduce((sum, row) => sum + row.amount_hnl, 0)),
    paid_usd: round(payments.reduce((sum, row) => sum + row.amount_usd, 0)),
    balance_hnl: round(valid.reduce((sum, row) => sum + Math.max(0, row.total_hnl - row.amount_paid_hnl - row.credited_amount_hnl), 0)),
    credit_notes_hnl: round(creditNotes.filter((row) => row.status !== "CANCELLED").reduce((sum, row) => sum + row.total_hnl, 0)),
    invoices: invoices.length, cancelled: invoices.filter((row) => row.status === "CANCELLED").length,
    sent: invoices.filter((row) => row.sent_at).length, notes: creditNotes.filter((row) => row.status !== "CANCELLED").length,
  };
  return { invoices, payments, ranges: rangeResult.rows, creditNotes, metrics, company: companyResult.rows[0] ?? null, generatedAt: new Date().toISOString(), filters };
}

const hnl = (value: number) => `L ${number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function createAccountingReportPdf(filters: AccountingFilters) {
  const report = await getAccountingReport(filters);
  const pdf = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 30, info: { Title: "Reporte contable consolidado", Author: report.company?.legal_name ?? "Roatan Self Storage" } });
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve, reject) => { pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  const blue = "#004B13"; const dark = "#173b24"; const light = "#edf7ef"; const width = 732;
  const period = `${filters.from || "Inicio"} al ${filters.to || "Hoy"}`;
  let y = 30;
  const pageHeader = (continued = false) => {
    pdf.rect(0, 0, 792, 8).fill(blue);
    pdf.fillColor(dark).font("Helvetica-Bold").fontSize(16).text("REPORTE CONTABLE CONSOLIDADO", 30, 25);
    pdf.font("Helvetica").fontSize(7).fillColor("#526575").text(`${report.company?.legal_name ?? "BODEGAS SEGURAS ROATAN"} · RTN ${report.company?.rtn ?? "-"}`, 30, 47);
    pdf.text(`Período: ${period} · Generado: ${new Date(report.generatedAt).toLocaleString("es-HN")} · Moneda contable: HNL${continued ? " · CONTINUACIÓN" : ""}`, 30, 58);
    pdf.font("Helvetica-Bold").fillColor(blue).text("INFORME ADMINISTRATIVO / NO ES DOCUMENTO FISCAL", 500, 28, { width: 262, align: "right" });
    y = 76;
  };
  const newPage = () => { pdf.addPage({ size: "LETTER", layout: "landscape", margin: 30 }); pageHeader(true); };
  const ensure = (height: number) => { if (y + height > 570) newPage(); };
  const section = (title: string) => { ensure(30); pdf.rect(30, y, width, 20).fill(dark); pdf.fillColor("#fff").font("Helvetica-Bold").fontSize(8).text(title, 38, y + 6); y += 25; };
  const metric = (x: number, label: string, value: string, secondary?: string) => {
    pdf.roundedRect(x, y, 138, 45, 3).fill(light);
    pdf.fillColor("#526575").font("Helvetica-Bold").fontSize(6).text(label.toUpperCase(), x + 8, y + 8, { width: 122 });
    pdf.fillColor(dark).fontSize(11).text(value, x + 8, y + 19, { width: 122 });
    if (secondary) pdf.fillColor("#647887").font("Helvetica").fontSize(5.5).text(secondary, x + 8, y + 34, { width: 122 });
  };
  pageHeader();
  metric(30, "Total facturado", hnl(report.metrics.total_hnl));
  metric(178, "Base gravada", hnl(report.metrics.subtotal_hnl));
  metric(326, "ISV", hnl(report.metrics.tax_hnl));
  metric(474, "Pagos recibidos", hnl(report.metrics.paid_hnl));
  metric(622, "Saldo pendiente", hnl(report.metrics.balance_hnl));
  y += 57;
  section("CONTROL GENERAL");
  pdf.fillColor(dark).font("Helvetica").fontSize(7).text(`Facturas: ${report.metrics.invoices}     Anuladas: ${report.metrics.cancelled}     Correos enviados: ${report.metrics.sent}     Notas de crédito: ${report.metrics.notes}     Total notas de crédito: ${hnl(report.metrics.credit_notes_hnl)}`, 38, y + 2);
  y += 22;
  section("DETALLE DE FACTURAS EMITIDAS");
  const invoiceHeader = () => {
    pdf.rect(30, y, width, 18).fill(light); pdf.fillColor(dark).font("Helvetica-Bold").fontSize(5.5);
    [["Documento",32,78],["Fecha",112,45],["Cliente / RTN",159,132],["Bodega",293,45],["Origen",340,48],["Moneda",390,38],["Tasa",430,42],["Subtotal HNL",474,67],["ISV HNL",543,57],["Total HNL",602,67],["Estado",671,88]].forEach(([label,x,w]) => pdf.text(String(label), Number(x), y + 6, { width: Number(w) })); y += 20;
  };
  invoiceHeader();
  for (const row of report.invoices) {
    ensure(24); if (y === 76) { section("DETALLE DE FACTURAS EMITIDAS · CONTINUACIÓN"); invoiceHeader(); }
    pdf.fillColor("#334155").font("Helvetica").fontSize(5.5);
    const cells: Array<[string,number,number,string?]> = [
      [row.document_number,32,78],[iso(row.created_at),112,45],[`${row.customer_name}\nRTN: ${row.customer_rtn || "-"}`,159,132],[row.unit_label || "Global",293,45],[row.source,340,48],[row.currency,390,38],[row.exchange_rate ? Number(row.exchange_rate).toFixed(4) : "-",430,42],[hnl(row.subtotal_hnl),474,67,"right"],[hnl(row.tax_hnl),543,57,"right"],[hnl(row.total_hnl),602,67,"right"],[row.status,671,88],
    ];
    cells.forEach(([value,x,w,align]) => pdf.text(value, x, y + 3, { width: w, height: 18, ellipsis: true, align: align as "right" | undefined }));
    pdf.moveTo(30, y + 22).lineTo(762, y + 22).strokeColor("#d9e2e8").stroke(); y += 24;
  }
  section("PAGOS REGISTRADOS");
  pdf.fillColor(dark).font("Helvetica-Bold").fontSize(6).text("Documento", 34, y).text("Fecha", 130, y).text("Cliente", 190, y).text("Método / Referencia", 390, y).text("Monto HNL", 650, y, { width: 105, align: "right" }); y += 14;
  for (const row of report.payments) { ensure(17); pdf.fillColor("#334155").font("Helvetica").fontSize(5.8).text(row.document_number,34,y).text(iso(row.paid_at),130,y).text(row.customer_name,190,y,{width:190,ellipsis:true}).text(`${row.method}${row.reference ? ` · ${row.reference}` : ""}`,390,y,{width:240,ellipsis:true}).text(hnl(row.amount_hnl),650,y,{width:105,align:"right"}); y += 15; }
  section("CONTROL CAI Y CORRELATIVOS");
  for (const row of report.ranges) { ensure(16); pdf.fillColor("#334155").font("Helvetica").fontSize(6).text(`Tipo ${row.document_type} · CAI ${row.cai} · Rango ${row.range_start}-${row.range_end} · Próximo ${row.current_number} · Usados ${row.used} · Disponibles ${row.available} · Vence ${row.expiration_date} · ${row.status}`,38,y,{width:716}); y += 14; }
  section("CERTIFICACIÓN DEL REPORTE");
  pdf.fillColor("#526575").font("Helvetica").fontSize(6.5).text("Reporte administrativo generado desde los documentos registrados en el portal. Todos los importes contables de este informe se presentan en HNL y utilizan la tasa almacenada en cada documento. Este informe no sustituye los comprobantes fiscales individuales.",38,y,{width:716,lineGap:2});
  pdf.end();
  return done;
}
