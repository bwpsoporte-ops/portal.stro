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
