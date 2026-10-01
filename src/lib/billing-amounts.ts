export type PricingLine = {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
};

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Shared by the form and the backend. Convert prices BEFORE calculating ISV. */
export function calculateBillingAmounts<T extends PricingLine>(
  sourceLines: T[],
  { conversion = 1, exempt = false, groupTax = true } = {},
) {
  if (!Number.isFinite(conversion) || conversion <= 0) {
    throw new Error("La tasa de cambio no es válida para calcular la factura.");
  }
  const items = sourceLines.map((line) => {
    // Match the precision of billing_document_items so the stored inputs
    // reproduce the amounts calculated here.
    const quantity = Math.round(line.quantity * 1000) / 1000;
    const unitPrice = Math.round((line.unitPrice * conversion + Number.EPSILON) * 10000) / 10000;
    const taxRate = exempt ? 0 : Math.round(line.taxRate * 1000) / 1000;
    const discountPercent = Math.round(line.discountPercent * 1000) / 1000;
    const gross = roundMoney(quantity * unitPrice);
    const discount = roundMoney(gross * discountPercent / 100);
    const subtotal = roundMoney(gross - discount);
    const tax = roundMoney(subtotal * taxRate / 100);
    return { ...line, quantity, unitPrice, discountPercent, taxRate, subtotal, discount, tax, total: roundMoney(subtotal + tax) };
  });

  if (groupTax) {
    // Round each tax-rate group's ISV once. Allocate its cents among the
    // details so their sum matches exactly the fiscal summary (15%, 18%, 0%).
    for (const rate of new Set(items.map((item) => item.taxRate))) {
      const group = items.map((item, index) => ({ item, index }))
        .filter(({ item }) => item.taxRate === rate);
      const baseCents = group.reduce((sum, { item }) => sum + Math.round(item.subtotal * 100), 0);
      const rateThousandths = Math.round(rate * 1000);
      const targetTaxCents = Math.round(baseCents * rateThousandths / 100000);
      const allocations = group.map(({ item, index }) => {
        const numerator = Math.round(item.subtotal * 100) * rateThousandths;
        return { item, index, cents: Math.floor(numerator / 100000), remainder: numerator % 100000 };
      }).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
      let remaining = targetTaxCents - allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
      for (const allocation of allocations) {
        const extraCent = remaining > 0 ? 1 : 0;
        remaining -= extraCent;
        allocation.item.tax = (allocation.cents + extraCent) / 100;
        allocation.item.total = roundMoney(allocation.item.subtotal + allocation.item.tax);
      }
    }
  }

  const sum = (key: "subtotal" | "discount" | "tax" | "total") =>
    items.reduce((cents, item) => cents + Math.round(item[key] * 100), 0) / 100;
  return { items, subtotal: sum("subtotal"), discount: sum("discount"), tax: sum("tax"), total: sum("total") };
}
