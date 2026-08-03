"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StorageMapUnit, StorageUnitMap, storageCodes } from "@/components/storage-unit-map";
import { ActionButton, EmptyState, MetricCard, SelectInput, TextInput } from "@/components/ui";

type Mode = "cash" | "proforma";
type Customer = { id: string; storeganise_user_id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; address: string | null; billing_data: Record<string, unknown>; invoice_count: number };
type Unit = { id: string; storeganise_user_id: string; unit_number: string; map_zone: string | null; raw_payload?: Record<string, unknown> };
type Item = { catalogCode: string; description: string; quantity: number; unitPrice: number; discountPercent: number; taxRate: number };
type BillingDocument = { id: string; document_number: string; customer_name: string; customer_email: string | null; unit_id: string | null; currency: "USD" | "HNL"; total: string; amount_paid: string; status: string; created_at: string };
type PeriodFilter = "ALL" | "DAY" | "WEEK" | "MONTH";
type FiscalConfig = { cai: string; range_start: number; range_end: number; current_number: number; expiration_date: string; establishment: string; emission_point: string; document_type: string };
type Occupancy = { unit_code: string; unit_id: string | null; customer_id: string | null; customer_key: string; customer_name: string; customer_email: string | null; next_due_date: string };

const money = (value: number, currency: "USD" | "HNL") => new Intl.NumberFormat(currency === "HNL" ? "es-HN" : "en-US", { style: "currency", currency }).format(value || 0);
const blankItem = (): Item => ({ catalogCode: "", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, taxRate: 15 });
const matchesPeriod = (dateValue: string, period: PeriodFilter) => {
  if (period === "ALL") return true;
  const date = new Date(dateValue);
  const now = new Date();
  if (period === "DAY") return date.toDateString() === now.toDateString();
  if (period === "MONTH") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(now.getDate() - now.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return date >= start && date < end;
};

function storedMonthlyPrice(value: unknown, depth = 0): number {
  if (!value || typeof value !== "object" || depth > 3) return 0;
  const record = value as Record<string, unknown>;
  const keys = ["monthlyPrice", "monthly_price", "monthlyRate", "monthly_rate", "rentalPrice", "rental_price", "rent", "price"];
  for (const key of keys) {
    const parsed = Number(record[key]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  for (const nested of Object.values(record)) {
    const found = storedMonthlyPrice(nested, depth + 1);
    if (found > 0) return found;
  }
  return 0;
}

export function BillingWorkbench({ mode }: { mode: Mode }) {
  const isProforma = mode === "proforma";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [documents, setDocuments] = useState<BillingDocument[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<Array<{ mapId: string; unitId?: string; unitLabel: string }>>([]);
  const [search, setSearch] = useState("");
  const [manual, setManual] = useState(true);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", rtn: "", address: "" });
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState<"USD" | "HNL">("USD");
  const [usdToHnl, setUsdToHnl] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("ALL");
  const [historyPeriod, setHistoryPeriod] = useState<PeriodFilter>("ALL");
  const [fiscal, setFiscal] = useState<FiscalConfig | null>(null);
  const [occupancies, setOccupancies] = useState<Occupancy[]>([]);

  const load = useCallback(async () => {
    const [response, exchangeResponse] = await Promise.all([
      fetch(`/api/billing?type=${isProforma ? "PROFORMA" : "INVOICE"}`, { cache: "no-store" }),
      fetch("/api/exchange-rate", { cache: "no-store" }),
    ]);
    const data = await response.json();
    const exchange = await exchangeResponse.json();
    if (!response.ok) throw new Error(data.message);
    setCustomers(data.customers); setUnits(data.units); setDocuments(data.documents); setFiscal(data.fiscal ?? null); setOccupancies(data.occupancies ?? []);
    if (exchangeResponse.ok && Number.isFinite(exchange.rate)) {
      setUsdToHnl(exchange.rate);
    }
  }, [isProforma]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((e) => setError(e.message)), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const selected = customers.find((entry) => entry.id === customerId);
  const customerUnits = selected ? units.filter((unit) => unit.storeganise_user_id === selected.storeganise_user_id) : [];
  const ownedUnitIds = useMemo(() => new Set(customerUnits.map((unit) => unit.id)), [customerUnits]);
  const mapUnits = useMemo<StorageMapUnit[]>(() => {
    const byNumber = new Map(units.map((unit) => [String(unit.unit_number), unit]));
    const occupancyByCode = new Map(occupancies.map((entry) => [entry.unit_code, entry]));
    return storageCodes.map((code, index) => {
      const actual = byNumber.get(code) ?? byNumber.get(String(index + 1));
      const occupancy = occupancyByCode.get(code);
      return actual
        ? { id: actual.id, storeganise_user_id: actual.storeganise_user_id, unit_number: code, sourceUnitNumber: actual.unit_number, map_zone: actual.map_zone, free: !occupancy, synthetic: false, occupied: Boolean(occupancy), occupantName: occupancy?.customer_name }
        : { id: `FREE-${code}`, storeganise_user_id: "", unit_number: code, sourceUnitNumber: code, map_zone: "Mapa principal", free: !occupancy, synthetic: true, occupied: Boolean(occupancy), occupantName: occupancy?.customer_name };
    });
  }, [occupancies, units]);
  const filteredCustomers = customers.filter((entry) =>
    [entry.first_name, entry.last_name, entry.email].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()),
  ).slice(0, 8);
  const totals = items.reduce((sum, item) => {
    const gross = item.quantity * item.unitPrice;
    const discounted = gross * (1 - item.discountPercent / 100);
    return { subtotal: sum.subtotal + discounted, tax: sum.tax + discounted * item.taxRate / 100 };
  }, { subtotal: 0, tax: 0 });
  const total = totals.subtotal + totals.tax;
  const filteredDocuments = useMemo(() => documents.filter((document) =>
    [document.customer_name, document.customer_email, document.document_number].filter(Boolean).join(" ").toLowerCase().includes(historySearch.toLowerCase())
      && (historyStatus === "ALL" || document.status === historyStatus)
      && matchesPeriod(document.created_at, historyPeriod),
  ), [documents, historyPeriod, historySearch, historyStatus]);

  const updateItem = (index: number, patch: Partial<Item>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const selectRentalUnit = (mapUnit: StorageMapUnit, owned: boolean) => {
    if (!manual && !selected) { setError("Selecciona primero el cliente de la factura."); return; }
    if (!manual && (!owned || mapUnit.synthetic)) { setError(`La bodega ${mapUnit.unit_number} no está asignada al cliente seleccionado.`); return; }
    const occupancy = occupancies.find((entry) => entry.unit_code === mapUnit.unit_number);
    const sameCustomer = manual
      ? occupancy?.customer_key === `MANUAL:${(customer.email || customer.name).trim().toLowerCase()}`
      : occupancy?.customer_id === customerId;
    if (occupancy && !sameCustomer) { setError(`La bodega ${mapUnit.unit_number} ya está ocupada por ${occupancy.customer_name}. No puedes asignarla nuevamente.`); return; }
    const sourceUnit = units.find((unit) => unit.id === mapUnit.id);
    const alreadySelected = selectedUnits.some((entry) => entry.mapId === mapUnit.id);
    if (alreadySelected) {
      setSelectedUnits((current) => current.filter((entry) => entry.mapId !== mapUnit.id));
      setItems((current) => {
        const next = current.filter((item) => !(item.catalogCode === "RENTAL_30_DAYS" && item.description.startsWith(`Bodega ${mapUnit.unit_number} ·`)));
        return next.length ? next : [blankItem()];
      });
      setMessage(`Bodega ${mapUnit.unit_number} removida del documento.`);
      setError("");
      return;
    }
    const monthlyPrice = storedMonthlyPrice(sourceUnit?.raw_payload);
    const rental: Item = {
      catalogCode: "RENTAL_30_DAYS",
      description: `Bodega ${mapUnit.unit_number} · Alquiler por 30 días`,
      quantity: 1,
      unitPrice: monthlyPrice,
      discountPercent: 0,
      taxRate: 15,
    };
    setSelectedUnits((current) => [...current, { mapId: mapUnit.id, unitId: mapUnit.synthetic ? undefined : mapUnit.id, unitLabel: mapUnit.unit_number }]);
    setItems((current) => {
      const useful = current.filter((item) => item.description.trim() || item.unitPrice > 0);
      return [rental, ...useful];
    });
    setError("");
    setMessage(monthlyPrice > 0 ? `Bodega ${mapUnit.unit_number} seleccionada. Se cargó su alquiler de 30 días.` : `Bodega ${mapUnit.unit_number} seleccionada. Escribe el precio del alquiler de 30 días.`);
  };
  const changeCurrency = (nextCurrency: "USD" | "HNL") => {
    if (nextCurrency === currency || !usdToHnl) return;

    setItems((current) => current.map((item) => ({
      ...item,
      unitPrice: item.unitPrice
        ? Number((nextCurrency === "HNL"
          ? item.unitPrice * usdToHnl
          : item.unitPrice / usdToHnl).toFixed(2))
        : 0,
    })));
    setCurrency(nextCurrency);
  };
  const submit = async (event: FormEvent, status?: string) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/billing", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentType: isProforma ? "PROFORMA" : "INVOICE", source: isProforma ? "PROFORMA" : "CASH",
          customerId: manual ? undefined : customerId,
          unitId: selectedUnits[0]?.unitId,
          unitLabel: selectedUnits.map((entry) => entry.unitLabel).join(", ") || undefined,
          unitAssignments: selectedUnits.map((entry) => ({ unitId: entry.unitId, unitLabel: entry.unitLabel })),
          customer: manual ? customer : undefined, items, notes,
          status: isProforma ? (status ?? "DRAFT") : "PENDING_PAYMENT", currency,
          exchangeRate: usdToHnl || undefined,
          equivalentCurrency: currency === "USD" ? "HNL" : "USD",
          equivalentTotal: usdToHnl
            ? Number((currency === "USD" ? total * usdToHnl : total / usdToHnl).toFixed(2))
            : undefined,
        }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      setMessage(`${isProforma ? "Proforma" : "Factura"} ${data.document.documentNumber} creada por ${money(Number(data.document.total), currency)}.`);
      setItems([blankItem()]); setNotes(""); setSelectedUnits([]); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setSaving(false); }
  };

  const action = async (id: string, actionName: string) => {
    setError(""); setMessage("");
    try {
      const response = await fetch(`/api/billing/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: actionName }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      setMessage(actionName === "SEND" ? "Documento enviado por correo con PDF adjunto." : actionName === "CONVERT" ? "Proforma convertida en factura definitiva." : "Estado actualizado.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar."); }
  };

  const registerPayment = async (document: BillingDocument) => {
    const balance = Number(document.total) - Number(document.amount_paid);
    const entered = window.prompt(`Saldo actual: ${money(balance, document.currency)}. Ingresa el pago o abono:`, balance.toFixed(2));
    if (entered === null) return;
    const amount = Number(entered);
    if (!Number.isFinite(amount) || amount <= 0) { setError("El pago debe ser mayor que cero."); return; }
    try {
      const response = await fetch(`/api/billing/${document.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "PAY", amount, method: "cash", reference: "CAJA" }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      setMessage(`Pago en caja de ${money(amount, document.currency)} registrado correctamente.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar el pago."); }
  };

  return (
    <>
      <PageHeader title={isProforma ? "Proformas" : "Caja (Cash Payment)"} description={isProforma ? "Crea cotizaciones profesionales, envíalas y conviértelas en factura." : "Crea facturas manuales, selecciona la bodega y registra pagos en caja."} />
      <div className="space-y-5 p-5">
        {!isProforma ? (
          fiscal ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-black">Facturación fiscal conectada</p>
              <p className="mt-1">CAI: <span className="font-mono font-bold">{fiscal.cai}</span></p>
              <p className="text-xs">Próxima factura: {fiscal.establishment}-{fiscal.emission_point}-{fiscal.document_type}-{String(fiscal.current_number).padStart(8, "0")} · Fecha límite: {String(fiscal.expiration_date).slice(0, 10)}</p>
            </section>
          ) : (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">
              Configura y activa manualmente un CAI vigente en CAI / Correlativos antes de crear facturas de Caja.
            </section>
          )
        ) : null}
        {isProforma ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Proformas" value={String(documents.length)} /><MetricCard label="Aceptadas" value={String(documents.filter((document) => ["ACCEPTED", "CONVERTED"].includes(document.status)).length)} /><MetricCard label="Rechazadas" value={String(documents.filter((document) => document.status === "REJECTED").length)} /><MetricCard label="Conversión" value={`${documents.length ? Math.round(documents.filter((document) => document.status === "CONVERTED").length / documents.length * 100) : 0}%`} /></div> : null}
        <form onSubmit={(event) => void submit(event)} className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-xl shadow-sky-900/5">
          <div className="flex flex-col gap-3 bg-[#4188ef] p-5 text-white sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">{isProforma ? "Nueva proforma" : "Nueva factura manual"}</h2><p className="text-sm text-sky-100">Facturación manual digital con moneda seleccionable.</p></div><SelectInput className="max-w-52 border-white/30 bg-white text-slate-900" value={currency} onChange={(event) => changeCurrency(event.target.value as "USD" | "HNL")}><option value="USD">Precio en USD ($)</option><option value="HNL">Precio en Lempiras (L)</option></SelectInput></div>
          <div className="grid gap-5 p-5 xl:grid-cols-[0.85fr_1.4fr]">
            <section className="space-y-4 rounded-xl border border-slate-200 p-4">
              <div className="flex justify-between"><h3 className="font-black">Cliente y bodegas</h3><button type="button" onClick={() => { setManual(!manual); setCustomerId(""); setSelectedUnits([]); setItems([blankItem()]); }} className="text-xs font-black text-sky-700">{manual ? "Usar cliente del Portal" : "Ingresar manual"}</button></div>
              {manual ? (
                <div className="space-y-3">
                  <TextInput required placeholder="Nombre o empresa" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                  <TextInput type="email" placeholder="Correo" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
                  <TextInput placeholder="RTN / Tax ID" value={customer.rtn} onChange={(e) => setCustomer({ ...customer, rtn: e.target.value })} />
                  <TextInput placeholder="Teléfono" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
                  <TextInput placeholder="Dirección fiscal" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
                </div>
              ) : (
                <>
                  <TextInput placeholder="Buscar cliente de las facturas..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">
                    {filteredCustomers.map((entry) => (
                      <button key={entry.id} type="button" onClick={() => { setCustomerId(entry.id); setSelectedUnits([]); setItems([blankItem()]); }} className={`w-full border-b p-3 text-left text-sm last:border-0 ${customerId === entry.id ? "bg-sky-50 text-sky-800" : "hover:bg-slate-50"}`}>
                        <strong>{[entry.first_name, entry.last_name].filter(Boolean).join(" ") || entry.email}</strong><span className="block text-xs text-slate-500">{entry.email} · {entry.invoice_count} factura(s)</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!manual && selected ? (
                <div>
                  <p className="mb-2 text-xs font-black uppercase text-slate-500">Bodegas del cliente ({customerUnits.length})</p>
                  {customerUnits.length ? <div className="grid grid-cols-2 gap-2">{customerUnits.map((unit, index) => (
                    <button key={unit.id} type="button" onClick={() => { const mapped = mapUnits.find((entry) => entry.id === unit.id); if (mapped) selectRentalUnit(mapped, true); }} className={`rounded-lg border p-3 text-left ${selectedUnits.some((entry) => entry.unitId === unit.id) ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200"}`}>
                      <span className="text-[10px] font-black text-slate-400">#{index + 1}</span><strong className="block">Bodega {unit.unit_number}</strong><span className="text-xs text-slate-500">{unit.map_zone ? `Zona ${unit.map_zone}` : "Mapa principal"}</span>
                    </button>
                  ))}</div> : <p className="rounded-lg bg-amber-50 p-3 text-xs font-bold text-amber-700">Storeganise aún no envió una bodega para este cliente.</p>}
                </div>
              ) : null}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between"><div><h3 className="font-black">Detalle manual de la factura</h3><p className="text-xs text-slate-500">Escribe libremente lo que deseas cobrar.</p></div><ActionButton variant="secondary" onClick={() => setItems([...items, blankItem()])}>+ Agregar concepto</ActionButton></div>
              {items.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-6">
                  <TextInput required className="md:col-span-3" placeholder="Descripción del producto, servicio o cargo" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} />
                  <TextInput required min="0.001" step="0.001" type="number" placeholder="Cantidad" value={item.quantity || ""} onChange={(e) => updateItem(index, { quantity: e.target.valueAsNumber || 0 })} />
                  <TextInput required min="0" step="0.01" type="number" placeholder="Precio" value={item.unitPrice || ""} onChange={(e) => updateItem(index, { unitPrice: e.target.valueAsNumber || 0 })} />
                  <button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))} className="rounded-md text-xs font-black text-rose-600 disabled:opacity-30">Eliminar</button>
                  <label className="text-xs font-bold text-slate-500">Descuento %<TextInput min="0" max="100" step="0.01" type="number" value={item.discountPercent || ""} onChange={(e) => updateItem(index, { discountPercent: e.target.valueAsNumber || 0 })} /></label>
                  <label className="text-xs font-bold text-slate-500">Impuesto %<TextInput min="0" step="0.01" type="number" value={item.taxRate || ""} onChange={(e) => updateItem(index, { taxRate: e.target.valueAsNumber || 0 })} /></label>
                </div>
              ))}
              <div className="ml-auto max-w-sm rounded-xl bg-slate-950 p-4 text-white">
                <p className="flex justify-between text-sm"><span>Subtotal</span><strong>{money(totals.subtotal, currency)}</strong></p><p className="mt-2 flex justify-between text-sm"><span>Impuestos</span><strong>{money(totals.tax, currency)}</strong></p><p className="mt-3 flex justify-between border-t border-white/20 pt-3 text-xl font-black"><span>Total</span><span>{money(total, currency)}</span></p>
              </div>
              <textarea className="min-h-20 w-full rounded-lg border border-slate-200 p-3 text-sm" placeholder="Notas y condiciones" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex flex-wrap justify-end gap-2">{isProforma ? <><ActionButton variant="secondary" type="submit">{saving ? "Guardando..." : "Guardar borrador"}</ActionButton><ActionButton onClick={() => { const form = document.querySelector("form"); if (form) void submit({ preventDefault: () => {} } as FormEvent, "SENT"); }}>Guardar como enviada</ActionButton></> : <ActionButton type="submit">{saving ? "Facturando..." : "Crear factura"}</ActionButton>}</div>
            </section>
          </div>
          <div className="border-t border-slate-200 p-5"><StorageUnitMap units={mapUnits} ownedUnitIds={ownedUnitIds} selectedIds={selectedUnits.map((entry) => entry.mapId)} onSelect={selectRentalUnit} description={isProforma ? "Selecciona una o varias bodegas disponibles para preparar la proforma." : "Selecciona una o varias bodegas para cobrar sus alquileres en una sola factura."} /></div>
        </form>
        {message ? <p className="rounded-lg bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</p> : null}{error ? <p className="rounded-lg bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p> : null}
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between"><h2 className="font-black">Historial de {isProforma ? "proformas" : "facturas de caja"}</h2><div className="flex flex-wrap gap-2"><TextInput placeholder="Cliente o número" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} /><SelectInput value={historyPeriod} onChange={(e) => setHistoryPeriod(e.target.value as PeriodFilter)}><option value="ALL">Todo el historial</option><option value="DAY">Hoy</option><option value="WEEK">Esta semana</option><option value="MONTH">Este mes</option></SelectInput><SelectInput value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)}><option value="ALL">Todos</option>{isProforma ? <><option value="DRAFT">Borrador</option><option value="SENT">Enviada</option><option value="ACCEPTED">Aceptada</option><option value="REJECTED">Rechazada</option><option value="CONVERTED">Convertida</option></> : <><option value="PENDING_PAYMENT">Pendiente</option><option value="PARTIALLY_PAID">Abonada</option><option value="PAID">Pagada</option></>}</SelectInput></div></div>
          {!filteredDocuments.length ? <div className="p-4"><EmptyState text="Aún no hay documentos con estos filtros." /></div> : <div className="overflow-auto"><table><thead><tr><th>Número</th><th>Cliente</th><th>Total</th><th>Pagado</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>{filteredDocuments.map((doc) => <tr key={doc.id}><td className="font-mono text-xs">{doc.document_number}</td><td><strong>{doc.customer_name}</strong><br /><span className="text-xs">{doc.customer_email}</span></td><td className="font-black">{money(Number(doc.total), doc.currency)}</td><td>{money(Number(doc.amount_paid), doc.currency)}</td><td>{doc.status}</td><td>{new Date(doc.created_at).toLocaleDateString("es-HN")}</td><td><div className="flex min-w-max gap-2"><a className="rounded-md border border-sky-200 px-3 py-2 text-xs font-black text-sky-700" href={`/api/billing/${doc.id}/pdf`} target="_blank">PDF</a><ActionButton variant="secondary" onClick={() => void action(doc.id, "SEND")}>Enviar correo</ActionButton>{!isProforma && doc.status !== "PAID" ? <ActionButton onClick={() => void registerPayment(doc)}>Registrar pago</ActionButton> : null}{isProforma && !["CONVERTED", "REJECTED"].includes(doc.status) ? <><ActionButton variant="secondary" onClick={() => void action(doc.id, "ACCEPTED")}>Aceptar</ActionButton><ActionButton variant="danger" onClick={() => void action(doc.id, "REJECTED")}>Rechazar</ActionButton><ActionButton onClick={() => void action(doc.id, "CONVERT")}>Convertir en factura</ActionButton></> : null}</div></td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </>
  );
}
