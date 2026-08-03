import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";

type CreateChargeInput = {
  customerId?: string;
  unitId?: string;
  manualCustomer?: { name?: string; email?: string; phone?: string };
  manualUnitNumber?: string;
  serviceId?: string;
  items?: Array<{
    serviceId?: string;
    chargeType?: string;
    description?: string;
    consumptionKwh?: number;
    quantity?: number;
    unitCost?: number;
    marginPercent?: number;
  }>;
  billingPeriod?: string;
  previousReading?: number | null;
  currentReading?: number | null;
  quantity?: number;
  unitCost?: number;
  marginPercent?: number;
  taxRate?: number;
  notes?: string;
};

const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function getServiceModuleData() {
  await ensureIntegrationSchema();
  const db = getPool();
  const [customers, units, services, charges, occupancies] = await Promise.all([
    db.query(
      `SELECT c.id,c.storeganise_user_id,c.email,c.first_name,c.last_name,c.phone,
        count(DISTINCT i.id)::integer AS invoice_count
       FROM integration_customers c
       JOIN integration_invoices i
         ON i.storeganise_user_id=c.storeganise_user_id AND i.deleted=false
       WHERE c.disabled=false
       GROUP BY c.id
       ORDER BY count(i.id) DESC,c.first_name NULLS LAST,c.last_name NULLS LAST,c.email`,
    ),
    db.query(
      `SELECT id,storeganise_user_id,storeganise_unit_id,unit_number,map_zone,status
       FROM customer_units WHERE status='ACTIVE' ORDER BY unit_number`,
    ),
    db.query(
      `SELECT id,code,name,description,category,calculation_type,unit,active
       FROM service_catalog WHERE active=true ORDER BY sort_order,name`,
    ),
    db.query(
      `SELECT sc.id,sc.charge_number,sc.billing_period,sc.quantity,sc.unit_cost,
        sc.margin_percent,sc.unit_price,sc.subtotal,sc.tax,sc.total,
        sc.estimated_cost,sc.estimated_profit,sc.status,sc.amount_paid,sc.paid_at,
        sc.previous_reading,sc.current_reading,sc.tax_rate,sc.notes,sc.created_at,
        c.first_name,c.last_name,c.email,c.phone,c.storeganise_user_id,
        s.name AS service_name,s.unit,u.unit_number,u.map_zone,
        COALESCE((SELECT json_agg(json_build_object(
          'id',sci.id,'serviceId',sci.service_id,'chargeType',sci.charge_type,
          'description',sci.description,'quantity',sci.quantity,'unit',sci.unit,
          'unitPrice',sci.unit_price,'subtotal',sci.subtotal
        ) ORDER BY sci.created_at) FROM service_charge_items sci
        WHERE sci.service_charge_id=sc.id),'[]') AS items
       FROM service_charges sc
       JOIN integration_customers c ON c.id=sc.customer_id
       JOIN service_catalog s ON s.id=sc.service_id
       LEFT JOIN customer_units u ON u.id=sc.unit_id
      ORDER BY sc.created_at DESC LIMIT 100`,
    ),
    db.query(
      `SELECT id,unit_code,unit_id,customer_id,customer_key,customer_name,customer_email,
              customer_phone,customer_rtn,status,occupied_at,next_due_date::text AS next_due_date,last_invoice_id
       FROM storage_occupancies WHERE status='ACTIVE' ORDER BY unit_code`,
    ),
  ]);
  return { customers: customers.rows, units: units.rows, services: services.rows, charges: charges.rows, occupancies: occupancies.rows };
}

