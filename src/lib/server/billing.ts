import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";

type LineInput = {
  catalogCode?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
  taxRate?: number;
};

type DocumentInput = {
  documentType?: "PROFORMA" | "INVOICE";
  source?: "MANUAL" | "CASH" | "PROFORMA" | "SERVICE";
  customerId?: string;
  unitId?: string;
  unitLabel?: string;
  unitAssignments?: Array<{ unitId?: string; unitLabel?: string }>;
  customer?: { name?: string; email?: string; phone?: string; rtn?: string; address?: string };
  items?: LineInput[];
  notes?: string;
  status?: string;
  currency?: "USD" | "HNL";
  exchangeRate?: number;
  equivalentCurrency?: "USD" | "HNL";
  equivalentTotal?: number;
  exemptPurchaseOrder?: string;
  exoneratedRegistryNumber?: string;
  sagRegistryNumber?: string;
  payment?: { amount?: number; method?: "cash" | "transfer" | "card"; reference?: string };
};

type StoredLine = {
  catalogCode?: string;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  discountPercent: string | number;
  taxRate: string | number;
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: string | number;
};

type StoredDocument = {
  id: string;
  document_number: string;
  document_type: "PROFORMA" | "INVOICE";
  source: string;
  customer_id: string | null;
  unit_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_rtn: string | null;
  customer_address: string | null;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  amount_paid: string;
  credited_amount: string;
  status: string;
  cancellation_reason: string | null;
  currency: string;
  exchange_rate: string | null;
  equivalent_currency: string | null;
  equivalent_total: string | null;
  cai: string | null;
  fiscal_range: string | null;
  fiscal_limit_date: string | null;
  notes: string | null;
  converted_invoice_id: string | null;
  created_at: Date | string;
  unit_number: string | null;
  map_zone: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  due_date: string | null;
  exempt_purchase_order: string | null;
  exonerated_registry_number: string | null;
  sag_registry_number: string | null;
  items: StoredLine[];
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const numeric = (value: unknown) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

const formatDocumentDate = (value: Date | string | null, language: "es" | "en") => {
  if (!value) return "-";
  const iso = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split("-");
    return language === "en" ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-HN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
};

const spanishIntegerWords = (value: number): string => {
  const units = ["CERO","UNO","DOS","TRES","CUATRO","CINCO","SEIS","SIETE","OCHO","NUEVE","DIEZ","ONCE","DOCE","TRECE","CATORCE","QUINCE","DIECISÉIS","DIECISIETE","DIECIOCHO","DIECINUEVE","VEINTE","VEINTIUNO","VEINTIDÓS","VEINTITRÉS","VEINTICUATRO","VEINTICINCO","VEINTISÉIS","VEINTISIETE","VEINTIOCHO","VEINTINUEVE"];
  const tens = ["","","VEINTE","TREINTA","CUARENTA","CINCUENTA","SESENTA","SETENTA","OCHENTA","NOVENTA"];
  const hundreds = ["","CIENTO","DOSCIENTOS","TRESCIENTOS","CUATROCIENTOS","QUINIENTOS","SEISCIENTOS","SETECIENTOS","OCHOCIENTOS","NOVECIENTOS"];
  const underThousand = (number: number): string => {
    if (number < 30) return units[number];
    if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? ` Y ${units[number % 10]}` : ""}`;
    if (number === 100) return "CIEN";
    return `${hundreds[Math.floor(number / 100)]}${number % 100 ? ` ${underThousand(number % 100)}` : ""}`;
  };
  const integer = Math.max(0, Math.floor(value));
  if (integer < 1000) return underThousand(integer);
  if (integer < 1_000_000) {
    const thousands = Math.floor(integer / 1000);
    return `${thousands === 1 ? "MIL" : `${underThousand(thousands)} MIL`}${integer % 1000 ? ` ${underThousand(integer % 1000)}` : ""}`;
  }
  const millions = Math.floor(integer / 1_000_000);
  return `${millions === 1 ? "UN MILLÓN" : `${spanishIntegerWords(millions)} MILLONES`}${integer % 1_000_000 ? ` ${spanishIntegerWords(integer % 1_000_000)}` : ""}`;
};

const amountInSpanish = (value: number, currency: "USD" | "HNL") => {
  const rounded = round(value);
  const integer = Math.floor(rounded);
  const cents = Math.round((rounded - integer) * 100);
  const name = currency === "USD" ? "DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA" : "LEMPIRAS";
  return `${spanishIntegerWords(integer)} ${name} CON ${String(cents).padStart(2, "0")}/100`;
};

const fiscalAmount = (value: number) => value.toLocaleString("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export async function getBillingData(type?: string, includeCancelled = false) {
  await ensureIntegrationSchema();
  const db = getPool();
  const validType = type === "PROFORMA" || type === "INVOICE";
  const conditions = validType
    ? `WHERE d.document_type=$1${includeCancelled ? "" : " AND d.status<>'CANCELLED'"}`
    : includeCancelled ? "" : "WHERE d.status<>'CANCELLED'";
  const values = validType ? [type!] : [];
  const [customers, units, documents, catalog, fiscal, occupancies] = await Promise.all([
    db.query(
      `SELECT c.id,c.storeganise_user_id,c.first_name,c.last_name,c.email,c.phone,c.address,
        c.billing_data,count(DISTINCT i.id)::integer AS invoice_count
       FROM integration_customers c
       LEFT JOIN integration_invoices i ON i.storeganise_user_id=c.storeganise_user_id AND i.deleted=false
       WHERE c.disabled=false GROUP BY c.id
       ORDER BY c.first_name NULLS LAST,c.last_name NULLS LAST`,
    ),
    db.query(
      `SELECT u.id,u.storeganise_user_id,u.storeganise_unit_id,u.unit_number,u.map_zone,u.status,u.raw_payload
       FROM customer_units u WHERE u.status='ACTIVE' ORDER BY u.unit_number`,
    ),
    db.query(
      `SELECT d.*,COALESCE(
        (SELECT string_agg(bdu.unit_label,', ' ORDER BY bdu.unit_label) FROM billing_document_units bdu WHERE bdu.document_id=d.id),
        u.unit_number,d.unit_label) AS unit_number,
        COALESCE(json_agg(json_build_object(
          'id',di.id,'catalogCode',di.catalog_code,'description',di.description,
          'quantity',di.quantity,'unitPrice',di.unit_price,
          'discountPercent',di.discount_percent,'taxRate',di.tax_rate,
          'subtotal',di.subtotal,'discount',di.discount,'tax',di.tax,'total',di.total
        ) ORDER BY di.id) FILTER (WHERE di.id IS NOT NULL),'[]') AS items
       FROM billing_documents d
       LEFT JOIN billing_document_items di ON di.document_id=d.id
       LEFT JOIN customer_units u ON u.id=d.unit_id
       ${conditions}
       GROUP BY d.id,u.unit_number ORDER BY d.created_at DESC LIMIT 250`,
      values,
    ),
    db.query(
      `SELECT id,code,name,description,calculation_type,unit
       FROM service_catalog WHERE active=true AND category='BILLABLE' ORDER BY sort_order,name`,
    ),
    db.query(
      `SELECT cai,range_start,range_end,current_number,expiration_date::text AS expiration_date,
              establishment,emission_point,document_type
       FROM cai_ranges WHERE status='ACTIVE' AND expiration_date >= current_date
         AND current_number <= range_end ORDER BY created_at DESC LIMIT 1`,
    ),
    db.query(
      `SELECT id,unit_code,unit_id,customer_id,customer_key,customer_name,customer_email,
              customer_phone,customer_rtn,status,occupied_at,next_due_date::text AS next_due_date,last_invoice_id
       FROM storage_occupancies WHERE status='ACTIVE' ORDER BY unit_code`,
    ),
  ]);
  return { customers: customers.rows, units: units.rows, documents: documents.rows, catalog: catalog.rows, fiscal: fiscal.rows[0] ?? null, occupancies: occupancies.rows };
}

export async function resetTestBilling(confirmText: string) {
  await ensureIntegrationSchema();
  if (confirmText.trim().toUpperCase() !== "REINICIAR PRUEBAS") {
    throw new Error('Escribe exactamente "REINICIAR PRUEBAS" para confirmar.');
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const removed = await client.query<{ id: string; document_type: string }>(
      `SELECT id,document_type FROM billing_documents FOR UPDATE`,
    );
    const documentIds = removed.rows.map((row) => row.id);
    const removedInvoices = removed.rows.filter((row) => row.document_type === "INVOICE").length;
    const removedProformas = removed.rows.filter((row) => row.document_type === "PROFORMA").length;
    await client.query(
      `UPDATE storage_occupancies
       SET status='INACTIVE',last_invoice_id=NULL,updated_at=now()
       WHERE status<>'INACTIVE' OR last_invoice_id IS NOT NULL`,
    );
    if (documentIds.length) {
      await client.query(`DELETE FROM credit_note_events`);
      await client.query(`DELETE FROM credit_notes`);
      await client.query(
        `DELETE FROM billing_document_cancellations WHERE document_id=ANY($1::text[])`,
        [documentIds],
      );
      await client.query(
        `DELETE FROM billing_documents WHERE id=ANY($1::text[])`,
        [documentIds],
      );
    }
    await client.query(
      `UPDATE cai_ranges
       SET current_number=range_start,
           status=(CASE
             WHEN expiration_date < current_date THEN 'EXPIRED'
             WHEN id=(SELECT newer.id FROM cai_ranges newer
                      WHERE newer.document_type=cai_ranges.document_type
                        AND newer.establishment=cai_ranges.establishment
                        AND newer.emission_point=cai_ranges.emission_point
                      ORDER BY newer.created_at DESC LIMIT 1) THEN 'ACTIVE'
             ELSE 'INACTIVE'
           END)::cai_status,
           updated_at=now()`,
    );
    const verification = await client.query<{ documents: string; incorrect_ranges: string; active_occupancies: string }>(
      `SELECT
         (SELECT count(*) FROM billing_documents)::text AS documents,
         (SELECT count(*) FROM cai_ranges WHERE current_number<>range_start)::text AS incorrect_ranges,
         (SELECT count(*) FROM storage_occupancies WHERE status='ACTIVE')::text AS active_occupancies`,
    );
    const check = verification.rows[0];
    if (Number(check.documents) || Number(check.incorrect_ranges) || Number(check.active_occupancies)) {
      throw new Error("El reinicio no pudo dejar la facturación completamente en cero. No se aplicó ningún cambio.");
    }
    await client.query("COMMIT");
    const nextRanges = await client.query<{ cai: string; next_number: number }>(
      `SELECT cai,current_number AS next_number FROM cai_ranges WHERE status='ACTIVE' ORDER BY created_at DESC`,
    );
    return { removedInvoices, removedProformas, releasedUnits: true, nextRanges: nextRanges.rows };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createBillingDocument(input: DocumentInput) {
  await ensureIntegrationSchema();
  if (!["PROFORMA", "INVOICE"].includes(String(input.documentType))) throw new Error("Tipo de documento inválido.");
  if (!input.items?.length) throw new Error("Agrega al menos un producto o servicio.");

  const db = getPool();
  let customer = input.customer;
  if (input.customerId) {
    const result = await db.query<{
      first_name: string | null; last_name: string | null; email: string | null;
      phone: string | null; address: string | null; billing_data: Record<string, unknown>;
    }>(`SELECT first_name,last_name,email,phone,address,billing_data FROM integration_customers WHERE id=$1 AND disabled=false`, [input.customerId]);
    if (!result.rowCount) throw new Error("El cliente no existe.");
    const row = result.rows[0];
    customer = {
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Cliente",
      email: row.email ?? undefined, phone: row.phone ?? undefined, address: row.address ?? undefined,
      rtn: String(row.billing_data?.rtn ?? ""),
    };
  }
  if (!customer?.name?.trim()) throw new Error("Ingresa o selecciona el cliente.");
  const unitAssignments = (input.unitAssignments?.length
    ? input.unitAssignments
    : input.unitId || input.unitLabel
      ? [{ unitId: input.unitId, unitLabel: input.unitLabel }]
      : [])
    .map((entry) => ({ unitId: entry.unitId?.trim() || undefined, unitLabel: entry.unitLabel?.trim() || "" }))
    .filter((entry) => entry.unitLabel);
  if (input.customerId && unitAssignments.some((entry) => !entry.unitId)) {
    throw new Error("Todas las bodegas del cliente deben estar vinculadas al Portal.");
  }
  if (input.customerId && unitAssignments.length) {
    const ids = unitAssignments.map((entry) => entry.unitId!);
    const related = await db.query<{ id: string }>(
      `SELECT u.id FROM customer_units u JOIN integration_customers c
       ON c.storeganise_user_id=u.storeganise_user_id WHERE u.id=ANY($1::text[]) AND c.id=$2`,
      [ids, input.customerId],
    );
    if (related.rowCount !== new Set(ids).size) throw new Error("Una o más bodegas no pertenecen al cliente seleccionado.");
  }

  const hasFiscalExemption = Boolean(
    input.exemptPurchaseOrder?.trim() ||
    input.exoneratedRegistryNumber?.trim() ||
    input.sagRegistryNumber?.trim(),
  );
  const items = input.items.map((line) => {
    const quantity = numeric(line.quantity);
    const unitPrice = numeric(line.unitPrice);
    const discountPercent = numeric(line.discountPercent);
    const taxRate = hasFiscalExemption ? 0 : numeric(line.taxRate);
    if (!line.description?.trim() || quantity <= 0 || unitPrice < 0 || discountPercent < 0 || discountPercent > 100 || taxRate < 0) {
      throw new Error("Revisa descripción, cantidad, precio, descuento e impuesto.");
    }
    const gross = round(quantity * unitPrice);
    const discount = round(gross * discountPercent / 100);
    const subtotal = round(gross - discount);
    const tax = round(subtotal * taxRate / 100);
    return { ...line, quantity, unitPrice, discountPercent, taxRate, subtotal, discount, tax, total: round(subtotal + tax) };
  });
  const subtotal = round(items.reduce((sum, item) => sum + item.subtotal, 0));
  const discount = round(items.reduce((sum, item) => sum + item.discount, 0));
  const tax = round(items.reduce((sum, item) => sum + item.tax, 0));
  const total = round(items.reduce((sum, item) => sum + item.total, 0));
  const id = randomUUID();
  const prefix = input.documentType === "PROFORMA" ? "PRO" : "INV";
  let documentNumber = `${prefix}-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const currency = input.currency === "HNL" ? "HNL" : "USD";
  let fiscal: { cai: string; correlative: number; range: string; limitDate: string } | null = null;
  const status = input.status || (input.documentType === "PROFORMA" ? "DRAFT" : "PENDING_PAYMENT");

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    if (input.documentType === "INVOICE") {
      const cai = await client.query<{
        id: string; cai: string; range_start: number; range_end: number; current_number: number;
        establishment: string; emission_point: string; document_type: string; expiration_date: string;
      }>(
        `SELECT id,cai,range_start,range_end,current_number,establishment,emission_point,document_type,
                expiration_date::text AS expiration_date
         FROM cai_ranges WHERE status::text='ACTIVE' AND expiration_date >= current_date
           AND current_number <= range_end ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      );
      if (!cai.rowCount) {
        throw new Error("No existe un CAI activo, vigente y con correlativos disponibles. Configúralo manualmente en CAI / Correlativos antes de facturar.");
      }
      const range = cai.rows[0];
      const fiscalPrefix = `${range.establishment}-${range.emission_point}-${range.document_type}`;
      documentNumber = `${fiscalPrefix}-${String(range.current_number).padStart(8, "0")}`;
      fiscal = {
        cai: range.cai,
        correlative: range.current_number,
        range: `${fiscalPrefix}-${String(range.range_start).padStart(8, "0")} / ${fiscalPrefix}-${String(range.range_end).padStart(8, "0")}`,
        limitDate: String(range.expiration_date).slice(0, 10),
      };
      if (range.current_number >= range.range_end) {
        await client.query(`UPDATE cai_ranges SET status='EXHAUSTED',updated_at=now() WHERE id=$1`, [range.id]);
      } else {
        await client.query(`UPDATE cai_ranges SET current_number=current_number+1,updated_at=now() WHERE id=$1`, [range.id]);
      }
    }
    await client.query(
      `INSERT INTO billing_documents
       (id,document_number,document_type,source,customer_id,unit_id,unit_label,customer_name,
        customer_email,customer_phone,customer_rtn,customer_address,currency,
        subtotal,discount,tax,total,status,notes,cai,fiscal_correlative,fiscal_range,fiscal_limit_date,
        exchange_rate,equivalent_currency,equivalent_total,
        exempt_purchase_order,exonerated_registry_number,sag_registry_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
      [
        id, documentNumber, input.documentType, input.source ?? "MANUAL",
        input.customerId ?? null, unitAssignments[0]?.unitId ?? null, unitAssignments.map((entry) => entry.unitLabel).join(", ") || null, customer.name.trim(),
        customer.email?.trim() || null, customer.phone?.trim() || null,
        customer.rtn?.trim() || null, customer.address?.trim() || null, currency,
        subtotal, discount, tax, total, status, input.notes?.trim() || null,
        fiscal?.cai ?? null, fiscal?.correlative ?? null, fiscal?.range ?? null, fiscal?.limitDate ?? null,
        numeric(input.exchangeRate) || null,
        input.equivalentCurrency ?? null,
        numeric(input.equivalentTotal) || null,
        input.exemptPurchaseOrder?.trim() || null,
        input.exoneratedRegistryNumber?.trim() || null,
        input.sagRegistryNumber?.trim() || null,
      ],
    );
    for (const assignment of unitAssignments) {
      await client.query(
        `INSERT INTO billing_document_units (document_id,unit_id,unit_label)
         VALUES ($1,$2,$3) ON CONFLICT (document_id,unit_label) DO NOTHING`,
        [id,assignment.unitId ?? null,assignment.unitLabel],
      );
    }
    for (const item of items) {
      await client.query(
        `INSERT INTO billing_document_items
         (id,document_id,catalog_code,description,quantity,unit_price,
          discount_percent,tax_rate,subtotal,discount,tax,total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          randomUUID(), id, item.catalogCode ?? null, item.description!.trim(),
          item.quantity, item.unitPrice, item.discountPercent, item.taxRate,
          item.subtotal, item.discount, item.tax, item.total,
        ],
      );
    }
    const rentalItems = items.filter((item) => item.catalogCode === "RENTAL_30_DAYS" || /alquiler por 30 d[ií]as/i.test(item.description ?? ""));
    if (input.documentType === "INVOICE" && input.source === "CASH" && rentalItems.length) {
      const customerKey = input.customerId
        ? `PORTAL:${input.customerId}`
        : `MANUAL:${(customer.email || customer.name).trim().toLowerCase()}`;
      for (const rentalItem of rentalItems) {
        const unitCode = rentalItem.description?.match(/^Bodega ([^·]+) ·/i)?.[1]?.trim();
        if (!unitCode) throw new Error("Cada alquiler debe identificar su bodega.");
        const assignment = unitAssignments.find((entry) => entry.unitLabel === unitCode);
        const existing = await client.query<{ id: string; customer_key: string; customer_name: string; status: string }>(
          `SELECT id,customer_key,customer_name,status FROM storage_occupancies WHERE unit_code=$1 FOR UPDATE`, [unitCode],
        );
        if (existing.rowCount && existing.rows[0].status === "ACTIVE" && existing.rows[0].customer_key !== customerKey) {
          throw new Error(`La bodega ${unitCode} ya está ocupada por ${existing.rows[0].customer_name}. No puede asignarse a otro cliente.`);
        }
        await client.query(
          `INSERT INTO storage_occupancies
           (id,unit_code,unit_id,customer_id,customer_key,customer_name,customer_email,
            customer_phone,customer_rtn,status,occupied_at,next_due_date,last_invoice_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE',now(),current_date+30,$10)
           ON CONFLICT (unit_code) DO UPDATE SET
            unit_id=COALESCE(EXCLUDED.unit_id,storage_occupancies.unit_id),
            customer_id=EXCLUDED.customer_id,customer_key=EXCLUDED.customer_key,
            customer_name=EXCLUDED.customer_name,customer_email=EXCLUDED.customer_email,
            customer_phone=EXCLUDED.customer_phone,customer_rtn=EXCLUDED.customer_rtn,
            status='ACTIVE',next_due_date=GREATEST(storage_occupancies.next_due_date,current_date)+30,
            last_invoice_id=EXCLUDED.last_invoice_id,updated_at=now()`,
          [randomUUID(),unitCode,assignment?.unitId ?? null,input.customerId ?? null,customerKey,customer.name.trim(),customer.email?.trim() || null,customer.phone?.trim() || null,customer.rtn?.trim() || null,id],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (input.payment) {
    // En una factura recién creada, el servidor es la fuente definitiva del
    // total. Usar el importe recalculado evita diferencias de centavos entre
    // el navegador y el redondeo individual de cargos e impuestos.
    await applyBillingPayment(
      id,
      total,
      input.payment.method ?? "cash",
      input.payment.reference,
    );
  }
  return { id, documentNumber, status, total };
}

export async function updateBillingDocument(id: string, action: string, input: Record<string, unknown>) {
  await ensureIntegrationSchema();
  if (action === "CANCEL") {
    const reason = String(input.reason ?? "").trim();
    const notes = String(input.notes ?? "").trim();
    const cancelledBy = String(input.cancelledBy ?? "Usuario administrativo").trim();
    const releaseUnits = true;
    if (reason.length < 5) throw new Error("Selecciona o escribe un motivo de anulación válido.");
    if (notes.length < 10) throw new Error("Describe la causa de la anulación con al menos 10 caracteres.");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ document_number: string; document_type: string; status: string; amount_paid: string }>(
        `SELECT document_number,document_type,status,amount_paid FROM billing_documents WHERE id=$1 FOR UPDATE`, [id],
      );
      if (!result.rowCount || result.rows[0].document_type !== "INVOICE") throw new Error("Factura fiscal no encontrada.");
      const invoice = result.rows[0];
      if (invoice.status === "CANCELLED") throw new Error("Esta factura ya está anulada.");
      await client.query(
        `INSERT INTO billing_document_cancellations
         (id,document_id,document_number,previous_status,reason,notes,cancelled_by,released_units)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(),id,invoice.document_number,invoice.status,reason,notes || null,cancelledBy || "Usuario administrativo",releaseUnits],
      );
      await client.query(
        `UPDATE billing_documents SET status='CANCELLED',cancellation_reason=$2,cancellation_notes=$3,
         cancelled_by=$4,cancelled_at=now(),updated_at=now() WHERE id=$1`,
        [id,reason,notes || null,cancelledBy || "Usuario administrativo"],
      );
      await client.query(
        `UPDATE storage_occupancies SET status='INACTIVE',updated_at=now()
         WHERE last_invoice_id=$1 AND status='ACTIVE'`, [id],
      );
      await client.query("COMMIT");
      return { status: "CANCELLED", documentNumber: invoice.document_number, releasedUnits: releaseUnits };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  if (action === "MARK_PAID" || action === "MARK_PENDING") {
    const paid = action === "MARK_PAID";
    const result = await getPool().query(
      `UPDATE billing_documents
       SET status=$2,
           amount_paid=CASE WHEN $2='PAID' THEN total ELSE 0 END,
           paid_at=CASE WHEN $2='PAID' THEN now() ELSE NULL END,
           updated_at=now()
       WHERE id=$1 AND document_type='INVOICE' AND status<>'CANCELLED'
       RETURNING status,amount_paid,total,currency`,
      [id, paid ? "PAID" : "PENDING_PAYMENT"],
    );
    if (!result.rowCount) throw new Error("Factura no encontrada.");
    return result.rows[0];
  }
  if (action === "PAY") {
    return applyBillingPayment(
      id,
      numeric(input.amount),
      String(input.method) as "cash" | "transfer" | "card",
      String(input.reference ?? ""),
      String(input.notes ?? ""),
    );
  }
  if (action === "SEND") {
    await sendBillingEmail(id);
    await getPool().query(`UPDATE billing_documents SET status=CASE WHEN document_type='PROFORMA' THEN 'SENT' ELSE status END,sent_at=now(),updated_at=now() WHERE id=$1`, [id]);
    return { sent: true };
  }
  if (action === "CONVERT") {
    const source = await getDocument(id);
    if (source.document_type !== "PROFORMA") throw new Error("Solo una proforma puede convertirse.");
    if (source.converted_invoice_id) return { id: source.converted_invoice_id, duplicate: true };
    const created = await createBillingDocument({
      documentType: "INVOICE", source: "PROFORMA", customerId: source.customer_id ?? undefined,
      unitId: source.unit_id ?? undefined,
      customer: {
        name: source.customer_name, email: source.customer_email ?? undefined,
        phone: source.customer_phone ?? undefined, rtn: source.customer_rtn ?? undefined,
        address: source.customer_address ?? undefined,
      },
      items: source.items.map((item) => ({
        catalogCode: item.catalogCode, description: item.description,
        quantity: Number(item.quantity), unitPrice: Number(item.unitPrice),
        discountPercent: Number(item.discountPercent), taxRate: Number(item.taxRate),
      })),
      notes: source.notes ?? undefined,
      currency: source.currency === "HNL" ? "HNL" : "USD",
    });
    await getPool().query(`UPDATE billing_documents SET status='CONVERTED',converted_invoice_id=$2,updated_at=now() WHERE id=$1`, [id, created.id]);
    return created;
  }
  if (["DRAFT", "SENT", "ACCEPTED", "REJECTED"].includes(action)) {
    await getPool().query(`UPDATE billing_documents SET status=$2,updated_at=now() WHERE id=$1 AND document_type='PROFORMA'`, [id, action]);
    return { status: action };
  }
  throw new Error("Acción no permitida.");
}

async function applyBillingPayment(id: string, amount: number, method: "cash" | "transfer" | "card", reference?: string, notes?: string) {
  if (amount <= 0 || !["cash", "transfer", "card"].includes(method)) throw new Error("Pago o método inválido.");
  if (method !== "cash" && !reference?.trim()) throw new Error("La referencia bancaria es obligatoria para conciliar el pago.");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ total: string; amount_paid: string; credited_amount: string; document_type: string; currency: string; status: string }>(
      `SELECT total,amount_paid,credited_amount,document_type,currency,status FROM billing_documents WHERE id=$1 FOR UPDATE`, [id],
    );
    if (!result.rowCount || result.rows[0].document_type !== "INVOICE") throw new Error("Factura no encontrada.");
    if (result.rows[0].status === "CANCELLED") throw new Error("No se pueden registrar pagos en una factura anulada.");
    const effectiveTotal = round(Number(result.rows[0].total) - Number(result.rows[0].credited_amount));
    const balance = Math.max(0, round(effectiveTotal - Number(result.rows[0].amount_paid)));
    if (amount > balance) {
      const symbol = result.rows[0].currency === "HNL" ? "L " : "$";
      throw new Error(`El pago supera el saldo de ${symbol}${balance.toFixed(2)}.`);
    }
    const paid = round(Number(result.rows[0].amount_paid) + amount);
    const status = paid >= effectiveTotal ? "PAID" : "PARTIALLY_PAID";
    await client.query(`INSERT INTO billing_payments (id,document_id,amount,method,reference,notes) VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), id, amount, method, reference?.trim() || null, notes?.trim() || null]);
    await client.query(`UPDATE billing_documents SET amount_paid=$2,status=$3,paid_at=CASE WHEN $3='PAID' THEN now() ELSE paid_at END,updated_at=now() WHERE id=$1`, [id, paid, status]);
    await client.query("COMMIT");
    return { status, amountPaid: paid, balance: Math.max(0, round(effectiveTotal - paid)) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDocument(id: string) {
  await ensureIntegrationSchema();
  const result = await getPool().query(
    `SELECT d.*,COALESCE(
      (SELECT string_agg(bdu.unit_label,', ' ORDER BY bdu.unit_label) FROM billing_document_units bdu WHERE bdu.document_id=d.id),
      u.unit_number,d.unit_label) AS unit_number,u.map_zone,
      (SELECT bp.method FROM billing_payments bp WHERE bp.document_id=d.id ORDER BY bp.paid_at DESC LIMIT 1) AS payment_method,
      (SELECT bp.reference FROM billing_payments bp WHERE bp.document_id=d.id ORDER BY bp.paid_at DESC LIMIT 1) AS payment_reference,
      (SELECT max(so.next_due_date)::text FROM storage_occupancies so WHERE so.last_invoice_id=d.id) AS due_date,
      COALESCE(json_agg(json_build_object(
        'catalogCode',di.catalog_code,'description',di.description,'quantity',di.quantity,
        'unitPrice',di.unit_price,'discountPercent',di.discount_percent,
        'taxRate',di.tax_rate,'subtotal',di.subtotal,'discount',di.discount,
        'tax',di.tax,'total',di.total
      ) ORDER BY di.id) FILTER (WHERE di.id IS NOT NULL),'[]') AS items
     FROM billing_documents d LEFT JOIN billing_document_items di ON di.document_id=d.id
     LEFT JOIN customer_units u ON u.id=d.unit_id WHERE d.id=$1 GROUP BY d.id,u.unit_number,u.map_zone`,
    [id],
  );
  if (!result.rowCount) throw new Error("Documento no encontrado.");
  return result.rows[0] as StoredDocument;
}

export async function createBillingPdf(id: string, options?: { currency?: "USD" | "HNL"; language?: "es" | "en" }) {
  const document = await getDocument(id);
  const templateResult = await getPool().query<{
    trade_name: string; legal_name: string; rtn: string; address: string;
    head_office_address: string | null; establishment_address: string | null;
    phone: string; email: string; legal_text: string; footer: string;
    logo_url: string | null; primary_color: string; header_design: string;
  }>(`SELECT trade_name,legal_name,rtn,address,head_office_address,establishment_address,phone,email,legal_text,footer,
             logo_url,primary_color,header_design
      FROM invoice_templates WHERE is_active=true ORDER BY updated_at DESC LIMIT 1`);
  const company = templateResult.rows[0] ?? {
    trade_name: "BODEGAS SEGURAS ROATAN",
    legal_name: "BODEGAS SEGURAS ROATAN SOCIEDAD DE RESPONSABILIDAD LIMITADA",
    rtn: "08019024613041",
    address: "República de Colombia, San Carlos, Francisco Morazán, Distrito Central",
    head_office_address: "COLONIA SAN CARLOS AVENIDA REPUBLICA DE COLOMBIA una cuadra atras de la embajada de los estados unidos. FRANCISCO MORAZÁN DISTRITO CENTRAL",
    establishment_address: "COLONIA SAN CARLOS AVENIDA REPUBLICA DE COLOMBIA - REFERENCIA DEL DOMICILIO: una cuadra atras de la embajada de los estados unidos.",
    phone: "9872-1324", email: "bdesol@des.hn",
    legal_text: "La factura es beneficio de todos, exíjala.", footer: "Original: Adquiriente | Copia: Emisor",
    logo_url: null, primary_color: "#004B13", header_design: "moderno",
  };
  const primaryColor = /^#[0-9a-f]{6}$/i.test(company.primary_color) ? company.primary_color : "#004B13";
  // El PDF se presenta principalmente en HNL; la moneda original permanece
  // guardada y USD se muestra únicamente como equivalencia informativa.
  const renderCurrency = "HNL" as const;
  const language = options?.language ?? "es";
  const exchangeRate = Number(document.exchange_rate) || 0;
  const hnlRate = exchangeRate || (document.currency === "USD" && Number(document.equivalent_total)
    ? Number(document.equivalent_total) / Number(document.total)
    : 0);
  const conversion = document.currency === "HNL" ? 1 : hnlRate;
  const converted = (value: string | number) => round(Number(value) * conversion);
  const words = language === "en" ? {
    invoice: "INVOICE", proforma: "PROFORMA", number: "No.", date: "Issue date",
    customer: "CUSTOMER DETAILS", fiscal: "FISCAL DETAILS", unit: "Storage unit",
    globalUnits: "Storage units: detailed global invoice", cai: "CAI", start: "Authorized range start",
    end: "Authorized range end", deadline: "Emission deadline", description: "Description",
    quantity: "Qty.", price: "Unit price", discountColumn: "Discount", taxableBase: "Taxable base", vat: "VAT", total: "Total", subtotal: "Subtotal", discount: "Discount",
    tax: "Tax", paid: "Paid", balance: "Balance", equivalent: "Equivalent", rate: "Applied rate",
  } : {
    invoice: "FACTURA", proforma: "PROFORMA", number: "No.", date: "Fecha de emisión",
    customer: "DATOS DEL CLIENTE", fiscal: "DATOS FISCALES", unit: "Bodega",
    globalUnits: "Bodegas: factura global detallada", cai: "CAI", start: "Rango inicial",
    end: "Rango final", deadline: "Fecha límite de emisión", description: "Descripción",
    quantity: "Cantidad", price: "Precio unitario", discountColumn: "Descuento", taxableBase: "Base gravada", vat: "ISV", total: "Total", subtotal: "Subtotal", discount: "Descuento",
    tax: "ISV", paid: "Total pagado", balance: "Saldo pendiente", equivalent: "Equivalente", rate: "Tasa de cambio",
  };
  const pdf = new PDFDocument({ size: "LETTER", margin: 45, info: { Title: document.document_number, Author: company.legal_name } });
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  const defaultLogo = path.join(process.cwd(), "public", "roatanselfstorage.png");
  let logo: string | Buffer | null = existsSync(defaultLogo) ? defaultLogo : null;
  if (company.logo_url?.startsWith("data:image/")) {
    const encoded = company.logo_url.split(",")[1];
    if (encoded) logo = Buffer.from(encoded, "base64");
  }

  // Encabezado limpio y marca de agua institucional sin marcos laterales.
  pdf.rect(0, 0, 612, 8).fill(primaryColor);
  if (logo) {
    pdf.save();
    pdf.opacity(0.045).image(logo, 151, 270, { fit: [310, 250], align: "center", valign: "center" });
    pdf.restore();
    pdf.image(logo, 45, 32, { fit: [82, 58] });
  }
  const headOfficeAddress = company.head_office_address || company.address;
  const establishmentAddress = company.establishment_address || company.address;
  const formattedPhone = String(company.phone || "-").replace(/^(\d{4})(\d{4})$/, "$1-$2");
  pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(5.5).text(language === "en" ? "Full name or legal name" : "Nombre completo o Razón social", 135, 25, { width: 255 });
  pdf.fillColor("#334155").font("Helvetica-Bold").fontSize(6.5).text(company.legal_name, 135, 34, { width: 255, height: 15, ellipsis: true });
  pdf.fillColor(primaryColor).fontSize(5.5).text(language === "en" ? "Trade name" : "Nombre comercial", 135, 51, { width: 255 });
  pdf.fillColor("#334155").fontSize(6.5).text(company.trade_name, 135, 60, { width: 255, ellipsis: true });
  pdf.fillColor(primaryColor).fontSize(5.5).text("RTN", 135, 74, { width: 85 });
  pdf.text(language === "en" ? "Mobile phone" : "Teléfono móvil", 225, 74, { width: 75 });
  pdf.text("Email", 305, 74, { width: 85 });
  pdf.fillColor("#334155").font("Helvetica").fontSize(6).text(company.rtn || "-", 135, 83, { width: 85 });
  pdf.text(formattedPhone, 225, 83, { width: 75 });
  pdf.text(company.email || "-", 305, 83, { width: 85, ellipsis: true });
  pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(5.5).text(language === "en" ? "Head office address" : "Dirección casa matriz", 135, 96, { width: 255 });
  pdf.fillColor("#334155").font("Helvetica").fontSize(5.4).text(headOfficeAddress, 135, 105, { width: 255, height: 18, lineGap: 0.5, ellipsis: true });
  pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(5.5).text(language === "en" ? "Establishment address" : "Dirección establecimiento", 135, 126, { width: 255 });
  pdf.fillColor("#334155").font("Helvetica").fontSize(5.4).text(establishmentAddress, 135, 135, { width: 255, height: 18, lineGap: 0.5, ellipsis: true });

  pdf.roundedRect(405, 25, 150, 100, 5).fill(primaryColor);
  pdf.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7).text(language === "en" ? "ORIGINAL: CUSTOMER" : "ORIGINAL: CLIENTE", 415, 34, { width: 130, align: "right" });
  pdf.fontSize(16).text(document.document_type === "PROFORMA" ? words.proforma : words.invoice, 415, 48, { width: 130, align: "right" });
  pdf.font("Helvetica").fontSize(7.5).text(`${words.number} ${document.document_number}`, 415, 72, { width: 130, align: "right", ellipsis: true });
  pdf.text(`${words.date}: ${formatDocumentDate(document.created_at, language)}`, 415, 89, { width: 130, align: "right" });
  pdf.text(`${language === "en" ? "Currency" : "Moneda"}: ${renderCurrency}`, 415, 105, { width: 130, align: "right" });
  pdf.moveTo(45, 158).lineTo(567, 158).strokeColor(primaryColor).stroke();

  pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(8).text(words.customer, 45, 171);
  pdf.fillColor("#0f172a").fontSize(10).text(document.customer_name, 45, 187, { width: 245, height: 15, ellipsis: true });
  pdf.font("Helvetica").fontSize(8).fillColor("#475569").text(`RTN: ${document.customer_rtn ?? "-"}`, 45, 205, { width: 245, ellipsis: true });
  pdf.text(`${language === "en" ? "Email" : "Correo"}: ${document.customer_email ?? "-"}`, 45, 220, { width: 245, ellipsis: true });
  pdf.text(`${language === "en" ? "Address" : "Dirección"}: ${document.customer_address ?? "-"}`, 45, 235, { width: 245, height: 28, lineGap: 1, ellipsis: true });

  if (document.document_type === "INVOICE") {
    pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(8).text(words.fiscal, 310, 171, { width: 245, align: "right" });
    pdf.font("Helvetica").fillColor("#334155").fontSize(6.2);
    pdf.text(`${language === "en" ? "Exempt purchase order No." : "No. Orden de compra exenta"}: ${document.exempt_purchase_order || "-"}`, 310, 187, { width: 245, align: "right", ellipsis: true });
    pdf.text(`${language === "en" ? "Exonerated registry certificate No." : "No. Constancia del registro exonerado"}: ${document.exonerated_registry_number || "-"}`, 310, 198, { width: 245, align: "right", ellipsis: true });
    pdf.text(`${language === "en" ? "SAG registry identification No." : "No. Identificativo del registro de la SAG"}: ${document.sag_registry_number || "-"}`, 310, 209, { width: 245, align: "right", ellipsis: true });
    if (document.cai) {
    const [rangeStart, rangeEnd] = String(document.fiscal_range ?? "-").split(" / ");
    pdf.fontSize(7).text(`${words.cai}:`, 310, 222, { width: 245, align: "right" });
    pdf.font("Helvetica-Bold").text(document.cai, 310, 234, { width: 245, align: "right", ellipsis: true });
    pdf.font("Helvetica").text(`${language === "en" ? "Authorized range" : "Rango autorizado"}:`, 310, 246, { width: 245, align: "right" });
    pdf.text(`${rangeStart || "-"} ${language === "en" ? "to" : "al"} ${rangeEnd || rangeStart || "-"}`, 310, 257, { width: 245, align: "right", ellipsis: true });
    pdf.text(`${words.deadline}: ${formatDocumentDate(document.fiscal_limit_date, language)}`, 310, 268, { width: 245, align: "right" });
    }
  } else {
    pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(8).text(language === "en" ? "PROFORMA DETAILS" : "DATOS DE LA PROFORMA", 310, 149, { width: 245, align: "right" });
    pdf.fillColor("#334155").font("Helvetica").fontSize(7).text(language === "en" ? "Non-fiscal quotation. Does not consume CAI or correlative." : "Cotización no fiscal. No consume CAI ni correlativo.", 310, 165, { width: 245, align: "right" });
    pdf.text(document.unit_number ? `${words.unit}: ${document.unit_number}` : words.globalUnits, 310, 184, { width: 245, align: "right" });
  }
  let y = 289;
  pdf.roundedRect(45, y, 522, 24, 4).fill(primaryColor);
  pdf.fillColor("#ffffff").font("Helvetica-Bold").fontSize(5.6);
  pdf.text(words.description, 49, y + 8, { width: 164 });
  pdf.text(words.quantity, 217, y + 8, { width: 40, align: "right" });
  pdf.text(words.price, 261, y + 8, { width: 64, align: "right" });
  pdf.text(words.discountColumn, 329, y + 8, { width: 54, align: "right" });
  pdf.text(words.taxableBase, 387, y + 8, { width: 62, align: "right" });
  pdf.text(words.vat, 453, y + 8, { width: 46, align: "right" });
  pdf.text(words.total, 503, y + 8, { width: 60, align: "right" });
  y += 30;
  let currentUnit = "";
  const pdfItems = [...document.items].sort((left, right) =>
    left.description.localeCompare(right.description, "es", {
      numeric: true,
    }),
  );
  for (const item of pdfItems) {
    if (y > 610) {
      pdf.addPage({ size: "LETTER", margin: 45 });
      pdf.rect(0, 0, 612, 8).fill(primaryColor);
      pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(9).text(`${document.document_number} · ${language === "en" ? "DETAIL CONTINUED" : "CONTINUACIÓN DEL DETALLE"}`, 45, 28, { width: 522, align: "right" });
      y = 52;
      pdf.roundedRect(45, y, 522, 24, 4).fill(primaryColor);
      pdf.fillColor("#ffffff").font("Helvetica-Bold").fontSize(5.6);
      pdf.text(words.description, 49, y + 8, { width: 164 });
      pdf.text(words.quantity, 217, y + 8, { width: 40, align: "right" });
      pdf.text(words.price, 261, y + 8, { width: 64, align: "right" });
      pdf.text(words.discountColumn, 329, y + 8, { width: 54, align: "right" });
      pdf.text(words.taxableBase, 387, y + 8, { width: 62, align: "right" });
      pdf.text(words.vat, 453, y + 8, { width: 46, align: "right" });
      pdf.text(words.total, 503, y + 8, { width: 60, align: "right" });
      y += 30;
      currentUnit = "";
    }
    const serviceMatch = item.description.match(/^Bodega ([^·]+) · (.+)$/);
    const unit = serviceMatch?.[1]?.trim() ?? "";
    const originalDescription = serviceMatch?.[2]?.trim() ?? item.description;
    let description = language === "en"
      ? originalDescription
          .replace("Factura eléctrica", "Electricity bill")
          .replace("Luz individual", "Individual lighting")
          .replace("Otros servicios", "Other services")
          .replace("Otros cargos", "Other charges")
          .replace("Parqueo", "Parking")
          .replace("Alquiler por 30 días", "30-day rental")
      : originalDescription;
    if (item.catalogCode === "RENTAL_30_DAYS" && unit) {
      description = language === "en"
        ? `Storage unit ${unit} rental for 30 days`
        : `Alquiler de unidad de almacenamiento ${unit} por 30 días`;
    }

    if (unit && unit !== currentUnit) {
      currentUnit = unit;
      pdf.fillColor("#e8f5eb").rect(45, y - 4, 522, 20).fill();
      pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(9).text(`${words.unit.toUpperCase()} ${unit}`, 53, y + 1);
      y += 24;
    }

    const itemDiscount = converted(item.discount);
    const itemBase = converted(item.subtotal);
    pdf.fillColor("#334155").font("Helvetica").fontSize(6.5).text(description, 49, y, { width: 164, height: 22, ellipsis: true });
    pdf.text(Number(item.quantity).toFixed(2), 217, y, { width: 40, align: "right" });
    pdf.text(`${renderCurrency} ${fiscalAmount(converted(item.unitPrice))}`, 261, y, { width: 64, align: "right" });
    pdf.text(`${renderCurrency} ${fiscalAmount(itemDiscount)}`, 329, y, { width: 54, align: "right" });
    pdf.text(`${renderCurrency} ${fiscalAmount(itemBase)}`, 387, y, { width: 62, align: "right" });
    pdf.text(`${renderCurrency} ${fiscalAmount(converted(item.tax))}`, 453, y, { width: 46, align: "right" });
    pdf.text(`${renderCurrency} ${fiscalAmount(converted(item.total))}`, 503, y, { width: 60, align: "right" });
    y += 24;
  }
  y += 8;
  if (y > 405) {
    pdf.addPage({ size: "LETTER", margin: 45 });
    pdf.rect(0, 0, 612, 8).fill(primaryColor);
    pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(10).text(
      `${document.document_type === "PROFORMA" ? words.proforma : words.invoice} ${document.document_number}`,
      45, 28, { width: 522, align: "right" },
    );
    y = 55;
  }
  const taxableBase = (rate: number) => converted(document.items
    .filter((item) => Number(item.taxRate) === rate)
    .reduce((sum, item) => sum + Number(item.subtotal), 0));
  const taxAt = (rate: number) => converted(document.items
    .filter((item) => Number(item.taxRate) === rate)
    .reduce((sum, item) => sum + Number(item.tax), 0));
  const exemptAmount = document.exempt_purchase_order ? converted(document.subtotal) : 0;
  const exoneratedAmount = !document.exempt_purchase_order && (document.exonerated_registry_number || document.sag_registry_number)
    ? converted(document.subtotal)
    : 0;
  const fiscalRows: Array<[string, number]> = language === "en" ? [
    ["Exempt amount", exemptAmount], ["Exonerated amount", exoneratedAmount], ["Discounts and rebates", converted(document.discount)],
    ["Taxable subtotal 15%", taxableBase(15)], ["Taxable subtotal 18%", taxableBase(18)],
    ["Subtotal", converted(document.subtotal)], ["VAT 15%", taxAt(15)],
    ["VAT 18%", taxAt(18)],
  ] : [
    ["Importe exento", exemptAmount], ["Importe exonerado", exoneratedAmount], ["Descuentos y rebajas", converted(document.discount)],
    ["Subtotal gravado al 15%", taxableBase(15)], ["Subtotal gravado al 18%", taxableBase(18)],
    ["Subtotal", converted(document.subtotal)], ["ISV 15%", taxAt(15)],
    ["ISV 18%", taxAt(18)],
  ];
  pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(8).text(language === "en" ? "FISCAL SUMMARY" : "RESUMEN FISCAL", 315, y, { width: 240 });
  y += 14;
  for (const [label, value] of fiscalRows) {
    pdf.fillColor("#334155").font("Helvetica").fontSize(7).text(label, 315, y, { width: 145 });
    pdf.font("Helvetica-Bold").text(`${renderCurrency} ${fiscalAmount(value)}`, 460, y, { width: 95, align: "right" });
    y += 9.5;
  }
  pdf.roundedRect(315, y - 3, 240, 20, 3).fill(primaryColor);
  pdf.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text(`TOTAL ${renderCurrency}`, 325, y + 3, { width: 110 });
  pdf.text(`${renderCurrency} ${fiscalAmount(converted(document.total))}`, 435, y + 3, { width: 110, align: "right" });
  y += 24;

  const usdToHnl = hnlRate;
  const totalUsd = document.currency === "USD" ? Number(document.total) : usdToHnl ? Number(document.total) / usdToHnl : 0;
  const totalHnl = document.currency === "HNL" ? Number(document.total) : usdToHnl ? Number(document.total) * usdToHnl : Number(document.equivalent_total) || 0;
  pdf.fillColor("#334155").font("Helvetica-Bold").fontSize(7).text(`${words.rate}:`, 315, y, { width: 100 });
  pdf.font("Helvetica").text(usdToHnl ? `USD 1.00 = L ${usdToHnl.toFixed(4)}` : (language === "en" ? "Not available" : "No disponible"), 415, y, { width: 140, align: "right" });
  y += 12;
  pdf.font("Helvetica-Bold").text(language === "en" ? "TOTAL EQUIVALENT IN USD:" : "TOTAL EQUIVALENTE EN USD:", 315, y, { width: 155 });
  pdf.text(`USD ${fiscalAmount(totalUsd)}`, 470, y, { width: 85, align: "right" });
  y += 16;

  if (language === "es") {
    pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(7).text(`SON: ${amountInSpanish(totalHnl, "HNL")}.`, 45, y, { width: 510, lineGap: 1 });
    y += 18;
    if (totalUsd > 0) {
      pdf.fillColor("#475569").fontSize(6.5).text(`EQUIVALENTE INFORMATIVO: ${amountInSpanish(totalUsd, "USD")}.`, 45, y, { width: 510, lineGap: 1 });
      y += 18;
    }
  }

  const balance = Math.max(0, Number(document.total) - Number(document.credited_amount) - Number(document.amount_paid));
  const methodNames: Record<string, string> = language === "en"
    ? { cash: "Cash", transfer: "Bank transfer", card: "Card" }
    : { cash: "Efectivo", transfer: "Transferencia bancaria", card: "POS bancario (tarjeta)" };
  const paymentMethodName = document.payment_method ? methodNames[document.payment_method] ?? document.payment_method : (language === "en" ? "Pending" : "Pendiente");
  const paymentMethod = document.payment_reference ? `${paymentMethodName} · Ref. ${document.payment_reference}` : paymentMethodName;
  const dueDate = document.due_date
    ? formatDocumentDate(document.due_date, language)
    : formatDocumentDate(new Date(new Date(document.created_at).getTime() + 30 * 86_400_000), language);
  pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(8).text(language === "en" ? "PAYMENT INFORMATION" : "INFORMACIÓN DEL PAGO", 45, y);
  y += 11;
  pdf.fillColor("#334155").font("Helvetica").fontSize(7);
  pdf.text(`${language === "en" ? "Payment terms" : "Condición de pago"}: ${balance > 0 ? (language === "en" ? "Credit" : "Crédito") : (language === "en" ? "Cash" : "Contado")}`, 45, y, { width: 245 });
  pdf.text(`${language === "en" ? "Payment method" : "Método de pago"}: ${paymentMethod}`, 310, y, { width: 245, align: "right" });
  y += 10;
  pdf.text(`${language === "en" ? "Due date" : "Fecha de vencimiento"}: ${dueDate}`, 45, y, { width: 245 });
  pdf.font("Helvetica-Bold").text(`${words.paid}: ${renderCurrency} ${fiscalAmount(converted(document.amount_paid))}`, 310, y, { width: 245, align: "right" });
  if (Number(document.credited_amount) > 0) pdf.font("Helvetica-Bold").text(`${language === "en" ? "Credit notes" : "Notas de crédito"}: ${renderCurrency} ${fiscalAmount(converted(document.credited_amount))}`, 310, y + 11, { width: 245, align: "right" });
  y += Number(document.credited_amount) > 0 ? 22 : 10;
  pdf.font("Helvetica-Bold").text(`${words.balance}: ${renderCurrency} ${fiscalAmount(converted(balance))}`, 310, y, { width: 245, align: "right" });
  if (y > 632) {
    pdf.addPage({ size: "LETTER", margin: 45 });
    pdf.rect(0, 0, 612, 8).fill(primaryColor);
  }
  if (document.status === "CANCELLED") {
    pdf.save();
    pdf.opacity(0.14).fillColor("#dc2626").font("Helvetica-Bold").fontSize(58)
      .rotate(-28, { origin: [306, 410] })
      .text(language === "en" ? "VOID" : "ANULADA", 135, 380, { width: 342, align: "center" });
    pdf.restore();
    pdf.fillColor("#b91c1c").font("Helvetica-Bold").fontSize(8).text(
      `${language === "en" ? "Cancellation reason" : "Motivo de anulación"}: ${document.cancellation_reason ?? "-"}`,
      45, 630, { width: 522, align: "center", ellipsis: true },
    );
  }
  pdf.moveTo(45, 650).lineTo(567, 650).strokeColor("#dbe4de").stroke();
  pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(7.5).text(language === "en" ? "COPY DESTINATION" : "DESTINO DE LOS EJEMPLARES", 45, 660, { width: 522, align: "center" });
  pdf.fillColor("#334155").font("Helvetica").fontSize(7).text(language === "en" ? "Original: Customer" : "Original: Cliente", 45, 674, { width: 522, align: "center" });
  pdf.text(language === "en" ? "Copy: Issuing taxpayer" : "Copia: Obligado Tributario Emisor", 45, 686, { width: 522, align: "center" });
  pdf.text(language === "en" ? "Document issued through a Computerized Billing System - fixed independent SFC self-printer." : "Comprobante emitido mediante Sistema de Facturación Computarizado - Autoimpresor SFC independiente fijo.", 45, 702, { width: 522, align: "center" });
  pdf.fillColor(primaryColor).font("Helvetica-Bold").fontSize(8).text(language === "en" ? "Thank you for choosing Bodegas Seguras Roatan." : company.legal_text || "Gracias por confiar en Bodegas Seguras Roatan.", 45, 722, { width: 522, align: "center" });
  pdf.end();
  return done;
}

async function sendBillingEmail(id: string) {
  const document = await getDocument(id);
  if (!document.customer_email) throw new Error("El cliente no tiene correo.");
  const host = process.env.SMTP_HOST ?? process.env.GMAIL_SMTP_HOST;
  const user = process.env.SMTP_USER ?? process.env.GMAIL_SMTP_USER;
  const pass = process.env.SMTP_PASSWORD ?? process.env.GMAIL_SMTP_APP_PASSWORD;
  const from = process.env.SMTP_FROM ?? process.env.GMAIL_SMTP_FROM ?? user;
  if (!host || !from) throw new Error("SMTP no está configurado.");
  const transport = nodemailer.createTransport({
    host, port: Number(process.env.SMTP_PORT ?? process.env.GMAIL_SMTP_PORT ?? 587),
    secure: (process.env.SMTP_SECURE ?? "false") === "true",
    auth: user ? { user, pass } : undefined,
  });
  const attachments = document.source === "SERVICE" && document.exchange_rate
    ? [
        { filename: `${document.document_number}-USD-es.pdf`, content: await createBillingPdf(id, { currency: "USD", language: "es" }), contentType: "application/pdf" },
        { filename: `${document.document_number}-HNL-es.pdf`, content: await createBillingPdf(id, { currency: "HNL", language: "es" }), contentType: "application/pdf" },
      ]
    : [{ filename: `${document.document_number}.pdf`, content: await createBillingPdf(id), contentType: "application/pdf" }];
  await transport.sendMail({
    from, to: document.customer_email,
    subject: `${document.document_type === "PROFORMA" ? "Proforma" : "Factura"} ${document.document_number}`,
    html: `<p>Hola ${document.customer_name},</p><p>Adjuntamos su ${document.document_type === "PROFORMA" ? "proforma" : "factura"} por <strong>${document.currency} ${Number(document.total).toFixed(2)}</strong>.</p><p>Roatan Self Storage</p>`,
    attachments,
  });
}
