import { calculateBillingAmounts, roundMoney } from "@/lib/billing-amounts";
import { isStoreganiseDeposit } from "./storeganise-deposit";

type Resource = Record<string, unknown>;

export type StoreganiseInvoiceLine = {
  catalogCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
};

function number(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function label(value: unknown): string {
  if (typeof value === "string") return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const translated = value as Resource;
    return label(translated.es ?? translated.en);
  }
  return "";
}

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const normalize = (value: unknown) => label(value).toLowerCase();

function rental(entry: Resource) {
  return [entry.type, ...(Array.isArray(entry.tags) ? entry.tags : [])]
    .some((value) => ["rent", "rental", "alquiler"].includes(normalize(value)));
}

/** Opt in only standalone charges to invoicing before payment. This does not
 * change the rental/deposit classifiers used by the existing paid flow.
 * Some rentals arrive as `revenue`, so their descriptions must also exclude
 * them from this exception. Unknown entries keep the existing payment gate.
 */
export function isStandaloneStoreganiseCharge(resource: Resource): boolean {
  if (!Array.isArray(resource.entries) || !resource.entries.length) return false;
  return resource.entries.every((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const entry = value as Resource;
    if (rental(entry) || isStoreganiseDeposit(entry)) return false;
    const description = label(entry.desc) || label(entry.description) || label(entry.name);
    const tags = [entry.type, ...(Array.isArray(entry.tags) ? entry.tags : [])].map(normalize);
    const words = [...tags, description].join(" ").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/\b(rent(?:al)?|alquiler|renta|arrendamiento|deposit(?:o)?|security[ _-]?deposit|reserva|reservation|move[ _-]?in)\b/.test(words)) {
      return false;
    }
    const chargeType = tags.some((tag) => [
      "revenue", "charge", "service", "addon", "add-on", "fee", "item", "product", "accessory",
    ].includes(tag));
    const serviceDescription = /\b(electricidad|electricity|internet|wi[ -]?fi|parqueo|parking|candado|padlock|servicios?|services?|cargos?|charges?|extras?)\b/.test(words);
    return Boolean(description) && (chargeType || serviceDescription);
  });
}

// A sent invoice is not itself proof of payment. Only reconcile standalone
// charges against the ledger on the freshly fetched Admin API invoice.
function ledgerCents(value: unknown) {
  const parsed = number(value);
  if (parsed === null) return null;
  const rounded = cents(parsed);
  return Number.isSafeInteger(rounded) && Math.abs(parsed * 100 - rounded) < 0.000001
    ? rounded : null;
}

function hasReversal(row: Resource) {
  return ["deleted", "voided", "reversed", "refunded", "cancelled", "canceled",
    "deletedAt", "voidedAt", "reversedAt", "refundedAt", "cancelledAt", "canceledAt",
    "amountRefunded", "refundedAmount"].some((key) => {
    const value = row[key];
    return value != null && value !== false && value !== 0 && value !== "" && value !== "false"
      && !(typeof value === "string" && /^0(?:\.0+)?$/.test(value));
  });
}

export function hasSettledStoreganiseService(invoice: Resource, invoiceId: string): boolean {
  if (invoice.id !== invoiceId || normalize(invoice.state ?? invoice.status) !== "sent"
    || hasReversal(invoice) || !isStandaloneStoreganiseCharge(invoice)) return false;

  const tags = [invoice.type, ...(Array.isArray(invoice.tags) ? invoice.tags : []),
    ...(invoice.entries as Resource[]).flatMap((entry) => [entry.type, ...(Array.isArray(entry.tags) ? entry.tags : [])])];
  if (tags.some((tag) => ["rent", "rental", "month", "monthly", "deposit", "movein", "moveout", "reservation",
    "prepayment", "prorated", "credit", "refund"].includes(normalize(tag).replace(/[ _-]/g, "")))) return false;

  const total = ledgerCents(invoice.total);
  if (total === null || total <= 0 || ledgerCents(invoice.balance) !== 0
    || ledgerCents(invoice.amountPaid) !== total
    || (invoice.creditApplied != null && ledgerCents(invoice.creditApplied) !== 0)
    || !Array.isArray(invoice.payments) || !invoice.payments.length) return false;

  const ids = new Set<string>();
  let received = 0;
  for (const payment of invoice.payments) {
    if (!payment || typeof payment !== "object" || Array.isArray(payment)) return false;
    const row = payment as Resource;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const paid = ledgerCents(row.amount);
    if (!id || ids.has(id) || paid === null || paid <= 0 || hasReversal(row)) return false;
    // Storeganise ledger entries (including manual card postings) can omit a
    // status. If a status IS provided it must explicitly indicate settlement.
    if ([row.state, row.status].some((state) => state != null
      && !["paid", "approved", "succeeded", "successful", "completed", "settled", "captured"].includes(normalize(state)))) return false;
    if (/(refund|revers|chargeback|cancel|void|credit)/i.test(String(row.type ?? ""))) return false;
    ids.add(id);
    received += paid;
    if (received > total) return false;
  }
  return received === total;
}

