"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ActionButton, EmptyState, SelectInput, TextInput } from "@/components/ui";

type Customer = { id: string; storeganise_user_id: string; first_name: string | null; last_name: string | null; email: string | null; phone?: string | null; invoice_count: number };
type Unit = { id: string; storeganise_user_id: string; unit_number: string; map_zone: string | null };
type Service = { id: string; code: string; name: string; description: string; unit: string; category: string };
type Line = { serviceId: string; serviceCode: string; description: string; consumptionKwh: string; quantity: string; unitCost: string; marginPercent: string; costCurrency: "USD" | "HNL" };
type Charge = { id: string; charge_number: string; first_name: string | null; last_name: string | null; unit_number: string | null; total: string; status: string };
type ServiceDocument = { id: string; document_number: string; source: string; customer_name: string; total: string; amount_paid: string; currency: "USD" | "HNL"; equivalent_currency: "USD" | "HNL" | null; equivalent_total: string | null; status: string; created_at: string; items: Array<{ description: string; total: string }> };
type Occupancy = { unit_code: string; unit_id: string | null; customer_id: string | null; customer_key: string; customer_name: string; customer_email: string | null; customer_phone: string | null; customer_rtn: string | null; next_due_date: string };
type MapUnit = Unit & { free: boolean; synthetic: boolean; sourceUnitNumber: string; occupancy?: Occupancy };
type PeriodFilter = "ALL" | "DAY" | "WEEK" | "MONTH";

const roundMoney = (value: number) => Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : 0;
const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(roundMoney(value));
const hnl = (value: number) => new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" }).format(roundMoney(value));
const documentMoney = (value: number, currency: "USD" | "HNL") =>
  currency === "HNL" ? hnl(value) : usd(value);
