import { randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";

type CreditNoteInput = {
  invoiceId?: string;
  amount?: number;
  reasonCode?: string;
  reason?: string;
  resolution?: "ADJUST_BALANCE" | "CUSTOMER_CREDIT" | "BANK_REFUND";
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: number, currency: string) => `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: unknown) => {
  const iso = String(value ?? "").slice(0, 10);
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "-";
};

export async function getCreditNoteData() {
  await ensureIntegrationSchema();
  const db = getPool();
  const [invoices, notes, fiscal] = await Promise.all([
    db.query(
      `SELECT d.id,d.document_number,d.customer_name,d.customer_rtn,d.customer_email,d.currency,
              d.subtotal,d.tax,d.total,d.amount_paid,d.credited_amount,d.status,d.created_at,
              GREATEST(d.total-d.credited_amount,0) AS available_to_credit
       FROM billing_documents d
       WHERE d.document_type='INVOICE' AND d.status<>'CANCELLED'
         AND d.total-d.credited_amount>0
       ORDER BY d.created_at DESC LIMIT 300`,
    ),
    db.query(
      `SELECT cn.* FROM credit_notes cn ORDER BY cn.created_at DESC LIMIT 300`,
    ),
    db.query(
      `SELECT id,cai,range_start,range_end,current_number,expiration_date::text AS expiration_date,
              establishment,emission_point,document_type
       FROM cai_ranges WHERE status='ACTIVE' AND document_type='03'
         AND expiration_date>=current_date AND current_number<=range_end
       ORDER BY created_at DESC LIMIT 1`,
    ),
  ]);
  return { invoices: invoices.rows, notes: notes.rows, fiscal: fiscal.rows[0] ?? null };
}

export async function createCreditNote(input: CreditNoteInput) {
  await ensureIntegrationSchema();
  const invoiceId = String(input.invoiceId ?? "").trim();
  const total = round(Number(input.amount));
  const reasonCode = String(input.reasonCode ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  const resolution = input.resolution ?? "ADJUST_BALANCE";
  if (!invoiceId || !reasonCode || reason.length < 5 || !Number.isFinite(total) || total <= 0) {
    throw new Error("Selecciona la factura y completa monto, motivo y descripción de la nota.");
  }
  if (!["ADJUST_BALANCE", "CUSTOMER_CREDIT", "BANK_REFUND"].includes(resolution)) {
    throw new Error("La resolución seleccionada no es válida.");
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const invoiceResult = await client.query<{
      id: string; document_number: string; customer_name: string; customer_rtn: string | null;
      customer_email: string | null; currency: string; subtotal: string; tax: string; total: string;
      amount_paid: string; credited_amount: string; status: string;
    }>(`SELECT id,document_number,customer_name,customer_rtn,customer_email,currency,subtotal,tax,total,
               amount_paid,credited_amount,status
        FROM billing_documents WHERE id=$1 AND document_type='INVOICE' FOR UPDATE`, [invoiceId]);
    if (!invoiceResult.rowCount) throw new Error("La factura original no existe.");
    const invoice = invoiceResult.rows[0];
    if (invoice.status === "CANCELLED") throw new Error("No se puede acreditar una factura anulada.");
    const available = round(Number(invoice.total) - Number(invoice.credited_amount));
    if (total > available) throw new Error(`La nota supera el monto disponible de ${money(available, invoice.currency)}.`);

    const rangeResult = await client.query<{
      id: string; cai: string; range_start: number; range_end: number; current_number: number;
      expiration_date: string; establishment: string; emission_point: string;
    }>(`SELECT id,cai,range_start,range_end,current_number,expiration_date::text AS expiration_date,
               establishment,emission_point
        FROM cai_ranges WHERE status='ACTIVE' AND document_type='03'
          AND expiration_date>=current_date AND current_number<=range_end
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`);
    if (!rangeResult.rowCount) {
      throw new Error("No existe un CAI activo, vigente y disponible para Nota de crédito (tipo 03). Configúralo en CAI / Correlativos.");
    }
    const range = rangeResult.rows[0];
    const correlative = Number(range.current_number);
    const noteNumber = `${range.establishment}-${range.emission_point}-03-${String(correlative).padStart(8, "0")}`;
    const originalTotal = Number(invoice.total);
    const tax = originalTotal > 0 ? round(total * (Number(invoice.tax) / originalTotal)) : 0;
    const subtotal = round(total - tax);
    const taxRate = subtotal > 0 ? round((tax / subtotal) * 100) : 0;
    const id = randomUUID();
    const fiscalRange = `${range.establishment}-${range.emission_point}-03-${String(range.range_start).padStart(8, "0")} / ${range.establishment}-${range.emission_point}-03-${String(range.range_end).padStart(8, "0")}`;

    await client.query(
      `INSERT INTO credit_notes
       (id,credit_note_number,invoice_id,invoice_number,customer_name,customer_rtn,customer_email,
        currency,reason_code,reason,resolution,subtotal,tax,total,status,cai,fiscal_correlative,
        fiscal_range,fiscal_limit_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'ISSUED',$15,$16,$17,$18)`,
      [id,noteNumber,invoice.id,invoice.document_number,invoice.customer_name,invoice.customer_rtn,
       invoice.customer_email,invoice.currency,reasonCode,reason,resolution,subtotal,tax,total,
       range.cai,correlative,fiscalRange,range.expiration_date],
    );
    await client.query(
      `INSERT INTO credit_note_items (id,credit_note_id,description,subtotal,tax_rate,tax,total)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(),id,`Crédito aplicado a factura ${invoice.document_number}: ${reason}`,subtotal,taxRate,tax,total],
    );
    const nextCredited = round(Number(invoice.credited_amount) + total);
    const effectiveTotal = round(Number(invoice.total) - nextCredited);
    const paid = Number(invoice.amount_paid);
    const status = effectiveTotal <= 0 ? "CREDITED" : paid >= effectiveTotal ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "PENDING_PAYMENT";
    await client.query(`UPDATE billing_documents SET credited_amount=$2,status=$3,updated_at=now() WHERE id=$1`, [invoice.id,nextCredited,status]);
    await client.query(`UPDATE cai_ranges SET current_number=current_number+1,status=CASE WHEN current_number+1>range_end THEN 'EXHAUSTED' ELSE status END,updated_at=now() WHERE id=$1`, [range.id]);
    await client.query(`INSERT INTO credit_note_events (id,credit_note_id,action,notes) VALUES ($1,$2,'ISSUED',$3)`, [randomUUID(),id,reason]);
    await client.query("COMMIT");
    return { id, creditNoteNumber: noteNumber, total, status: "ISSUED" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelCreditNote(id: string, reason: string) {
  await ensureIntegrationSchema();
  if (reason.trim().length < 5) throw new Error("Escribe el motivo de anulación.");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ invoice_id: string; total: string; status: string }>(
      `SELECT invoice_id,total,status FROM credit_notes WHERE id=$1 FOR UPDATE`, [id],
    );
    if (!result.rowCount) throw new Error("Nota de crédito no encontrada.");
    if (result.rows[0].status === "CANCELLED") throw new Error("La nota ya está anulada.");
    const invoiceResult = await client.query<{ total: string; amount_paid: string; credited_amount: string }>(
      `SELECT total,amount_paid,credited_amount FROM billing_documents WHERE id=$1 FOR UPDATE`, [result.rows[0].invoice_id],
    );
    if (!invoiceResult.rowCount) throw new Error("La factura vinculada no existe.");
    const invoice = invoiceResult.rows[0];
    const credited = Math.max(0, round(Number(invoice.credited_amount) - Number(result.rows[0].total)));
    const effectiveTotal = round(Number(invoice.total) - credited);
    const paid = Number(invoice.amount_paid);
    const invoiceStatus = paid >= effectiveTotal ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "PENDING_PAYMENT";
    await client.query(`UPDATE credit_notes SET status='CANCELLED',cancelled_at=now(),cancellation_reason=$2 WHERE id=$1`, [id,reason.trim()]);
    await client.query(`UPDATE billing_documents SET credited_amount=$2,status=$3,updated_at=now() WHERE id=$1`, [result.rows[0].invoice_id,credited,invoiceStatus]);
    await client.query(`INSERT INTO credit_note_events (id,credit_note_id,action,notes) VALUES ($1,$2,'CANCELLED',$3)`, [randomUUID(),id,reason.trim()]);
    await client.query("COMMIT");
    return { status: "CANCELLED" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createCreditNotePdf(id: string) {
  await ensureIntegrationSchema();
  const [noteResult, templateResult] = await Promise.all([
    getPool().query(`SELECT cn.*,COALESCE(json_agg(json_build_object('description',i.description,'subtotal',i.subtotal,'tax_rate',i.tax_rate,'tax',i.tax,'total',i.total)) FILTER (WHERE i.id IS NOT NULL),'[]') AS items FROM credit_notes cn LEFT JOIN credit_note_items i ON i.credit_note_id=cn.id WHERE cn.id=$1 GROUP BY cn.id`, [id]),
    getPool().query(`SELECT legal_name,trade_name,rtn,phone,email,COALESCE(establishment_address,address) AS address,primary_color FROM invoice_templates WHERE is_active=true ORDER BY updated_at DESC LIMIT 1`),
  ]);
  if (!noteResult.rowCount) throw new Error("Nota de crédito no encontrada.");
  const note = noteResult.rows[0];
  const company = templateResult.rows[0] ?? { legal_name: "BODEGAS SEGURAS ROATAN SOCIEDAD DE RESPONSABILIDAD LIMITADA", trade_name: "BODEGAS SEGURAS ROATAN", rtn: "08019024613041", phone: "9872-1324", email: "bdesol@des.hn", address: "Honduras", primary_color: "#004B13" };
  const green = /^#[0-9a-f]{6}$/i.test(company.primary_color) ? company.primary_color : "#004B13";
  const pdf = new PDFDocument({ size: "LETTER", margin: 45, info: { Title: note.credit_note_number } });
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve, reject) => { pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  pdf.rect(0,0,612,9).fill(green);
  pdf.fillColor(green).font("Helvetica-Bold").fontSize(16).text(company.trade_name,45,35,{ width: 320 });
  pdf.fillColor("#334155").fontSize(8).text(company.legal_name,45,58,{ width: 330 });
  pdf.font("Helvetica").text(`RTN: ${company.rtn}  ·  Tel: ${company.phone}  ·  ${company.email}`,45,74,{ width: 330 });
  pdf.text(company.address,45,88,{ width: 330,height: 30,ellipsis: true });
  pdf.roundedRect(395,30,172,100,6).fill(green);
  pdf.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7).text("ORIGINAL: CLIENTE",405,41,{ width: 152,align: "right" });
  pdf.fontSize(15).text("NOTA DE CRÉDITO",405,57,{ width: 152,align: "right" });
  pdf.font("Helvetica").fontSize(7.5).text(`No. ${note.credit_note_number}`,405,82,{ width: 152,align: "right" });
  pdf.text(`Fecha de emisión: ${date(note.created_at)}`,405,99,{ width: 152,align: "right" });
  pdf.text(`Moneda: ${note.currency}`,405,115,{ width: 152,align: "right" });
  if (note.status === "CANCELLED") {
    pdf.save().opacity(0.15).fillColor("#dc2626").font("Helvetica-Bold").fontSize(42).rotate(-25, { origin: [306, 380] }).text("ANULADA",100,350,{ width: 412,align: "center" }).restore();
  }
  pdf.moveTo(45,145).lineTo(567,145).strokeColor(green).stroke();
  pdf.fillColor(green).font("Helvetica-Bold").fontSize(9).text("DATOS DEL CLIENTE",45,162);
  pdf.fillColor("#0f172a").fontSize(10).text(note.customer_name,45,180,{ width: 245 });
  pdf.font("Helvetica").fontSize(8).fillColor("#475569").text(`RTN: ${note.customer_rtn || "-"}`,45,199);
  pdf.text(`Correo: ${note.customer_email || "-"}`,45,214,{ width: 245 });
  pdf.fillColor(green).font("Helvetica-Bold").fontSize(9).text("DATOS FISCALES",310,162,{ width: 257,align: "right" });
  pdf.fillColor("#334155").font("Helvetica").fontSize(7).text(`CAI: ${note.cai}`,310,180,{ width: 257,align: "right" });
  pdf.text(`Rango: ${String(note.fiscal_range).replace(" / ", " al ")}`,310,197,{ width: 257,align: "right" });
  pdf.text(`Fecha límite de emisión: ${date(note.fiscal_limit_date)}`,310,214,{ width: 257,align: "right" });
  pdf.roundedRect(45,245,522,70,5).fill("#eef7f0");
  pdf.fillColor(green).font("Helvetica-Bold").fontSize(8).text("DOCUMENTO AFECTADO",57,257);
  pdf.fillColor("#0f172a").fontSize(11).text(`Factura original: ${note.invoice_number}`,57,274);
  pdf.font("Helvetica").fontSize(8).text(`Motivo: ${note.reason}`,57,293,{ width: 490,height: 18,ellipsis: true });
  pdf.roundedRect(45,337,522,24,4).fill(green);
  pdf.fillColor("#fff").font("Helvetica-Bold").fontSize(7).text("Descripción",53,345,{ width: 300 });
  pdf.text("Base",365,345,{ width: 58,align: "right" }); pdf.text("ISV",427,345,{ width: 55,align: "right" }); pdf.text("Total",486,345,{ width: 72,align: "right" });
  let y=375;
  for (const item of note.items as Array<{description:string;subtotal:string;tax:string;total:string}>) {
    pdf.fillColor("#334155").font("Helvetica").fontSize(7).text(item.description,53,y,{ width: 300,height: 26,ellipsis:true });
    pdf.text(money(Number(item.subtotal),note.currency),365,y,{ width:58,align:"right" }); pdf.text(money(Number(item.tax),note.currency),427,y,{width:55,align:"right"}); pdf.text(money(Number(item.total),note.currency),486,y,{width:72,align:"right"}); y+=34;
  }
  y=Math.max(y+18,440);
  pdf.fillColor(green).font("Helvetica-Bold").fontSize(9).text("RESUMEN DE LA NOTA",330,y,{width:237,align:"right"});
  pdf.fillColor("#334155").font("Helvetica").fontSize(9).text(`Subtotal acreditado: ${money(Number(note.subtotal),note.currency)}`,330,y+23,{width:237,align:"right"});
  pdf.text(`ISV acreditado: ${money(Number(note.tax),note.currency)}`,330,y+42,{width:237,align:"right"});
  pdf.fillColor(green).font("Helvetica-Bold").fontSize(13).text(`TOTAL CRÉDITO: ${money(Number(note.total),note.currency)}`,300,y+68,{width:267,align:"right"});
  const resolutions: Record<string,string> = { ADJUST_BALANCE:"Ajuste al saldo de la factura",CUSTOMER_CREDIT:"Saldo a favor del cliente",BANK_REFUND:"Reembolso bancario" };
  pdf.fillColor("#334155").font("Helvetica").fontSize(8).text(`Aplicación: ${resolutions[note.resolution] ?? note.resolution}`,45,y+107,{width:522});
  pdf.moveTo(45,700).lineTo(567,700).strokeColor("#cbd5e1").stroke();
  pdf.fillColor("#64748b").fontSize(7).text("Original: Cliente · Copia: Obligado Tributario Emisor",45,710,{width:522,align:"center"});
  pdf.text("Documento fiscal vinculado a la factura original indicada.",45,723,{width:522,align:"center"});
  pdf.end();
  return done;
}