function dateLabel(value: unknown) {
  if (typeof value !== "string") return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** Map the actual Storeganise entries, never the aggregate invoice total.
 * Deposits use the existing classifier and remain exclusively in proformas.
 * This function has no database, exchange-rate or payment side effects.
 */
export function buildStoreganiseInvoiceLines(
  resource: Resource,
  expectedTotal: number,
  unitLabel: string,
  fallbackTaxRate: number,
): StoreganiseInvoiceLine[] {
  if (!Array.isArray(resource.entries) || !resource.entries.length) {
    throw new Error("Storeganise no envió el detalle completo del cobro.");
  }
  const lines: StoreganiseInvoiceLine[] = [];
  let sourceCents = 0;
  const ids = new Set<string>();
  for (const [index, value] of resource.entries.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Storeganise envió un concepto inválido en el detalle.");
    }
    const entry = value as Resource;
    // Do not reclassify deposits by description or include them in rent.
    if (isStoreganiseDeposit(entry)) continue;
    const id = label(entry.id);
    if (id && ids.has(id)) throw new Error("Storeganise envió un concepto duplicado; revisa el cobro.");
    if (id) ids.add(id);
    const subtotal = number(entry.subtotal);
    const tax = number(entry.tax);
    const total = number(entry.total) ?? (subtotal !== null && tax !== null ? roundMoney(subtotal + tax) : null);
    if (subtotal === null || tax === null || total === null) {
      throw new Error(`El concepto ${index + 1} no tiene subtotal, impuesto y total completos en Storeganise.`);
    }
    if (subtotal < 0 || tax < 0 || total < 0) {
      throw new Error("El cobro incluye un descuento o ajuste negativo separado. Requiere revisión antes de emitir el desglose fiscal.");
    }
    if (cents(subtotal) + cents(tax) !== cents(total)) {
      throw new Error(`El subtotal y el impuesto del concepto ${index + 1} no coinciden con su total.`);
    }
    sourceCents += cents(total);
    // Empty/free zero-quantity entries have no financial effect.
    const rawQuantity = entry.qty ?? entry.quantity ?? 1;
    const quantity = number(rawQuantity);
    if (quantity === 0 && total === 0) continue;
    if (quantity === null || quantity <= 0 || Math.abs(quantity - Math.round(quantity * 1000) / 1000) > 0.0000001) {
      throw new Error(`La cantidad del concepto ${index + 1} no es válida para facturar.`);
    }
    const isRental = rental(entry);
    let description = label(entry.desc) || label(entry.description) || label(entry.name);
    if (!description && isRental) description = "Alquiler de bodega";
    if (!description || /^[a-f\d]{24,}$/i.test(description)) {
      throw new Error(`El concepto ${index + 1} no tiene una descripción legible. Completa su nombre en Storeganise.`);
    }
    if (isRental) {
      description = description.replace(/^Rent\b/i, "Alquiler").replace(/\bprorated\b/gi, "prorrateado");
      const start = dateLabel(entry.date);
      const end = dateLabel(entry.endDate_display);
      if (start) description += end ? ` · ${start} al ${end}` : ` · Desde ${start}`;
    }
    if (unitLabel && !/^Bodega [^·]+ ·/i.test(description)) description = `Bodega ${unitLabel} · ${description}`;
    if (description.length > 1200) {
      throw new Error(`La descripción del concepto ${index + 1} es demasiado extensa. Resúmela en Storeganise antes de emitir el PDF.`);
    }

    // Use the net subtotal as authoritative: amount can be tax-inclusive,
    // prorated or already discounted. Never multiply the line total by qty.
    const unitPrice = Math.round((subtotal / quantity + Number.EPSILON) * 10000) / 10000;
    const explicitRate = number(entry.taxPct ?? entry.taxRate);
    // Never infer a new tax percentage from rounded cents. If the source omits
    // it, the existing configured rate must reproduce the supplied tax exactly.
    const taxRate = explicitRate ?? (tax === 0 ? 0 : fallbackTaxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0 || (subtotal === 0 && tax !== 0)) {
      throw new Error(`El impuesto del concepto ${index + 1} no es válido.`);
    }
    const line: StoreganiseInvoiceLine = {
      catalogCode: `${isRental ? "STOREGANISE_RENTAL_DETAIL" : "STOREGANISE_CHARGE_DETAIL"}:${String(index).padStart(6, "0")}`,
      description,
      quantity,
      unitPrice,
      discountPercent: 0,
      taxRate,
    };
    const calculated = calculateBillingAmounts([line], { groupTax: false });
    if (cents(calculated.subtotal) !== cents(subtotal) || cents(calculated.tax) !== cents(tax)
      || cents(calculated.total) !== cents(total)) {
      throw new Error(`Los importes del concepto ${index + 1} no se pueden representar sin diferencias. Revisa su precio, cantidad e impuesto.`);
    }
    lines.push(line);
  }
  if (sourceCents !== cents(expectedTotal) || (expectedTotal > 0 && !lines.length)) {
    throw new Error("La suma de alquiler y extras no coincide con el total sin depósito de Storeganise. No se emitió la factura.");
  }
  return lines;
}