const matchesPeriod = (dateValue: string, period: PeriodFilter) => {
  if (period === "ALL") return true;
  const date = new Date(dateValue); const now = new Date();
  if (period === "DAY") return date.toDateString() === now.toDateString();
  if (period === "MONTH") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(now.getDate() - now.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return date >= start && date < end;
};
const labels: Record<string, string> = { ELECTRICITY: "Factura eléctrica", INTERNET: "Internet", WIFI: "Wi-Fi", PARKING: "Parqueo", INDIVIDUAL_LIGHT: "Luz individual", OTHER_SERVICE: "Otros servicios", OTHER_CHARGE: "Otros cargos" };
const storageCodes = [
  ...Array.from({ length: 19 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 18 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 20 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 20 }, (_, index) => `E${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 36 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 5 }, (_, index) => `F${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 5 }, (_, index) => `G${String(index + 1).padStart(2, "0")}`),
];
const grayStorageCodes = new Set(["E01", "E02", "E18", "E20", "C01", "C18", "C19", "C36"]);
const blankLine = (
  service: Service,
  currency: "USD" | "HNL",
): Line => ({
  serviceId: service.id,
  serviceCode: service.code,
  description: labels[service.code] ?? service.name,
  consumptionKwh: "",
  quantity: "1",
  unitCost: "",
  marginPercent: "",
  costCurrency: service.code === "ELECTRICITY" ? "HNL" : currency,
});
const decimal = (value: string | number) => {
  const normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

function StorageMap({ units, customerUnitIds, selected, active, manual, onInspect }: {
  units: MapUnit[]; customerUnitIds: Set<string>; selected: string[]; active: string;
  manual: boolean; onInspect: (unit: MapUnit, selectable: boolean) => void;
}) {
  const byCode = new Map(units.map((unit) => [unit.unit_number, unit]));
  const unitButton = (code: string) => {
    const unit = byCode.get(code);
    if (!unit) return null;
    const owned = customerUnitIds.has(unit.id);
    const allowed = manual ? unit.free : owned;
    const isSelected = selected.includes(unit.id);
    const isActive = active === unit.id;
    const isGray = grayStorageCodes.has(code);
    return (
      <button
        key={code}
        type="button"
        title={`Bodega ${code} · ${unit.free ? "Libre" : unit.occupancy ? `Ocupada por ${unit.occupancy.customer_name}` : "Asignada"}`}
        onClick={() => onInspect(unit, allowed)}
        className={`flex min-h-0 min-w-0 items-center justify-center overflow-hidden border border-black/15 text-[clamp(5px,1.35vw,8px)] font-semibold text-slate-950 transition hover:brightness-95 ${
          isSelected
            ? `z-10 bg-blue-600 text-white ${isActive ? "ring-2 ring-blue-300" : ""}`
            : unit.occupancy
              ? "bg-[#8f8f8f]"
            : isGray
              ? "bg-[#aaaaaa]"
              : "bg-[#59c35b]"
        }`}
      >
        <span className="-rotate-90 whitespace-nowrap leading-none">{code}</span>
      </button>
    );
  };
  const vertical = (codes: string[]) => codes.map(unitButton);
  const bTop = Array.from({ length: 8 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`);
  const bBottom = Array.from({ length: 11 }, (_, index) => `B${String(index + 9).padStart(2, "0")}`);
  const aTop = Array.from({ length: 8 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`);
  const aBottom = ["A18", "A17", "A16", "A15", "A14", "A13", "A12", "A11", "A10", "A09"];
  const cLeft = Array.from({ length: 18 }, (_, index) => `C${String(36 - index).padStart(2, "0")}`);
  const cRight = Array.from({ length: 18 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);

  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-lg shadow-sky-900/5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-black text-slate-950">Mapa de bodegas</h3><p className="text-xs text-slate-500">Selecciona cualquier código para consultar y configurar la bodega.</p></div>
        <div className="flex gap-3 text-[10px] font-black"><span className="text-[#42aa45]">■ Disponible</span><span className="text-[#999999]">■ Referencia gris</span><span className="text-blue-700">■ Seleccionada</span></div>
      </div>
      <div className="relative mx-auto w-full max-w-[820px] overflow-hidden border border-slate-200 bg-white" style={{ aspectRatio: "706 / 395" }}>
        <div className="absolute left-1/2 top-1/2" style={{ width: "55.95%", height: "178.73%", transform: "translate(-50%, -50%) rotate(90deg)" }}>
        <div className="relative h-full w-full">
          <div className="absolute grid grid-rows-[32fr_20fr] gap-[10px]" style={{ left: "1%", top: "0.8%", width: "41.5%", height: "8.9%" }}>
            <div className="grid grid-cols-8">{bTop.map(unitButton)}</div>
            <div className="mr-[12%] grid" style={{ gridTemplateColumns: "repeat(7,1fr) repeat(3,1.55fr) 1fr" }}>{bBottom.map(unitButton)}</div>
          </div>
          <div className="absolute grid grid-rows-[32fr_20fr] gap-[10px]" style={{ left: "55.2%", top: "0.8%", width: "41.8%", height: "8.9%" }}>
            <div className="grid grid-cols-8">{aTop.map(unitButton)}</div>
            <div className="ml-[12%] grid" style={{ gridTemplateColumns: "repeat(6,1fr) repeat(4,1.55fr)" }}>{aBottom.map(unitButton)}</div>
          </div>

          <div className="absolute grid grid-rows-9" style={{ left: "1%", top: "11.7%", width: "13%", height: "25.9%" }}>{vertical(Array.from({ length: 9 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`))}</div>
          <div className="absolute grid grid-rows-11" style={{ left: "1%", top: "43.8%", width: "13%", height: "31.7%" }}>{vertical(Array.from({ length: 11 }, (_, index) => `D${String(index + 10).padStart(2, "0")}`))}</div>
          <div className="absolute grid grid-rows-9" style={{ left: "84.3%", top: "11.7%", width: "13.2%", height: "25.9%" }}>{vertical(Array.from({ length: 9 }, (_, index) => `E${String(index + 1).padStart(2, "0")}`))}</div>
          <div className="absolute grid grid-rows-11" style={{ left: "84.3%", top: "43.8%", width: "13.2%", height: "31.7%" }}>{vertical(Array.from({ length: 11 }, (_, index) => `E${String(index + 10).padStart(2, "0")}`))}</div>

          <div className="absolute grid grid-cols-2" style={{ left: "37.2%", top: "17.7%", width: "26.1%", height: "52.1%" }}>
            <div className="grid grid-rows-[repeat(18,minmax(0,1fr))]">{vertical(cLeft)}</div>
            <div className="grid grid-rows-[repeat(18,minmax(0,1fr))]">{vertical(cRight)}</div>
          </div>

          <div className="absolute grid grid-rows-5" style={{ left: "1%", top: "77.5%", width: "25.8%", height: "22%" }}>{vertical(Array.from({ length: 5 }, (_, index) => `F${String(index + 1).padStart(2, "0")}`))}</div>
          <div className="absolute grid grid-rows-5" style={{ left: "71.6%", top: "77.5%", width: "26.1%", height: "22%" }}>{vertical(Array.from({ length: 5 }, (_, index) => `G${String(index + 1).padStart(2, "0")}`))}</div>
        </div>
        </div>
      </div>
    </div>
  );
}

export default function PagosServiciosPage() {
  const [customers, setCustomers] = useState<Customer[]>([]); const [units, setUnits] = useState<Unit[]>([]);
  const [services, setServices] = useState<Service[]>([]); const [charges, setCharges] = useState<Charge[]>([]);
  const [documents, setDocuments] = useState<ServiceDocument[]>([]);
  const [occupancies, setOccupancies] = useState<Occupancy[]>([]);
  const [documentsPeriod, setDocumentsPeriod] = useState<PeriodFilter>("ALL");
  const [manual, setManual] = useState(false); const [manualCustomer, setManualCustomer] = useState({ name: "", email: "", phone: "" });
  const [customerId, setCustomerId] = useState(""); const [search, setSearch] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]); const [activeUnit, setActiveUnit] = useState("");
  const [assignments, setAssignments] = useState<Record<string, Line[]>>({});
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); const [taxRate, setTaxRate] = useState("15");
  const [usdToHnl, setUsdToHnl] = useState(0);
  const [exchangeUpdatedAt, setExchangeUpdatedAt] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "HNL">("USD");
  const [paymentState, setPaymentState] = useState<"pending" | "paid">("pending");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card">("cash");
  const [inspectedUnit, setInspectedUnit] = useState<MapUnit | null>(null);
  const [inspectedSelectable, setInspectedSelectable] = useState(false);
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const load = async () => {
    const [serviceResponse, billingResponse, exchangeResponse] = await Promise.all([
      fetch("/api/service-charges", { cache: "no-store" }),
      fetch("/api/billing?type=INVOICE", { cache: "no-store" }),
      fetch("/api/exchange-rate", { cache: "no-store" }),
    ]);
    const data = await serviceResponse.json(); const billing = await billingResponse.json();
    const exchange = await exchangeResponse.json();
    if (!serviceResponse.ok) throw new Error(data.message); if (!billingResponse.ok) throw new Error(billing.message);
    setCustomers(data.customers); setUnits(data.units ?? []); setServices(data.services); setCharges(data.charges); setOccupancies(data.occupancies ?? []);
    setDocuments(billing.documents ?? []);
    if (exchangeResponse.ok && Number.isFinite(exchange.rate)) {
      setUsdToHnl(exchange.rate);
      setExchangeUpdatedAt(exchange.updatedAt ?? null);
    }
  };
  useEffect(() => { const timer = setTimeout(() => void load().catch((error) => setError(error.message)), 0); return () => clearTimeout(timer); }, []);

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const customerUnitIds = useMemo(() => new Set(units.filter((unit) => unit.storeganise_user_id === selectedCustomer?.storeganise_user_id).map((unit) => unit.id)), [units, selectedCustomer]);
  const mapUnits = useMemo<MapUnit[]>(() => {
    const byNumber = new Map(units.map((unit) => [String(unit.unit_number), unit]));
    const occupancyByCode = new Map(occupancies.map((entry) => [entry.unit_code, entry]));
    return storageCodes.map((code, index) => {
      const numericNumber = String(index + 1);
      const actual = byNumber.get(code) ?? byNumber.get(numericNumber);
      const occupancy = occupancyByCode.get(code);
      return actual
        ? { ...actual, unit_number: code, sourceUnitNumber: String(actual.unit_number), free: !occupancy, synthetic: false, occupancy }
        : { id: `FREE-${code}`, storeganise_user_id: "", unit_number: code, sourceUnitNumber: code, map_zone: "Mapa principal", free: !occupancy, synthetic: true, occupancy };
    });
  }, [occupancies, units]);
  const visibleCustomers = customers.filter((customer) => [customer.first_name, customer.last_name, customer.email].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  const billable = services.filter((service) => service.category === "BILLABLE" && service.code !== "WIFI");
  const lines = assignments[activeUnit] ?? [];
  const toggleUnit = (unit: MapUnit) => {
    if (selectedUnits.includes(unit.id)) { setActiveUnit(unit.id); return; }
    setSelectedUnits([...selectedUnits, unit.id]); setActiveUnit(unit.id); setAssignments((current) => ({ ...current, [unit.id]: [] }));
  };
  const removeUnit = (id: string) => { const next = selectedUnits.filter((unitId) => unitId !== id); setSelectedUnits(next); setActiveUnit(next[0] ?? ""); setAssignments((current) => { const copy = { ...current }; delete copy[id]; return copy; }); };
  const inspectUnit = (unit: MapUnit, selectable: boolean) => {
    setInspectedUnit(unit);
    if (unit.occupancy) {
      const portalCustomer = unit.occupancy.customer_id ? customers.find((entry) => entry.id === unit.occupancy?.customer_id) : undefined;
      if (portalCustomer) {
        setManual(false);
        setCustomerId(portalCustomer.id);
      } else {
        setManual(true);
        setCustomerId("");
        setManualCustomer({ name: unit.occupancy.customer_name, email: unit.occupancy.customer_email ?? "", phone: unit.occupancy.customer_phone ?? "" });
      }
      setInspectedSelectable(true);
      return;
    }
    setInspectedSelectable(selectable);
  };
  const selectInspectedUnit = () => { if (!inspectedUnit || !inspectedSelectable) return; toggleUnit(inspectedUnit); setInspectedUnit(null); };
  const toggleService = (service: Service) => {
    if (!activeUnit) return;

    const unitId = activeUnit;
    setAssignments((current) => {
      const unitLines = current[unitId] ?? [];
      const nextLines = unitLines.some((line) => line.serviceId === service.id)
        ? unitLines.filter((line) => line.serviceId !== service.id)
        : [...unitLines, blankLine(service, displayCurrency)];

      return {
        ...current,
        [unitId]: nextLines,
      };
    });
  };
  const toggleServiceForUnit = (unit: MapUnit, service: Service) => {
    if (!inspectedSelectable) return;
    setSelectedUnits((current) => current.includes(unit.id) ? current : [...current, unit.id]);
    setActiveUnit(unit.id);
    setAssignments((current) => {
      const unitLines = current[unit.id] ?? [];
      return {
        ...current,
        [unit.id]: unitLines.some((line) => line.serviceId === service.id)
          ? unitLines.filter((line) => line.serviceId !== service.id)
          : [...unitLines, blankLine(service, displayCurrency)],
      };
    });
  };
  const updateLineAt = (unitId: string, index: number, patch: Partial<Line>) => {
    if (!unitId) return;

    setAssignments((current) => {
      const unitLines = [...(current[unitId] ?? [])];

      if (!unitLines[index]) {
        return current;
      }

      unitLines[index] = {
        ...unitLines[index],
        ...patch,
      };

      return {
        ...current,
        [unitId]: unitLines,
      };
    });
  };
  const liveLineValue = (
    index: number,
    _serviceCode: string,
    field: "unitCost" | "marginPercent",
    value: string,
  ) => {
    updateLineAt(activeUnit, index, { [field]: value });
  };
  const changeDisplayCurrency = (nextCurrency: "USD" | "HNL") => {
    if (nextCurrency === displayCurrency) return;
    if (!usdToHnl) return;

    setAssignments((current) =>
      Object.fromEntries(
        Object.entries(current).map(([unitId, unitLines]) => [
          unitId,
          unitLines.map((line) => {
            if (line.serviceCode === "ELECTRICITY") {
              return { ...line, costCurrency: "HNL" as const };
            }
            const currentCost = decimal(line.unitCost);
            const convertedCost =
              nextCurrency === "HNL"
                ? currentCost * usdToHnl
                : currentCost / usdToHnl;

            return {
              ...line,
              costCurrency: nextCurrency,
              unitCost: currentCost
                ? line.serviceCode === "ELECTRICITY"
                  ? (Math.round(convertedCost * 10_000) / 10_000).toFixed(4)
                  : roundMoney(convertedCost).toFixed(2)
                : "",
            };
          }),
        ]),
      ),
    );
    setDisplayCurrency(nextCurrency);
  };
  const lineQuantity = (line: Line) => {
    const isElectricity =
      line.serviceCode === "ELECTRICITY" ||
      (!line.serviceCode && line.description === labels.ELECTRICITY);

    return isElectricity ? decimal(line.consumptionKwh) : decimal(line.quantity);
  };
  const lineUnitPrice = (line: Line) => {
    const cost =
      (line.costCurrency ?? displayCurrency) === "HNL"
        ? usdToHnl > 0
          ? decimal(line.unitCost) / usdToHnl
          : 0
        : decimal(line.unitCost);
    const margin = decimal(line.marginPercent);

    return roundMoney(cost + cost * (margin / 100));
  };
  const electricityTotalHnl = (line: Line) => {
    const consumptionKwh = decimal(line.consumptionKwh);
    const tariffHnl = decimal(line.unitCost);
    const margin = decimal(line.marginPercent);
    const subtotal = consumptionKwh * tariffHnl;
    const marginAmount = subtotal * (margin / 100);

    return roundMoney(subtotal + marginAmount);
  };
  const lineTotal = (line: Line) => {
    if (line.serviceCode === "ELECTRICITY") {
      return usdToHnl > 0
        ? roundMoney(electricityTotalHnl(line) / usdToHnl)
        : 0;
    }
    return roundMoney(lineQuantity(line) * lineUnitPrice(line));
  };
  const unitTotal = (unitId: string) =>
    roundMoney(
      (assignments[unitId] ?? []).reduce(
        (sum, line) => sum + lineTotal(line),
        0,
      ),
    );
  // Una sola fuente de verdad para los importes visibles y para la factura.
  // Electricidad: consumo manual × tarifa manual por kWh, más el margen.
  const totals = (() => {
    const subtotal = roundMoney(selectedUnits.reduce((sum, id) => sum + unitTotal(id), 0));
    const tax = roundMoney(subtotal * decimal(taxRate) / 100);
    return { subtotal, tax, total: roundMoney(subtotal + tax) };
  })();
  const grandSubtotal = totals.subtotal;
  const grandTotal = totals.total;
  const displayMoney = (valueUsd: number) =>
    displayCurrency === "HNL"
      ? hnl(valueUsd * usdToHnl)
      : usd(valueUsd);
  const inspectedOwner = inspectedUnit ? customers.find((customer) => customer.storeganise_user_id === inspectedUnit.storeganise_user_id) : undefined;
  const inspectedOccupancy = inspectedUnit?.occupancy;
  const inspectedCustomerName = inspectedOccupancy?.customer_name ?? (inspectedOwner ? [inspectedOwner.first_name, inspectedOwner.last_name].filter(Boolean).join(" ") || inspectedOwner.email : "");
  const inspectedCustomerUnits = inspectedOccupancy ? occupancies.filter((entry) => entry.customer_key === inspectedOccupancy.customer_key) : [];
  const inspectedDocuments = inspectedUnit ? documents.filter((document) => document.items.some((item) => item.description.startsWith(`Bodega ${inspectedUnit.unit_number} ·`) || item.description.startsWith(`Bodega ${inspectedUnit.sourceUnitNumber} ·`))) : [];
  const inspectedConfigured = inspectedUnit ? assignments[inspectedUnit.id] ?? [] : [];
  const filteredServiceDocuments = documents.filter((document) =>
    document.source === "SERVICE" && matchesPeriod(document.created_at, documentsPeriod),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      if (!selectedUnits.length) throw new Error("Selecciona al menos una bodega.");
      const invoiceItemsUsd = selectedUnits.flatMap((id) => {
        const unit = mapUnits.find((entry) => entry.id === id)!; const assigned = assignments[id] ?? [];
        if (!assigned.length) throw new Error(`Agrega cargos para la bodega ${unit.unit_number}.`);
        return assigned.map((line) => {
          const service = services.find((entry) => entry.id === line.serviceId)!;
          const quantity = lineQuantity(line);
          const unitPriceUsd = lineUnitPrice(line);
          if (line.serviceCode === "ELECTRICITY" && quantity <= 0) {
            throw new Error(`Escribe el consumo kWh de la bodega ${unit.unit_number}.`);
          }
          if (decimal(line.unitCost) <= 0) {
            throw new Error(`Escribe ${line.serviceCode === "ELECTRICITY" ? "la tarifa por kWh" : "el costo"} de la bodega ${unit.unit_number}.`);
          }
          const electricityDetail =
            line.serviceCode === "ELECTRICITY"
              ? ` · ${decimal(line.consumptionKwh).toFixed(2)} kWh · Tarifa ${line.costCurrency ?? "HNL"} ${decimal(line.unitCost).toFixed(4)}/kWh · Margen ${decimal(line.marginPercent).toFixed(2)}%`
              : "";

          return {
            catalogCode: service.code,
            description: `Bodega ${unit.unit_number} · ${line.description}${electricityDetail}`,
            quantity,
            unitPrice: unitPriceUsd,
            discountPercent: 0,
            taxRate: decimal(taxRate),
          };
        });
      });
      if (!usdToHnl) {
        throw new Error("Espera a que cargue la tasa USD/HNL para generar ambas facturas.");
      }
      const batchId = crypto.randomUUID();
      const unitNumbers = selectedUnits.map((id) => mapUnits.find((unit) => unit.id === id)?.unit_number).join(", ");
      const equivalentTotal = roundMoney(grandTotal * usdToHnl);
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentType: "INVOICE",
          source: "SERVICE",
          currency: "USD",
          exchangeRate: usdToHnl,
          equivalentCurrency: "HNL",
          equivalentTotal,
          customerId: manual ? undefined : customerId,
          customer: manual ? manualCustomer : undefined,
          unitAssignments: selectedUnits.map((unitId) => {
            const unit = mapUnits.find((entry) => entry.id === unitId)!;
            return { unitId: unit.synthetic ? undefined : unit.id, unitLabel: unit.unit_number };
          }),
          items: invoiceItemsUsd,
          notes: `Factura global bilingüe ${batchId}. Servicios período ${period}. Bodegas: ${unitNumbers}. Tasa: USD 1.00 = HNL ${usdToHnl.toFixed(4)}. Total equivalente: HNL ${equivalentTotal.toFixed(2)}.`,
          payment: paymentState === "paid"
            ? { method: paymentMethod, reference: `SERVICIOS-${batchId}` }
            : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setMessage(`Factura global ${result.document.documentNumber} creada con un solo correlativo. Disponible en USD/inglés y HNL/español.`);
      setSelectedUnits([]); setAssignments({}); setActiveUnit(""); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo facturar."); } finally { setSaving(false); }
  };

  return <><PageHeader title="Pagos de servicios" description="Selecciona clientes y bodegas desde el mapa, y asigna cargos diferentes a cada unidad." /><div className="space-y-5 p-5">
    <form onSubmit={submit} className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-xl shadow-sky-900/5"><div className="flex flex-wrap items-center justify-between gap-3 bg-[#4188ef] p-5 text-white"><div><h2 className="text-xl font-black">Cliente para el cargo</h2><p className="text-sm text-sky-100">Busca un cliente de factura o ingrésalo manualmente. El resto del flujo es igual.</p></div><button type="button" onClick={() => { setManual(!manual); setCustomerId(""); setSelectedUnits([]); setAssignments({}); }} className="rounded-lg border border-white/30 bg-white/15 px-4 py-2 text-sm font-black">{manual ? "Buscar cliente" : "Modo manual"}</button></div>
        <div className="p-5">{manual ? <div className="grid gap-3 md:grid-cols-3"><TextInput required placeholder="Nombre del cliente" value={manualCustomer.name} onChange={(event) => setManualCustomer({ ...manualCustomer, name: event.target.value })} /><TextInput type="email" placeholder="Correo" value={manualCustomer.email} onChange={(event) => setManualCustomer({ ...manualCustomer, email: event.target.value })} /><TextInput placeholder="Teléfono" value={manualCustomer.phone} onChange={(event) => setManualCustomer({ ...manualCustomer, phone: event.target.value })} /></div> : <div className="grid gap-3 lg:grid-cols-[320px_1fr]"><TextInput placeholder="Buscar cliente de las facturas..." value={search} onChange={(event) => setSearch(event.target.value)} /><div className="flex gap-2 overflow-auto">{visibleCustomers.map((customer) => <button key={customer.id} type="button" onClick={() => { setCustomerId(customer.id); setSelectedUnits([]); setAssignments({}); }} className={`min-w-56 rounded-lg border p-3 text-left ${customerId === customer.id ? "border-sky-500 bg-sky-50" : "border-slate-200"}`}><strong className="block">{[customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email}</strong><span className="text-xs text-slate-500">{customer.invoice_count} factura(s)</span></button>)}</div></div>}</div>
      </section>
      <StorageMap units={mapUnits} customerUnitIds={customerUnitIds} selected={selectedUnits} active={activeUnit} manual={manual} onInspect={inspectUnit} />
      {inspectedUnit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-[#4188ef] p-5 text-white">
              <div><p className="text-xs font-black uppercase text-sky-100">{inspectedUnit.free ? "Bodega libre" : "Bodega ocupada"}</p><h2 className="text-2xl font-black">Bodega {inspectedUnit.unit_number}</h2><p className="mt-1 text-sm text-sky-100">{inspectedCustomerName ? `Cliente: ${inspectedCustomerName}` : inspectedUnit.free ? "Sin cliente asignado" : "Cliente no identificado"}</p></div>
              <div className="rounded-xl bg-white/15 px-4 py-2 text-right"><p className="text-[10px] font-black uppercase text-sky-100">Total configurado</p><p className="text-xl font-black">{usd(unitTotal(inspectedUnit.id))}</p></div>
            </div>
            {inspectedOccupancy ? <div className="mx-5 mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black uppercase text-amber-700">Cliente asignado</p><div className="mt-2 grid gap-3 text-sm md:grid-cols-2"><div><strong className="block text-slate-950">{inspectedOccupancy.customer_name}</strong><span className="block text-slate-600">{inspectedOccupancy.customer_email || "Sin correo"}</span><span className="block text-slate-600">{inspectedOccupancy.customer_phone || "Sin teléfono"}</span></div><div><p><strong>Próximo pago:</strong> {inspectedOccupancy.next_due_date}</p><p><strong>Bodegas del cliente:</strong> {inspectedCustomerUnits.map((entry) => entry.unit_code).join(", ") || inspectedUnit.unit_number}</p></div></div></div> : null}
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div>
                <h3 className="font-black">Servicios disponibles</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">{billable.map((service) => {
                  const configured = inspectedConfigured.some((line) => line.serviceId === service.id);
                  return <button disabled={!inspectedSelectable} type="button" onClick={() => toggleServiceForUnit(inspectedUnit, service)} key={service.id} className={`rounded-lg border p-3 text-left text-xs font-black transition ${configured ? "border-sky-500 bg-sky-50 text-sky-800" : inspectedSelectable ? "border-slate-200 text-slate-600 hover:border-sky-300 hover:bg-sky-50" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}><span className={`mr-2 inline-flex h-5 w-5 items-center justify-center rounded border ${configured ? "bg-sky-600 text-white" : ""}`}>{configured ? "✓" : ""}</span>{labels[service.code] ?? service.name}</button>;
                })}</div>
                <h3 className="mt-5 font-black">Configuración actual</h3>
                {inspectedConfigured.length ? <div className="mt-2 space-y-2">{inspectedConfigured.map((line) => <div key={line.serviceId} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between"><strong>{line.description}</strong><strong>{usd(lineTotal(line))}</strong></div><p className="text-xs text-slate-500">{line.serviceCode === "ELECTRICITY" ? `${line.consumptionKwh || "0"} kWh · Tarifa ${line.costCurrency} ${line.unitCost || "0"}/kWh` : `Cantidad ${line.quantity} · Costo ${line.costCurrency} ${line.unitCost || "0"}`} · Margen ${line.marginPercent || "0"}%</p></div>)}</div> : <EmptyState text="Todavía no seleccionaste servicios para esta bodega." />}
              </div>
              <div>
                <h3 className="font-black">Facturas y cargos históricos</h3>
                {inspectedDocuments.length ? <div className="mt-2 space-y-2">{inspectedDocuments.map((document) => <div key={document.id} className="rounded-lg border border-slate-200 p-3"><div className="flex justify-between gap-3"><strong className="font-mono text-xs">{document.document_number}</strong><strong>{documentMoney(Number(document.total), document.currency)}</strong></div><p className="mt-1 text-xs text-slate-500">{document.items.filter((item) => item.description.startsWith(`Bodega ${inspectedUnit.unit_number} ·`) || item.description.startsWith(`Bodega ${inspectedUnit.sourceUnitNumber} ·`)).map((item) => item.description.replace(/^Bodega [^·]+ · /, "")).join(", ")}</p><p className="mt-1 text-xs font-black text-sky-700">{document.status}</p></div>)}</div> : <EmptyState text="Esta bodega todavía no tiene alquileres ni cargos facturados." />}
                <h3 className="mt-5 font-black">Cargos anteriores</h3>
                {charges.filter((charge) => String(charge.unit_number) === String(inspectedUnit.unit_number)).length ? <div className="mt-2 space-y-2">{charges.filter((charge) => String(charge.unit_number) === String(inspectedUnit.unit_number)).map((charge) => <div key={charge.id} className="rounded-lg border border-slate-200 p-3"><div className="flex justify-between"><strong>{charge.charge_number}</strong><strong>{usd(Number(charge.total))}</strong></div><p className="text-xs text-slate-500">{charge.status}</p></div>)}</div> : <EmptyState text="No existen cargos anteriores." />}
              </div>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4"><ActionButton variant="secondary" onClick={() => setInspectedUnit(null)}>Cerrar</ActionButton>{inspectedSelectable ? <ActionButton onClick={selectInspectedUnit}>{selectedUnits.includes(inspectedUnit.id) ? "Abrir configuración" : "Seleccionar y configurar"}</ActionButton> : null}</div>
          </section>
        </div>
      ) : null}
      <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-lg"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase text-sky-600">Configuración visible</p><h2 className="text-lg font-black">Cargos por bodega</h2><div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1"><button type="button" onClick={() => changeDisplayCurrency("USD")} className={`rounded-md px-3 py-1 text-xs font-black ${displayCurrency === "USD" ? "bg-sky-600 text-white shadow" : "text-slate-600"}`}>USD $</button><button type="button" disabled={!usdToHnl} onClick={() => changeDisplayCurrency("HNL")} className={`rounded-md px-3 py-1 text-xs font-black disabled:opacity-40 ${displayCurrency === "HNL" ? "bg-sky-600 text-white shadow" : "text-slate-600"}`}>HNL L</button></div></div><div className="rounded-xl bg-slate-950 px-5 py-3 text-right text-white"><p className="text-[10px] font-black uppercase text-slate-300">Total global · {displayCurrency}</p><p className="text-2xl font-black">{displayMoney(grandTotal)}</p></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selectedUnits.map((id) => { const unit = mapUnits.find((entry) => entry.id === id)!; return <button key={id} type="button" onClick={() => setActiveUnit(id)} className={`rounded-xl border p-4 text-left transition ${activeUnit === id ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-900/20" : "border-slate-200 bg-slate-50"}`}><span className="text-xs font-black uppercase opacity-70">Bodega</span><span className="block text-xl font-black">{unit.unit_number}</span><span className="mt-2 flex justify-between text-xs"><span>{(assignments[id] ?? []).length} servicio(s)</span><strong>{displayMoney(unitTotal(id))}</strong></span><span onClick={(event) => { event.stopPropagation(); removeUnit(id); }} className="mt-3 inline-block text-xs font-black opacity-70 hover:opacity-100">Quitar bodega ×</span></button>; })}</div>{!selectedUnits.length ? <div className="mt-4"><EmptyState text="Selecciona una bodega en el mapa para configurar sus servicios. Esta sección permanecerá visible." /></div> : null}
        {activeUnit ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[280px_1fr]">
            <div>
              <h3 className="font-black">Cargos para bodega {mapUnits.find((unit) => unit.id === activeUnit)?.unit_number}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {billable.map((service) => {
                  const checked = lines.some((line) => line.serviceId === service.id);
                  return <button key={service.id} type="button" onClick={() => toggleService(service)} className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs font-black ${checked ? "border-sky-500 bg-sky-50" : "border-slate-200"}`}><span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? "bg-sky-600 text-white" : ""}`}>{checked ? "✓" : ""}</span>{labels[service.code] ?? service.name}</button>;
                })}
              </div>
              <div className="mt-4 rounded-xl bg-sky-50 p-4"><p className="text-xs font-black uppercase text-sky-600">Total bodega en vivo · {displayCurrency}</p><p className="text-2xl font-black text-sky-900">{displayMoney(unitTotal(activeUnit))}</p></div>
            </div>
            <div className="space-y-3">
              {lines.map((line, lineIndex) => {
                const service = services.find((entry) => entry.id === line.serviceId)!;
                if (service.code === "ELECTRICITY") {
                  return (
                    <div key={`${activeUnit}-${line.serviceId}-${lineIndex}`} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                      <strong className="text-sm">Factura eléctrica</strong>
                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <label className="text-xs font-black">Consumo kWh<TextInput required inputMode="decimal" placeholder="0" value={line.consumptionKwh} onChange={(event) => updateLineAt(activeUnit, lineIndex, { consumptionKwh: event.currentTarget.value })} /></label>
                        <label className="text-xs font-black">Tarifa HNL/kWh<TextInput required inputMode="decimal" placeholder="9.9121" value={line.unitCost} onChange={(event) => liveLineValue(lineIndex, service.code, "unitCost", event.currentTarget.value)} /></label>
                        <label className="text-xs font-black">Margen %<TextInput required inputMode="decimal" placeholder="0" value={line.marginPercent} onChange={(event) => liveLineValue(lineIndex, service.code, "marginPercent", event.currentTarget.value)} /></label>
                        <div className="rounded-lg bg-[#004B13] p-3 text-white">
                          <span className="text-xs font-black uppercase">Total a cobrar · {displayCurrency}</span>
                          <strong className="mt-1 block text-xl">
                            {displayCurrency === "HNL"
                              ? hnl(electricityTotalHnl(line))
                              : usd(usdToHnl > 0 ? electricityTotalHnl(line) / usdToHnl : 0)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={`${activeUnit}-${line.serviceId}-${lineIndex}`} className="grid gap-2 rounded-xl border bg-slate-50 p-3 md:grid-cols-6">
                    <div><strong className="text-sm">{labels[service.code] ?? service.name}</strong><TextInput placeholder="Descripción" value={line.description} onChange={(event) => updateLineAt(activeUnit, lineIndex, { description: event.currentTarget.value })} /></div>
                    <label className="text-xs font-black">Cantidad<TextInput required inputMode="decimal" placeholder="0" value={line.quantity} onChange={(event) => updateLineAt(activeUnit, lineIndex, { quantity: event.currentTarget.value })} /></label>
                    <label className="text-xs font-black">Costo<TextInput required inputMode="decimal" placeholder="0" value={line.unitCost} onChange={(event) => liveLineValue(lineIndex, service.code, "unitCost", event.currentTarget.value)} /></label>
                    <label className="text-xs font-black">Margen %<TextInput required inputMode="decimal" placeholder="0" value={line.marginPercent} onChange={(event) => liveLineValue(lineIndex, service.code, "marginPercent", event.currentTarget.value)} /></label>
                    <div className="rounded-lg bg-emerald-50 p-3"><span className="text-xs">Precio automático · {displayCurrency}</span><strong className="block text-lg">{displayMoney(lineUnitPrice(line))}</strong><span className="text-xs font-black text-emerald-800">Total: {displayMoney(lineTotal(line))}</span></div>
                  </div>
                );
              })}
              {!lines.length ? <EmptyState text="Marca los servicios que corresponden a esta bodega." /> : null}
            </div>
          </div>
        ) : null}
      </section>
      <section className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <strong>Conversión USD/HNL:</strong>{" "}
        {usdToHnl
          ? `USD 1.00 = ${hnl(usdToHnl)}`
          : "Consultando la tasa de cambio…"}
        {exchangeUpdatedAt ? (
          <span className="ml-2 text-xs text-sky-700">
            Actualizada: {new Date(exchangeUpdatedAt).toLocaleString("es-HN")}
          </span>
        ) : null}
      </section>
      <section className="flex flex-col gap-4 rounded-2xl bg-slate-950 p-5 text-white md:flex-row md:items-end md:justify-between"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-black">Período<TextInput required type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label><label className="text-xs font-black">Impuesto %<TextInput inputMode="decimal" placeholder="15" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></label><label className="text-xs font-black">Estado final<select className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm text-slate-900" value={paymentState} onChange={(event) => setPaymentState(event.target.value as "pending" | "paid")}><option value="pending">Pendiente de pago</option><option value="paid">Confirmar pagado</option></select></label>{paymentState === "paid" ? <label className="text-xs font-black">Método<select className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm text-slate-900" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="cash">Caja</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option></select></label> : null}</div><div className="min-w-64 rounded-xl border border-sky-400/30 bg-white/10 p-4 text-right"><p className="text-xs font-black uppercase tracking-wider text-sky-300">Total global en vivo · {displayCurrency}</p><p className="text-4xl font-black text-white">{displayMoney(grandTotal)}</p><p className="mt-1 text-sm text-slate-300">Subtotal: <strong>{displayMoney(grandSubtotal)}</strong></p><p className="mb-3 text-sm text-slate-300">Impuesto: <strong>{displayMoney(grandTotal - grandSubtotal)}</strong></p><button disabled={!selectedUnits.length || saving} type="submit" className="rounded-md bg-sky-500 px-4 py-2 text-sm font-black text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Generando..." : "Generar factura global"}</button></div></section>
    </form>
    {message ? <p className="rounded-lg bg-emerald-50 p-4 font-bold text-emerald-700">{message}</p> : null}{error ? <p className="rounded-lg bg-rose-50 p-4 font-bold text-rose-700">{error}</p> : null}
    <section className="rounded-lg border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-black">Facturas globales de servicios</h2><p className="text-xs text-slate-500">{filteredServiceDocuments.length} documento(s) · un correlativo por factura</p></div><SelectInput className="max-w-52" value={documentsPeriod} onChange={(event) => setDocumentsPeriod(event.target.value as PeriodFilter)}><option value="ALL">Todo el historial</option><option value="DAY">Hoy</option><option value="WEEK">Esta semana</option><option value="MONTH">Este mes</option></SelectInput></div>{!filteredServiceDocuments.length ? <div className="p-4"><EmptyState text="No hay facturas globales de servicios en este período." /></div> : <div className="overflow-auto"><table><thead><tr><th>Número</th><th>Cliente</th><th>Conceptos</th><th>Total</th><th>Estado</th><th>Representaciones</th></tr></thead><tbody>{filteredServiceDocuments.map((document) => <tr key={document.id}><td className="font-mono text-xs">{document.document_number}</td><td>{document.customer_name}</td><td>{document.items.map((item) => item.description).join(", ")}</td><td className="font-black">{documentMoney(Number(document.total), document.currency)}<br /><span className="text-xs text-slate-500">{document.equivalent_total ? documentMoney(Number(document.equivalent_total), "HNL") : null}</span></td><td>{document.status}</td><td><div className="flex min-w-max gap-2"><a href={`/api/billing/${document.id}/pdf?currency=USD&lang=en`} target="_blank" className="rounded-md border border-sky-200 px-3 py-2 text-xs font-black text-sky-700">USD · English</a><a href={`/api/billing/${document.id}/pdf?currency=HNL&lang=es`} target="_blank" className="rounded-md border border-sky-200 px-3 py-2 text-xs font-black text-sky-700">HNL · Español</a></div></td></tr>)}</tbody></table></div>}</section>
  </div></>;
}
