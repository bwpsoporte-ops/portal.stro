import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@/lib/server/db";
import { createBillingDocument } from "@/lib/server/billing";
import { getUsdToHnlRate } from "@/lib/server/exchange-rate";
import { ensureIntegrationSchema } from "./schema";
import {
  fetchStoreganiseInvoice,
  fetchStoreganiseJob,
  fetchStoreganiseUnit,
  fetchStoreganiseUnitRental,
  fetchStoreganiseUser,
} from "./storeganise-api";

export const STOREGANISE_EVENTS = new Set([
  "invoice.created", "invoice.payments.updated", "invoice.state.updated", "invoice.updated", "invoice.deleted",
  "user.disabled", "user.created", "user.updated", "user.billing.updated",
  "job.unit_moveIn.create.started", "job.unit_moveIn.create_started", "job.unit_moveIn.created", "job.unit_moveIn.started",
  "job.unit_moveIn.completed", "job.unit_moveIn.cancelled",
  "job.unit_moveOut.created", "job.unit_moveOut.completed", "job.unit_moveOut.cancelled",
  "job.unit_transfer.completed",
  "unit.updated", "unit.reserved", "unit.occupied", "unit.blocked", "unit.unassigned",
  "unit.unblocked", "unit.archived",
  "unitRental.updated", "unitRental.charges.updated", "unitRental.invoice.created",
]);

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function first(data: JsonObject, ...keys: string[]) {
  for (const key of keys) if (data[key] !== undefined && data[key] !== null) return data[key];
}

function text(value: unknown) {
  return value === undefined || value === null ? null : String(value);
}

function idFrom(data: JsonObject, ...keys: string[]) {
  return text(first(data, ...keys));
}

function nestedId(data: JsonObject, keys: string[]): string | null {
  const queue: unknown[] = [data];
  const visited = new Set<object>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current as object)) continue;
    visited.add(current as object);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const record = current as JsonObject;
    const found = idFrom(record, ...keys);
    if (found) return found;
    queue.push(...Object.values(record));
  }
  return null;
}

function amount(value: unknown) {
  const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  const normalized = raw.includes(".") && raw.includes(",")
    ? raw.replace(/,/g, "")
    : raw.replace(",", ".");
  const parsed = Number(normalized || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amountFromResource(resource: JsonObject) {
  const containers = [
    resource,
    object(resource.summary),
    object(resource.totals),
    object(resource.pricing),
    object(resource.order),
    object(resource.unitRental ?? resource.rental),
    object(resource.unitType),
  ];
  const keys = [
    "grandTotal", "totalAmount", "moveInTotal", "amountDue", "dueNow",
    "total", "amount", "rentalPrice", "monthlyPrice", "price",
  ];
  for (const key of keys) {
    for (const container of containers) {
      const value = amount(container[key]);
      if (value > 0) return value;
    }
  }
  const itemLists = [resource.items, resource.lines, resource.lineItems, resource.charges];
  for (const rawItems of itemLists) {
    if (!Array.isArray(rawItems)) continue;
    const total = rawItems.reduce((sum, rawItem) => {
      const item = object(rawItem);
      const itemTotal = amount(first(item, "total", "totalAmount", "amount"));
      if (itemTotal > 0) return sum + itemTotal;
      const unitPrice = amount(first(item, "unitPrice", "price", "rate"));
      const quantity = Math.max(1, amount(first(item, "quantity", "qty")));
      return sum + unitPrice * quantity;
    }, 0);
    if (total > 0) return roundMoney(total);
  }
  return 0;
}

function currencyFromResource(resource: JsonObject) {
  const containers = [
    resource,
    object(resource.summary),
    object(resource.totals),
    object(resource.pricing),
    object(resource.order),
    object(resource.unitRental ?? resource.rental),
    object(resource.unitType),
  ];
  for (const container of containers) {
    const raw = first(container, "currency", "currencyCode");
    const value = text(first(object(raw), "code")) ?? text(raw);
    if (value) return value.toUpperCase() === "HNL" ? "HNL" : "USD";
  }
  return "USD";
}

function addressText(value: unknown) {
  if (typeof value === "string") return value;
  const address = object(value);
  return text(first(address, "formatted", "address", "address1", "line1", "street"));
}

function snapshot(payload: JsonObject, resource: JsonObject) {
  return { webhook: payload, resource };
}

function normalizedLabel(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fieldText(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(", ") || null;
  if (typeof value === "object") {
    const entry = object(value);
    return fieldText(first(entry, "value", "text", "answer", "label", "name"));
  }
  return String(value);
}

function customFieldMap(data: JsonObject) {
  const result: Record<string, string> = {};
  const details = object(data.details ?? data.profile);
  const sources = [
    data.customFields,
    data.custom_fields,
    data.customFieldValues,
    data.custom_field_values,
    data.fields,
    details.customFields,
    details.custom_fields,
    details.customFieldValues,
  ];
  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const rawEntry of source) {
        const entry = object(rawEntry);
        const definition = object(entry.field ?? entry.customField ?? entry.definition);
        const label = fieldText(first(entry, "label", "name", "title", "key", "code"))
          ?? fieldText(first(definition, "label", "name", "title", "key", "code"));
        const value = fieldText(first(entry, "value", "text", "answer", "values"));
        if (label && value) result[label] = value;
      }
      continue;
    }
    const values = object(source);
    for (const [key, rawValue] of Object.entries(values)) {
      const entry = object(rawValue);
      const definition = object(entry.field ?? entry.customField ?? entry.definition);
      const label = fieldText(first(entry, "label", "name", "title"))
        ?? fieldText(first(definition, "label", "name", "title"))
        ?? key;
      const value = Object.keys(entry).length
        ? fieldText(first(entry, "value", "text", "answer", "values"))
        : fieldText(rawValue);
      if (label && value) result[label] = value;
    }
  }
  return result;
}

