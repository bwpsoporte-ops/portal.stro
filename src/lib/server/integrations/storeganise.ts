import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "./schema";

export const STOREGANISE_EVENTS = new Set([
  "invoice.payments.updated",
  "invoice.state.updated",
  "invoice.updated",
  "invoice.deleted",
  "user.disabled",
  "user.created",
  "user.updated",
  "user.billing.updated",
  "addon.dailyEvent.started",
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

function amount(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
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
  const inserted = await db.query(
    `INSERT INTO integration_webhook_events
      (id, provider, event_id, event_type, signature_valid, raw_payload)
     VALUES ($1, 'STOREGANISE', $2, $3, true, $4::jsonb)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [eventRowId, eventId, eventType, JSON.stringify(payload)],
  );

  if (!inserted.rowCount) return { eventId, eventType, status: "DUPLICATE" };

  try {
    if (!STOREGANISE_EVENTS.has(eventType)) {
      await finishEvent(eventRowId, "IGNORED");
      return { eventId, eventType, status: "IGNORED" };
    }

    if (eventType.startsWith("user.")) await upsertCustomer(eventType, data, payload);
    if (eventType.startsWith("invoice.")) await upsertInvoice(eventType, data, payload);
    await finishEvent(eventRowId, "PROCESSED");
    return { eventId, eventType, status: "PROCESSED" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await db.query(
      `UPDATE integration_webhook_events
       SET status = 'FAILED', error_message = $2, processed_at = now() WHERE id = $1`,
      [eventRowId, message],
    );
    throw error;
  }
}

async function finishEvent(id: string, status: string) {
  await getPool().query(
    `UPDATE integration_webhook_events SET status = $2, processed_at = now() WHERE id = $1`,
    [id, status],
  );
}

async function upsertCustomer(eventType: string, data: JsonObject, payload: JsonObject) {
  const billing = object(data.billing ?? data.billingDetails ?? data.billing_data);
  const userId = text(first(data, "userId", "user_id", "id", "_id"));
  if (!userId) throw new Error("El evento de usuario no contiene un identificador.");

  await getPool().query(
    `INSERT INTO integration_customers
      (id, storeganise_user_id, email, first_name, last_name, phone, address, city,
       billing_data, disabled, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)
     ON CONFLICT (storeganise_user_id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, integration_customers.email),
       first_name = COALESCE(EXCLUDED.first_name, integration_customers.first_name),
       last_name = COALESCE(EXCLUDED.last_name, integration_customers.last_name),
       phone = COALESCE(EXCLUDED.phone, integration_customers.phone),
       address = COALESCE(EXCLUDED.address, integration_customers.address),
       city = COALESCE(EXCLUDED.city, integration_customers.city),
       billing_data = CASE WHEN EXCLUDED.billing_data = '{}'::jsonb
         THEN integration_customers.billing_data ELSE EXCLUDED.billing_data END,
       disabled = EXCLUDED.disabled,
       raw_payload = EXCLUDED.raw_payload,
       updated_at = now()`,
    [
      randomUUID(), userId, text(first(data, "email")),
      text(first(data, "firstName", "first_name")), text(first(data, "lastName", "last_name")),
      text(first(data, "phone", "phoneNumber")), text(first(data, "address", "address1")),
      text(first(data, "city")), JSON.stringify(billing),
      eventType === "user.disabled" || data.disabled === true, JSON.stringify(payload),
    ],
  );
}

async function upsertInvoice(eventType: string, data: JsonObject, payload: JsonObject) {
  const invoiceId = text(first(data, "invoiceId", "invoice_id", "id", "_id"));
  if (!invoiceId) throw new Error("El evento de factura no contiene un identificador.");
  const user = object(data.user ?? data.customer);
  const userId = text(first(data, "userId", "user_id", "customerId")) ?? text(first(user, "id", "_id"));
  const statusValue = first(data, "state", "status");
  const status = text(statusValue) ?? "UNKNOWN";
  const total = first(data, "amount", "total", "amountDue", "balance");
  const currencyValue = first(data, "currency", "currencyCode");
  const currency = text(currencyValue) ?? "HNL";

  await getPool().query(
    `INSERT INTO integration_invoices
      (id, storeganise_invoice_id, storeganise_user_id, amount, currency,
       storeganise_status, raw_payload, deleted)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     ON CONFLICT (storeganise_invoice_id) DO UPDATE SET
       storeganise_user_id = COALESCE(EXCLUDED.storeganise_user_id, integration_invoices.storeganise_user_id),
       amount = CASE WHEN $9 THEN EXCLUDED.amount ELSE integration_invoices.amount END,
       currency = CASE WHEN $10 THEN EXCLUDED.currency ELSE integration_invoices.currency END,
       storeganise_status = CASE WHEN $11 THEN EXCLUDED.storeganise_status ELSE integration_invoices.storeganise_status END,
       raw_payload = EXCLUDED.raw_payload,
       deleted = EXCLUDED.deleted,
       updated_at = now()`,
    [
      randomUUID(), invoiceId, userId, amount(total), currency, status,
      JSON.stringify(payload), eventType === "invoice.deleted",
      total !== undefined && total !== null,
      currencyValue !== undefined && currencyValue !== null,
      statusValue !== undefined && statusValue !== null,
    ],
  );

  const rental = object(data.unitRental ?? data.rental);
  const unit = object(data.unit ?? rental.unit);
  const unitId = text(first(data, "unitId", "unit_id"))
    ?? text(first(rental, "unitId", "unit_id"))
    ?? text(first(unit, "id", "_id"));
  const unitNumber = text(first(data, "unitNumber", "unitName"))
    ?? text(first(rental, "unitNumber", "unitName", "name"))
    ?? text(first(unit, "number", "name", "label"));
  if (userId && (unitId || unitNumber)) {
    const externalUnitId = unitId ?? `${userId}:${unitNumber}`;
    await getPool().query(
      `INSERT INTO customer_units
       (id,storeganise_unit_id,storeganise_user_id,unit_number,map_zone,raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (storeganise_unit_id) DO UPDATE SET
         storeganise_user_id=EXCLUDED.storeganise_user_id,
         unit_number=EXCLUDED.unit_number,map_zone=EXCLUDED.map_zone,
         raw_payload=EXCLUDED.raw_payload,updated_at=now()`,
      [
        randomUUID(), externalUnitId, userId, unitNumber ?? externalUnitId,
        text(first(unit, "zone", "area", "section")), JSON.stringify(unit),
      ],
    );
  }
}