export async function registerServicePayment(input: {
  chargeId?: string;
  type?: "paid" | "partial";
  amount?: number;
  method?: "cash" | "transfer" | "card";
  reference?: string;
  notes?: string;
}) {
  await ensureIntegrationSchema();
  if (!input.chargeId || !["paid", "partial"].includes(String(input.type))) {
    throw new Error("Selecciona el cobro y el tipo de pago.");
  }
  if (!["cash", "transfer", "card"].includes(String(input.method))) {
    throw new Error("Selecciona un método de pago válido.");
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ total: string; amount_paid: string; status: string }>(
      `SELECT total,amount_paid,status FROM service_charges WHERE id=$1 FOR UPDATE`,
      [input.chargeId],
    );
    if (!result.rowCount) throw new Error("El cobro no existe.");
    const charge = result.rows[0];
    const balance = round(Number(charge.total) - Number(charge.amount_paid));
    if (balance <= 0 || charge.status === "PAID") throw new Error("Este cobro ya está pagado.");

    const paymentAmount = input.type === "paid" ? balance : round(number(input.amount));
    if (paymentAmount <= 0) throw new Error("El abono debe ser mayor que cero.");
    if (paymentAmount > balance) throw new Error(`El abono no puede superar el saldo de ${balance.toFixed(2)}.`);
    const newPaid = round(Number(charge.amount_paid) + paymentAmount);
    const newBalance = round(Number(charge.total) - newPaid);
    const status = newBalance <= 0 ? "PAID" : "PARTIALLY_PAID";

    await client.query(
      `INSERT INTO service_charge_payments
       (id,service_charge_id,amount,method,reference,notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(), input.chargeId, paymentAmount, input.method,
        input.reference?.trim() || null, input.notes?.trim() || null,
      ],
    );
    await client.query(
      `UPDATE service_charges SET amount_paid=$2,status=$3,
       paid_at=CASE WHEN $3='PAID' THEN now() ELSE paid_at END,updated_at=now()
       WHERE id=$1`,
      [input.chargeId, newPaid, status],
    );
    await client.query("COMMIT");
    return { status, amountPaid: newPaid, balance: newBalance, paymentAmount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createServiceCharge(input: CreateChargeInput) {
  await ensureIntegrationSchema();
  if ((!input.customerId && !input.manualCustomer?.name?.trim()) || (!input.unitId && !input.manualUnitNumber) || !input.billingPeriod || !input.items?.length) {
    throw new Error("Selecciona cliente, bodega, período y al menos un servicio.");
  }

  const db = getPool();
  let customerId = input.customerId;
  let unitId = input.unitId;
  if (!customerId) {
    const name = input.manualCustomer!.name!.trim();
    const email = input.manualCustomer?.email?.trim().toLowerCase() || null;
    const existing = email ? await db.query<{ id: string; storeganise_user_id: string }>(`SELECT id,storeganise_user_id FROM integration_customers WHERE lower(email)=$1 LIMIT 1`, [email]) : { rowCount: 0, rows: [] };
    if (existing.rowCount) {
      customerId = existing.rows[0].id;
    } else {
      const id = randomUUID(); const parts = name.split(/\s+/);
      await db.query(`INSERT INTO integration_customers (id,storeganise_user_id,email,first_name,last_name,phone,raw_payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [id,`MANUAL-${id}`,email,parts.shift(),parts.join(" ") || null,input.manualCustomer?.phone?.trim() || null,JSON.stringify({ source: "SERVICE_TEST" })]);
      customerId = id;
    }
  }
  const customerResult = await db.query<{ storeganise_user_id: string }>(`SELECT storeganise_user_id FROM integration_customers WHERE id=$1`, [customerId]);
  if (!customerResult.rowCount) throw new Error("Cliente no disponible.");
  if (!unitId) {
    const numberValue = String(input.manualUnitNumber).trim();
    const externalId = `MANUAL-UNIT-${numberValue}`;
    const existingUnit = await db.query<{ id: string }>(`SELECT id FROM customer_units WHERE storeganise_unit_id=$1`, [externalId]);
    if (existingUnit.rowCount) unitId = existingUnit.rows[0].id;
    else {
      unitId = randomUUID();
      await db.query(`INSERT INTO customer_units (id,storeganise_unit_id,storeganise_user_id,unit_number,map_zone,raw_payload) VALUES ($1,$2,$3,$4,'Mapa manual',$5::jsonb)`, [unitId,externalId,customerResult.rows[0].storeganise_user_id,numberValue,JSON.stringify({ manuallyAssigned: true })]);
    }
  } else {
    const relation = await db.query(`SELECT 1 FROM customer_units WHERE id=$1 AND storeganise_user_id=$2`, [unitId,customerResult.rows[0].storeganise_user_id]);
    if (!relation.rowCount) throw new Error("La bodega no pertenece al cliente seleccionado.");
  }
  const taxRate = number(input.taxRate, 15);
  const calculatedItems = [];
  for (const item of input.items) {
    if (!item.serviceId) throw new Error("Uno de los servicios no es válido.");
    const serviceResult = await db.query<{ id: string; code: string; name: string; calculation_type: string; unit: string }>(
      `SELECT id,code,name,calculation_type,unit FROM service_catalog
       WHERE id=$1 AND active=true AND category='BILLABLE'`, [item.serviceId],
    );
    if (!serviceResult.rowCount) throw new Error("Uno de los servicios no está disponible.");
    const service = serviceResult.rows[0];
    const quantity = service.code === "ELECTRICITY" ? number(item.consumptionKwh) : number(item.quantity, 1);
    const unitCost = number(item.unitCost);
    const marginPercent = number(item.marginPercent);
    if (quantity <= 0 || unitCost < 0 || marginPercent < 0) throw new Error("Revisa consumo, cantidad, costo y margen.");
    const unitPrice = round(unitCost * (1 + marginPercent / 100));
    calculatedItems.push({
      service, chargeType: item.chargeType || service.code,
      description: item.description?.trim() || service.name, quantity, unitCost,
      marginPercent, unitPrice, subtotal: round(quantity * unitPrice),
    });
  }
  const subtotal = round(calculatedItems.reduce((sum, item) => sum + item.subtotal, 0));
  const estimatedCost = round(calculatedItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0));
  const tax = round(subtotal * taxRate / 100);
  const total = round(subtotal + tax);
  const estimatedProfit = round(subtotal - estimatedCost);
  const chargeNumber = `SERV-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const first = calculatedItems[0];
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO service_charges
      (id,charge_number,customer_id,service_id,billing_period,previous_reading,
       current_reading,quantity,unit_cost,margin_percent,unit_price,subtotal,
       tax_rate,tax,total,estimated_cost,estimated_profit,notes,unit_id,currency)
     VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'USD')
     RETURNING id,charge_number,status,total,estimated_profit`,
      [
        randomUUID(), chargeNumber, customerId, first.service.id, input.billingPeriod,
        first.quantity, first.unitCost, first.marginPercent, first.unitPrice, subtotal,
        taxRate, tax, total, estimatedCost, estimatedProfit, input.notes?.trim() || null, unitId,
      ],
    );
    for (const item of calculatedItems) {
      await client.query(
        `INSERT INTO service_charge_items
         (id,service_charge_id,service_id,charge_type,description,quantity,unit,
          unit_cost,margin_percent,unit_price,subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [randomUUID(), result.rows[0].id, item.service.id, item.chargeType, item.description, item.quantity, item.service.unit, item.unitCost, item.marginPercent, item.unitPrice, item.subtotal],
      );
    }
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