function customValue(fields: Record<string, string>, ...aliases: string[]) {
  const wanted = aliases.map(normalizedLabel);
  for (const [label, value] of Object.entries(fields)) {
    if (wanted.includes(normalizedLabel(label))) return value;
  }
  return null;
}

function configuredFieldCode(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

export function parseStoreganiseEvent(payload: JsonObject, rawBody: string) {
  const data = object(payload.data ?? payload.object ?? payload);
  const eventType = text(first(payload, "type", "event", "event_type", "name")) ?? "unknown";
  const eventId = text(first(payload, "id", "eventId", "event_id"))
    ?? createHash("sha256").update(`${eventType}:${rawBody}`).digest("hex");
  return { data, eventType, eventId };
}

export async function processStoreganiseWebhook(payload: JsonObject, rawBody: string) {
  await ensureIntegrationSchema();
  const db = getPool();
  const { data, eventType, eventId } = parseStoreganiseEvent(payload, rawBody);
  const eventRowId = randomUUID();
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO integration_webhook_events
      (id,provider,event_id,event_type,signature_valid,raw_payload)
     VALUES ($1,'STOREGANISE',$2,$3,true,$4::jsonb)
     ON CONFLICT (provider,event_id) DO UPDATE SET
       status='RECEIVED',error_message=NULL,received_at=now(),processed_at=NULL
     WHERE integration_webhook_events.status='FAILED'
     RETURNING id`,
    [eventRowId, eventId, eventType, JSON.stringify(payload)],
  );
  if (!inserted.rowCount) return { eventId, eventType, status: "DUPLICATE" };
  const processingEventId = inserted.rows[0].id;

  try {
    if (!STOREGANISE_EVENTS.has(eventType)) {
      await finishEvent(processingEventId, "IGNORED");
      return { eventId, eventType, status: "IGNORED" };
    }
    const apiUrl = payload.apiUrl;
    if (eventType.startsWith("user.")) {
      const userId = idFrom(data, "userId", "user_id", "id", "_id");
      if (!userId) throw new Error("El webhook de usuario no contiene userId.");
      if (eventType === "user.disabled") {
        const disabled = await db.query(
          `UPDATE integration_customers SET disabled=true,updated_at=now() WHERE storeganise_user_id=$1`,
          [userId],
        );
        if (!disabled.rowCount) {
          await upsertCustomer(eventType, { ...data, userId, disabled: true }, payload);
        }
      } else {
        const user = await fetchStoreganiseUser(userId, apiUrl);
        await upsertCustomer(eventType, { ...data, ...user, userId }, payload);
        const jobId = idFrom(data, "jobId", "job_id");
        if (jobId) {
          const job = await fetchStoreganiseJob(jobId, apiUrl);
          const completeJob = { ...job, jobId, userId };
          const linkedInvoice = await syncJob("job.unit_moveIn.created", completeJob, payload, apiUrl);
          if (!linkedInvoice) await ensurePortalInvoiceFromJob(jobId, completeJob, payload, userId);
        }
      }
    } else if (eventType.startsWith("invoice.")) {
      const invoiceId = idFrom(data, "invoiceId", "invoice_id", "id", "_id");
      if (!invoiceId) throw new Error("El webhook de factura no contiene invoiceId.");
      const invoice = eventType === "invoice.deleted"
        ? { ...data, invoiceId }
        : { ...data, ...await fetchStoreganiseInvoice(invoiceId, apiUrl), invoiceId };
      await syncInvoiceCustomer(invoice, payload, apiUrl);
      await upsertInvoice(eventType, invoice, payload);
      if (eventType !== "invoice.deleted") await ensurePortalInvoice(invoiceId, invoice);
    } else if (eventType.startsWith("unitRental.")) {
      const rentalId = idFrom(data, "unitRentalId", "unit_rental_id", "rentalId", "id", "_id");
      if (!rentalId) throw new Error("El webhook de alquiler no contiene unitRentalId.");
      const rental = { ...data, ...await fetchStoreganiseUnitRental(rentalId, apiUrl), unitRentalId: rentalId };
      await syncRental(eventType, rental, payload, apiUrl);
    } else if (eventType.startsWith("unit.")) {
      const unitId = idFrom(data, "unitId", "unit_id", "id", "_id");
      if (!unitId) throw new Error("El webhook de bodega no contiene unitId.");
      const unit = { ...data, ...await fetchStoreganiseUnit(unitId, apiUrl), unitId };
      await syncUnit(eventType, unit, payload, apiUrl);
    } else if (eventType.startsWith("job.")) {
      const jobId = idFrom(data, "jobId", "job_id", "id", "_id");
      if (!jobId) throw new Error("El webhook de trabajo no contiene jobId.");
      const job = { ...data, ...await fetchStoreganiseJob(jobId, apiUrl), jobId };
      await syncJob(eventType, job, payload, apiUrl);
    }
    await finishEvent(processingEventId, "PROCESSED");
    return { eventId, eventType, status: "PROCESSED" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await db.query(
      `UPDATE integration_webhook_events SET status='FAILED',error_message=$2,processed_at=now() WHERE id=$1`,
      [processingEventId, message],
    );
    throw error;
  }
}

async function finishEvent(id: string, status: string) {
  await getPool().query(
    `UPDATE integration_webhook_events SET status=$2,processed_at=now() WHERE id=$1`,
    [id, status],
  );
}

async function syncInvoiceCustomer(invoice: JsonObject, payload: JsonObject, apiUrl?: unknown) {
  const embedded = object(invoice.user ?? invoice.customer ?? invoice.owner);
  const userId = idFrom(invoice, "userId", "user_id", "customerId", "ownerId")
    ?? idFrom(embedded, "id", "_id", "userId");
  if (!userId) return;
  const completeUser = await fetchStoreganiseUser(userId, apiUrl).catch(() => ({}));
  const user = { ...embedded, ...completeUser, userId };
  await upsertCustomer("user.updated", user, payload);
}

async function upsertCustomer(eventType: string, data: JsonObject, payload: JsonObject) {
  const contact = object(data.contact ?? data.contactDetails ?? data.contact_data);
  const billing = object(data.billing ?? data.billingDetails ?? data.billing_data);
  const billingAddress = object(billing.address ?? billing.billingAddress);
  const customFields = customFieldMap(data);
  const fullName = fieldText(first(data, "fullName", "full_name", "name", "displayName"));
  const nameParts = fullName?.trim().split(/\s+/) ?? [];
  const firstName = text(first(data, "firstName", "first_name", "givenName")) ?? nameParts.shift() ?? null;
  const lastName = text(first(data, "lastName", "last_name", "familyName")) ?? (nameParts.join(" ") || null);
  const companyName = fieldText(first(data, "companyName", "company_name", "businessName", "tradeName"))
    ?? fieldText(first(billing, "companyName", "company_name", "businessName", "tradeName"))
    ?? customValue(
      customFields,
      "Company name", "Company", "Business name", "Trade name", "Nombre comercial",
      configuredFieldCode("STOREGANISE_COMPANY_FIELD_CODE", "company_name"),
    );
  const legalCompanyName = fieldText(first(data, "legalCompanyName", "legal_company_name", "legalName", "companyLegalName"))
    ?? fieldText(first(billing, "legalCompanyName", "legal_company_name", "legalName", "companyLegalName"))
    ?? customValue(
      customFields,
      "Legal Company Name", "Legal name", "Razón social", "Razon social",
      configuredFieldCode("STOREGANISE_LEGAL_COMPANY_FIELD_CODE", "co1"),
    );
  const rtn = fieldText(first(data, "rtn", "taxId", "tax_id", "taxNumber", "tax_number"))
    ?? fieldText(first(billing, "rtn", "taxId", "tax_id", "taxNumber", "tax_number"))
    ?? customValue(
      customFields,
      "RTN", "Tax ID", "Tax number", "Tax identification number",
      configuredFieldCode("STOREGANISE_RTN_FIELD_CODE", "c02"),
    );
  const country = customValue(customFields, "Country", "País", "Pais", "pais")
    ?? fieldText(first(data, "country", "countryName"))
    ?? fieldText(first(billingAddress, "country", "countryName"));
  const storageUse = customValue(
    customFields,
    "Storage use", "Uso del almacenamiento", "Storage usage", "type_of_use", "Type of use",
  );
  const plannedStorage = customValue(
    customFields,
    "What do you plan to store?", "What do you plan to store", "Qué planea almacenar",
    "Que planea almacenar", "items_to_be_stored", "Items to be stored",
  );
  const language = fieldText(first(data, "language", "locale", "languageCode"));
  const ccEmails = fieldText(first(data, "ccEmails", "cc_emails", "emailCc"))
    ?? fieldText(first(contact, "ccEmails", "cc_emails", "emailCc"));
  const userId = idFrom(data, "userId", "user_id", "id", "_id");
  if (!userId) throw new Error("El recurso de usuario no contiene un identificador.");
  await getPool().query(
    `INSERT INTO integration_customers
      (id,storeganise_user_id,email,first_name,last_name,phone,address,city,billing_data,
       company_name,legal_company_name,country,language,cc_emails,storage_use,planned_storage,
       custom_fields,disabled,raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19::jsonb)
     ON CONFLICT (storeganise_user_id) DO UPDATE SET
       email=COALESCE(EXCLUDED.email,integration_customers.email),
       first_name=COALESCE(EXCLUDED.first_name,integration_customers.first_name),
       last_name=COALESCE(EXCLUDED.last_name,integration_customers.last_name),
       phone=COALESCE(EXCLUDED.phone,integration_customers.phone),
       address=COALESCE(EXCLUDED.address,integration_customers.address),
       city=COALESCE(EXCLUDED.city,integration_customers.city),
       billing_data=CASE WHEN EXCLUDED.billing_data='{}'::jsonb THEN integration_customers.billing_data ELSE EXCLUDED.billing_data END,
       company_name=COALESCE(EXCLUDED.company_name,integration_customers.company_name),
       legal_company_name=COALESCE(EXCLUDED.legal_company_name,integration_customers.legal_company_name),
       country=COALESCE(EXCLUDED.country,integration_customers.country),
       language=COALESCE(EXCLUDED.language,integration_customers.language),
       cc_emails=COALESCE(EXCLUDED.cc_emails,integration_customers.cc_emails),
       storage_use=COALESCE(EXCLUDED.storage_use,integration_customers.storage_use),
       planned_storage=COALESCE(EXCLUDED.planned_storage,integration_customers.planned_storage),
       custom_fields=CASE WHEN EXCLUDED.custom_fields='{}'::jsonb THEN integration_customers.custom_fields ELSE EXCLUDED.custom_fields END,
       disabled=EXCLUDED.disabled,raw_payload=EXCLUDED.raw_payload,updated_at=now()`,
    [
      randomUUID(), userId,
      text(first(data, "email")) ?? text(first(contact, "email")),
      firstName,
      lastName,
      text(first(data, "phone", "phoneNumber", "mobile")) ?? text(first(contact, "phone", "phoneNumber", "mobile")),
      addressText(first(data, "address", "address1", "contactAddress")) ?? addressText(billing.address),
      text(first(data, "city")) ?? text(first(billingAddress, "city")),
      JSON.stringify({ ...billing, rtn: rtn ?? first(billing, "rtn") }),
      companyName, legalCompanyName, country, language, ccEmails, storageUse, plannedStorage,
      JSON.stringify(customFields),
      eventType === "user.disabled" || data.disabled === true || data.active === false,
      JSON.stringify(snapshot(payload, data)),
    ],
  );

  await refreshPendingInvoiceCustomer(userId);
}

async function refreshPendingInvoiceCustomer(storeganiseUserId: string) {
  await getPool().query(
    `UPDATE billing_documents AS document
     SET customer_name=COALESCE(NULLIF(TRIM(CONCAT_WS(' ',customer.first_name,customer.last_name)),''),document.customer_name),
         customer_email=COALESCE(customer.email,document.customer_email),
         customer_phone=COALESCE(customer.phone,document.customer_phone),
         customer_rtn=COALESCE(NULLIF(customer.billing_data->>'rtn',''),document.customer_rtn),
         customer_address=COALESCE(customer.address,document.customer_address),
         customer_company_name=COALESCE(customer.company_name,document.customer_company_name),
         customer_legal_name=COALESCE(customer.legal_company_name,document.customer_legal_name),
         customer_country=COALESCE(customer.country,document.customer_country),
         customer_language=COALESCE(customer.language,document.customer_language),
         customer_cc_emails=COALESCE(customer.cc_emails,document.customer_cc_emails),
         customer_storage_use=COALESCE(customer.storage_use,document.customer_storage_use),
         customer_planned_storage=COALESCE(customer.planned_storage,document.customer_planned_storage),
         customer_custom_fields=CASE
           WHEN customer.custom_fields='{}'::jsonb THEN document.customer_custom_fields
           ELSE customer.custom_fields
         END,
         updated_at=now()
     FROM integration_customers AS customer
     WHERE customer.storeganise_user_id=$1
       AND document.customer_id=customer.id
       AND document.document_type='INVOICE'
       AND document.status IN ('PENDING_PAYMENT','PARTIALLY_PAID')
       AND document.sent_at IS NULL`,
    [storeganiseUserId],
  );
}

async function upsertInvoice(eventType: string, data: JsonObject, payload: JsonObject) {
  const invoiceId = idFrom(data, "invoiceId", "invoice_id", "id", "_id");
  if (!invoiceId) throw new Error("El recurso de factura no contiene un identificador.");
  const user = object(data.user ?? data.customer ?? data.owner);
  const userId = idFrom(data, "userId", "user_id", "customerId", "ownerId") ?? idFrom(user, "id", "_id");
  const statusValue = first(data, "state", "status", "paymentState");
  const total = first(data, "amount", "total", "amountDue", "balance", "grandTotal");
  const currencyValue = first(data, "currency", "currencyCode");
  const currency = text(first(object(currencyValue), "code")) ?? text(currencyValue) ?? "USD";
  const originJobId = idFrom(data, "jobId", "job_id")
    ?? nestedId(data, ["jobId", "job_id"]);
  await getPool().query(
    `INSERT INTO integration_invoices
      (id,storeganise_invoice_id,storeganise_user_id,amount,currency,storeganise_status,raw_payload,deleted,origin_job_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$12)
     ON CONFLICT (storeganise_invoice_id) DO UPDATE SET
       storeganise_user_id=COALESCE(EXCLUDED.storeganise_user_id,integration_invoices.storeganise_user_id),
       amount=CASE WHEN $9 THEN EXCLUDED.amount ELSE integration_invoices.amount END,
       currency=CASE WHEN $10 THEN EXCLUDED.currency ELSE integration_invoices.currency END,
       storeganise_status=CASE WHEN $11 THEN EXCLUDED.storeganise_status ELSE integration_invoices.storeganise_status END,
       origin_job_id=COALESCE(EXCLUDED.origin_job_id,integration_invoices.origin_job_id),
       raw_payload=EXCLUDED.raw_payload,deleted=EXCLUDED.deleted,updated_at=now()`,
    [
      randomUUID(), invoiceId, userId, amount(total), currency, text(statusValue) ?? "UNKNOWN",
      JSON.stringify(snapshot(payload, data)), eventType === "invoice.deleted",
      total !== undefined && total !== null, currencyValue !== undefined && currencyValue !== null,
      statusValue !== undefined && statusValue !== null,
      originJobId,
    ],
  );
  await syncUnitFromResource(eventType, data, payload, userId);
}

async function ensurePortalInvoiceFromJob(
  jobId: string,
  job: JsonObject,
  payload: JsonObject,
  fallbackUserId: string,
) {
  const total = amountFromResource(job);
  if (total <= 0) {
    throw new Error(
      `El trabajo ${jobId} fue recibido, pero Storeganise todavía no proporciona un monto facturable. Reprocesa el evento cuando el ingreso esté confirmado.`,
    );
  }
  const embeddedUser = object(job.user ?? job.customer ?? job.owner);
  const userId = idFrom(job, "userId", "user_id", "customerId", "ownerId")
    ?? idFrom(embeddedUser, "id", "_id", "userId")
    ?? fallbackUserId;
  const externalInvoiceId = `JOB:${jobId}`;
  await getPool().query(
    `INSERT INTO integration_invoices
      (id,storeganise_invoice_id,storeganise_user_id,amount,currency,storeganise_status,
       raw_payload,deleted,origin_job_id)
     VALUES ($1,$2,$3,$4,$5,'PENDING_PAYMENT',$6::jsonb,false,$7)
     ON CONFLICT (storeganise_invoice_id) DO UPDATE SET
       storeganise_user_id=EXCLUDED.storeganise_user_id,
       amount=EXCLUDED.amount,currency=EXCLUDED.currency,
       storeganise_status='PENDING_PAYMENT',raw_payload=EXCLUDED.raw_payload,
       deleted=false,origin_job_id=EXCLUDED.origin_job_id,updated_at=now()`,
    [
      randomUUID(), externalInvoiceId, userId, total, currencyFromResource(job),
      JSON.stringify(snapshot(payload, job)), jobId,
    ],
  );
  return ensurePortalInvoice(externalInvoiceId, job);
}

async function syncInvoiceFromResource(
  resource: JsonObject,
  payload: JsonObject,
  apiUrl?: unknown,
) {
  const embeddedInvoice = object(
    resource.invoice
    ?? resource.latestInvoice
    ?? resource.currentInvoice
    ?? resource.unitRentalInvoice,
  );
  const invoiceId = idFrom(resource, "invoiceId", "invoice_id", "storeganiseInvoiceId")
    ?? idFrom(embeddedInvoice, "invoiceId", "invoice_id", "id", "_id")
    ?? nestedId(resource, ["invoiceId", "invoice_id", "storeganiseInvoiceId"]);
  if (!invoiceId) return null;

  const fetchedInvoice = await fetchStoreganiseInvoice(invoiceId, apiUrl);
  const resourceUser = object(resource.user ?? resource.customer ?? resource.owner);
  const userId = idFrom(resource, "userId", "user_id", "customerId", "ownerId")
    ?? idFrom(resourceUser, "id", "_id", "userId")
    ?? nestedId(resource, ["userId", "user_id", "customerId", "ownerId"]);
  const invoice = {
    ...embeddedInvoice,
    ...fetchedInvoice,
    invoiceId,
    ...(userId ? { userId } : {}),
  };
  await syncInvoiceCustomer(invoice, payload, apiUrl);
  await upsertInvoice("invoice.updated", invoice, payload);
  return ensurePortalInvoice(invoiceId, invoice);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function taxInclusiveNet(total: number, taxRate: number) {
  if (taxRate <= 0) return roundMoney(total);
  const targetCents = Math.round(total * 100);
  const estimate = Math.round(targetCents / (1 + taxRate / 100));
  for (let offset = -10; offset <= 10; offset += 1) {
    const netCents = estimate + offset;
    const taxCents = Math.round(netCents * taxRate / 100);
    if (netCents + taxCents === targetCents) return netCents / 100;
  }
  return roundMoney(total / (1 + taxRate / 100));
}

function billingPeriod(data: JsonObject) {
  const raw = text(first(data, "period", "invoiceDate", "date", "createdAt", "created_at", "dueDate"));
  const date = raw ? new Date(raw) : new Date();
  const valid = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat("es-HN", { month: "long", year: "numeric", timeZone: "UTC" }).format(valid);
}

async function ensurePortalInvoice(storeganiseInvoiceId: string, resource: JsonObject) {
  const lockClient = await getPool().connect();
  const note = `Storeganise invoice: ${storeganiseInvoiceId}`;
  try {
    await lockClient.query("BEGIN");
    await lockClient.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [storeganiseInvoiceId]);
    const linked = await lockClient.query<{
      billing_document_id: string | null;
      amount: string;
      currency: string;
      customer_id: string | null;
      unit_id: string | null;
      unit_number: string | null;
      storeganise_user_id: string | null;
      origin_job_id: string | null;
    }>(
      `SELECT i.billing_document_id,i.amount::text,i.currency,i.storeganise_user_id,
              i.origin_job_id,c.id AS customer_id,
              u.id AS unit_id,u.unit_number
       FROM integration_invoices i
       LEFT JOIN integration_customers c ON c.storeganise_user_id=i.storeganise_user_id AND c.disabled=false
       LEFT JOIN LATERAL (
         SELECT id,unit_number FROM customer_units
         WHERE storeganise_user_id=i.storeganise_user_id AND status='ACTIVE'
         ORDER BY updated_at DESC LIMIT 1
       ) u ON true
       WHERE i.storeganise_invoice_id=$1 AND i.deleted=false
       FOR UPDATE OF i`,
      [storeganiseInvoiceId],
    );
    if (!linked.rowCount) throw new Error("La factura sincronizada no está disponible para crear el documento fiscal.");
    const row = linked.rows[0];
    if (row.billing_document_id) {
      await lockClient.query("COMMIT");
      return { id: row.billing_document_id, duplicate: true };
    }

    const jobDocument = await lockClient.query<{ id: string; billing_document_id: string }>(
      `SELECT id,billing_document_id
       FROM integration_invoices
       WHERE storeganise_invoice_id<>$1
         AND billing_document_id IS NOT NULL
         AND storeganise_invoice_id LIKE 'JOB:%'
         AND (
           ($2::text IS NOT NULL AND origin_job_id=$2)
           OR ($3::text IS NOT NULL AND storeganise_user_id=$3 AND created_at>=now()-INTERVAL '2 days')
         )
       ORDER BY created_at DESC LIMIT 1`,
      [storeganiseInvoiceId, row.origin_job_id, row.storeganise_user_id],
    );
    if (jobDocument.rowCount) {
      await lockClient.query(
        `UPDATE integration_invoices SET billing_document_id=$2,updated_at=now() WHERE storeganise_invoice_id=$1`,
        [storeganiseInvoiceId, jobDocument.rows[0].billing_document_id],
      );
      await lockClient.query(
        `UPDATE integration_invoices SET deleted=true,updated_at=now() WHERE id=$1`,
        [jobDocument.rows[0].id],
      );
      await lockClient.query("COMMIT");
      return { id: jobDocument.rows[0].billing_document_id, reconciled: true };
    }

    const recovered = await lockClient.query<{ id: string }>(
      `SELECT id FROM billing_documents WHERE notes=$1 LIMIT 1`, [note],
    );
    if (recovered.rowCount) {
      await lockClient.query(
        `UPDATE integration_invoices SET billing_document_id=$2,updated_at=now() WHERE storeganise_invoice_id=$1`,
        [storeganiseInvoiceId, recovered.rows[0].id],
      );
      await lockClient.query("COMMIT");
      return { id: recovered.rows[0].id, recovered: true };
    }

    if (!row.customer_id) throw new Error("La factura de Storeganise todavía no tiene un cliente sincronizado.");
    const total = amount(row.amount);
    if (total <= 0) throw new Error("El total recibido desde Storeganise debe ser mayor que cero.");
    const configuredTax = Number(process.env.STOREGANISE_TAX_RATE ?? 15);
    const taxRate = Number.isFinite(configuredTax) && configuredTax >= 0 ? configuredTax : 15;
    const net = taxInclusiveNet(total, taxRate);
    const unitLabel = row.unit_number?.trim() || "";
    const period = billingPeriod(resource);
    const description = unitLabel
      ? `Bodega ${unitLabel} · Alquiler por 30 días · ${period}`
      : `Alquiler de bodega · ${period}`;
    const sourceCurrency = row.currency.toUpperCase() === "HNL" ? "HNL" : "USD";
    const exchange = sourceCurrency === "USD" ? await getUsdToHnlRate() : null;
    const equivalentTotal = exchange ? roundMoney(total * exchange.rate) : total;
    const created = await createBillingDocument({
      documentType: "INVOICE",
      source: "CASH",
      customerId: row.customer_id,
      unitId: row.unit_id ?? undefined,
      unitLabel: unitLabel || undefined,
      items: [{
        catalogCode: unitLabel ? "RENTAL_30_DAYS" : "STOREGANISE_RENTAL",
        description,
        quantity: 1,
        unitPrice: net,
        discountPercent: 0,
        taxRate,
      }],
      notes: note,
      status: "PENDING_PAYMENT",
      currency: sourceCurrency,
      exchangeRate: exchange?.rate,
      equivalentCurrency: sourceCurrency === "USD" ? "HNL" : "USD",
      equivalentTotal,
    });
    await lockClient.query(
      `UPDATE integration_invoices SET billing_document_id=$2,updated_at=now() WHERE storeganise_invoice_id=$1`,
      [storeganiseInvoiceId, created.id],
    );
    await lockClient.query("COMMIT");
    return { id: created.id, created: true };
  } catch (error) {
    await lockClient.query("ROLLBACK");
    throw error;
  } finally {
    lockClient.release();
  }
}

async function syncRental(eventType: string, rental: JsonObject, payload: JsonObject, apiUrl?: unknown) {
  const embeddedUser = object(rental.user ?? rental.customer ?? rental.owner);
  const userId = idFrom(rental, "userId", "customerId", "ownerId") ?? idFrom(embeddedUser, "id", "_id");
  if (userId) {
    const user = Object.keys(embeddedUser).length ? { ...embeddedUser, userId } : { ...await fetchStoreganiseUser(userId, apiUrl), userId };
    await upsertCustomer("user.updated", user, payload);
  }
  const embeddedUnit = object(rental.unit);
  const unitId = idFrom(rental, "unitId", "unit_id") ?? idFrom(embeddedUnit, "id", "_id");
  const unit = Object.keys(embeddedUnit).length ? { ...embeddedUnit, unitId } : unitId ? { ...await fetchStoreganiseUnit(unitId, apiUrl), unitId } : {};
  if (Object.keys(unit).length) await upsertCustomerUnit(eventType, unit, payload, userId);
  return syncInvoiceFromResource(rental, payload, apiUrl);
}

async function syncUnit(eventType: string, unit: JsonObject, payload: JsonObject, apiUrl?: unknown) {
  const rental = object(unit.unitRental ?? unit.rental);
  const rentalId = idFrom(unit, "unitRentalId", "rentalId") ?? idFrom(rental, "id", "_id");
  if (rentalId && !Object.keys(rental).length) {
    await syncRental(eventType, { ...await fetchStoreganiseUnitRental(rentalId, apiUrl), unit }, payload, apiUrl);
    return;
  }
  const embeddedUser = object(unit.user ?? unit.customer ?? unit.owner ?? rental.user ?? rental.customer);
  const userId = idFrom(unit, "userId", "customerId", "ownerId") ?? idFrom(rental, "userId", "customerId", "ownerId") ?? idFrom(embeddedUser, "id", "_id");
  if (userId) {
    const user = Object.keys(embeddedUser).length ? { ...embeddedUser, userId } : { ...await fetchStoreganiseUser(userId, apiUrl), userId };
    await upsertCustomer("user.updated", user, payload);
  }
  await upsertCustomerUnit(eventType, unit, payload, userId);
}

async function syncJob(eventType: string, job: JsonObject, payload: JsonObject, apiUrl?: unknown) {
  const rental = object(job.unitRental ?? job.rental);
  const rentalId = idFrom(job, "unitRentalId", "rentalId") ?? idFrom(rental, "id", "_id");
  if (rentalId) {
    const complete = Object.keys(rental).length ? { ...rental, unitRentalId: rentalId } : { ...await fetchStoreganiseUnitRental(rentalId, apiUrl), unitRentalId: rentalId };
    const rentalInvoice = await syncRental(eventType, complete, payload, apiUrl);
    if (rentalInvoice) return rentalInvoice;
    return syncInvoiceFromResource({ ...job, ...complete }, payload, apiUrl);
  }
  await syncUnit(eventType, job, payload, apiUrl);
  const linkedInvoice = await syncInvoiceFromResource(job, payload, apiUrl);
  if (linkedInvoice) return linkedInvoice;
  if (["job.unit_moveIn.created", "job.unit_moveIn.started", "job.unit_moveIn.completed"].includes(eventType)) {
    const jobId = idFrom(job, "jobId", "job_id", "id", "_id");
    const userId = idFrom(job, "userId", "user_id", "customerId", "ownerId")
      ?? nestedId(job, ["userId", "user_id", "customerId", "ownerId"]);
    if (jobId && userId) return ensurePortalInvoiceFromJob(jobId, job, payload, userId);
  }
  return null;
}

async function syncUnitFromResource(eventType: string, data: JsonObject, payload: JsonObject, userId: string | null) {
  const rental = object(data.unitRental ?? data.rental);
  const embeddedUnit = object(data.unit ?? rental.unit);
  const unitId = idFrom(data, "unitId", "unit_id") ?? idFrom(rental, "unitId", "unit_id") ?? idFrom(embeddedUnit, "id", "_id");
  if (!unitId && !Object.keys(embeddedUnit).length) return;
  await upsertCustomerUnit(eventType, { ...embeddedUnit, unitId }, payload, userId);
}

async function upsertCustomerUnit(eventType: string, unit: JsonObject, payload: JsonObject, fallbackUserId: string | null) {
  const rental = object(unit.unitRental ?? unit.rental);
  const embeddedUser = object(unit.user ?? unit.customer ?? unit.owner ?? rental.user ?? rental.customer);
  const userId = idFrom(unit, "userId", "customerId", "ownerId") ?? idFrom(rental, "userId", "customerId", "ownerId") ?? idFrom(embeddedUser, "id", "_id") ?? fallbackUserId;
  const unitId = idFrom(unit, "unitId", "unit_id", "id", "_id");
  const unitNumber = idFrom(unit, "unitNumber", "unitName", "number", "name", "label", "code", "sid");
  if (!userId || (!unitId && !unitNumber)) return;
  const externalUnitId = unitId ?? `${userId}:${unitNumber}`;
  const inactive = eventType === "unit.unassigned"
    || eventType === "unit.archived"
    || eventType === "job.unit_moveOut.completed";
  const status = eventType === "unit.blocked" ? "BLOCKED" : inactive ? "INACTIVE" : "ACTIVE";
  await getPool().query(
    `INSERT INTO customer_units
      (id,storeganise_unit_id,storeganise_user_id,unit_number,map_zone,status,raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (storeganise_unit_id) DO UPDATE SET
       storeganise_user_id=EXCLUDED.storeganise_user_id,unit_number=EXCLUDED.unit_number,
       map_zone=EXCLUDED.map_zone,status=EXCLUDED.status,raw_payload=EXCLUDED.raw_payload,updated_at=now()`,
    [
      randomUUID(), externalUnitId, userId, unitNumber ?? externalUnitId,
      text(first(unit, "zone", "area", "section", "mapZone")), status,
      JSON.stringify(snapshot(payload, unit)),
    ],
  );
}
