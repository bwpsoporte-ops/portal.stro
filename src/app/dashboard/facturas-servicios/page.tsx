"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, SelectInput, TextInput } from "@/components/ui";
import { shortDate } from "@/lib/dashboard-data";

type ServiceInvoice = {
  id: string;
  document_number: string;
  source: string;
  customer_name: string;
  customer_email: string | null;
  currency: "USD" | "HNL";
  total: string;
  amount_paid: string;
  status: string;
  created_at: string;
  notes: string | null;
  equivalent_currency: "USD" | "HNL" | null;
  equivalent_total: string | null;
  items: Array<{ description: string; total: string }>;
};
type PeriodFilter = "ALL" | "DAY" | "WEEK" | "MONTH";

const matchesPeriod = (dateValue: string, period: PeriodFilter) => {
  if (period === "ALL") return true;
  const date = new Date(dateValue); const now = new Date();
  if (period === "DAY") return date.toDateString() === now.toDateString();
  if (period === "MONTH") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(now.getDate() - now.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return date >= start && date < end;
};

const money = (value: number, currency: "USD" | "HNL") =>
  new Intl.NumberFormat(currency === "HNL" ? "es-HN" : "en-US", {
    style: "currency",
    currency,
  }).format(value || 0);

const statusLabel = (status: string) =>
  status === "PAID"
    ? "PAGADA"
    : status === "PARTIALLY_PAID"
      ? "ABONADA"
      : "PENDIENTE DE PAGO";

export default function FacturasServiciosPage() {
  const [invoices, setInvoices] = useState<ServiceInvoice[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [currency, setCurrency] = useState<"ALL" | "USD" | "HNL">("ALL");
  const [period, setPeriod] = useState<PeriodFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/billing?type=INVOICE", {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    setInvoices(
      (data.documents ?? []).filter(
        (invoice: ServiceInvoice) => invoice.source === "SERVICE",
      ),
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
        .catch((loadError) =>
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudieron cargar las facturas.",
          ),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateStatus = async (
    invoice: ServiceInvoice,
    nextStatus: "PAID" | "PENDING_PAYMENT",
  ) => {
    setUpdatingId(invoice.id);
    setError("");
    try {
      const response = await fetch(`/api/billing/${invoice.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: nextStatus === "PAID" ? "MARK_PAID" : "MARK_PENDING",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      await load();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar el estado.",
      );
    } finally {
      setUpdatingId("");
    }
  };

  const filtered = useMemo(
    () =>
      invoices.filter((invoice) => {
        const text = [
          invoice.customer_name,
          invoice.customer_email,
          invoice.document_number,
          ...invoice.items.map((item) => item.description),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          text.includes(search.toLowerCase()) &&
          (status === "ALL" || invoice.status === status) &&
          (currency === "ALL" || invoice.currency === currency || invoice.equivalent_currency === currency) &&
          matchesPeriod(invoice.created_at, period)
        );
      }),
    [currency, invoices, period, search, status],
  );

  return (
    <>
      <PageHeader
        title="Facturas de servicios"
        description="Una factura fiscal y un correlativo, con representación USD/inglés y HNL/español."
      />
      <div className="space-y-5 p-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["ALL", "USD", "HNL"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCurrency(value)}
                className={`rounded-md px-4 py-2 text-sm font-black ${
                  currency === value
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {value === "ALL" ? "Todas" : value === "USD" ? "USD $" : "HNL L"}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
            <TextInput
              placeholder="Buscar cliente, número, bodega o servicio"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <SelectInput
              value={period}
              onChange={(event) => setPeriod(event.target.value as PeriodFilter)}
            >
              <option value="ALL">Todo el historial</option>
              <option value="DAY">Hoy</option>
              <option value="WEEK">Esta semana</option>
              <option value="MONTH">Este mes</option>
            </SelectInput>
            <SelectInput
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ALL">Todos los estados</option>
              <option value="PENDING_PAYMENT">Pendientes</option>
              <option value="PARTIALLY_PAID">Abonadas</option>
              <option value="PAID">Pagadas</option>
            </SelectInput>
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Facturas globales emitidas</h2>
            <p className="text-xs text-slate-500">{filtered.length} documento(s)</p>
          </div>
          {loading ? (
            <p className="p-5 text-sm font-bold text-slate-500">Cargando facturas…</p>
          ) : !filtered.length ? (
            <div className="p-4">
              <EmptyState text="No hay facturas globales con estos filtros." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Bodegas y cargos</th>
                    <th>Moneda</th>
                    <th>Total</th>
                    <th>Equivalente</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="font-mono text-xs font-black">
                        {invoice.document_number}
                      </td>
                      <td>
                        <strong>{invoice.customer_name}</strong>
                        <br />
                        <span className="text-xs text-slate-500">
                          {invoice.customer_email}
                        </span>
                      </td>
                      <td className="max-w-md text-xs">
                        {invoice.items.map((item) => item.description).join(" | ")}
                      </td>
                      <td className="font-black">USD / HNL</td>
                      <td className="font-black">
                        {currency === "HNL" && invoice.equivalent_total ? money(Number(invoice.equivalent_total), "HNL") : money(Number(invoice.total), invoice.currency)}
                      </td>
                      <td>
                        {invoice.equivalent_currency && invoice.equivalent_total
                          ? money(
                              Number(invoice.equivalent_total),
                              invoice.equivalent_currency,
                            )
                          : "—"}
                      </td>
                      <td>{shortDate(invoice.created_at)}</td>
                      <td>
                        <SelectInput
                          disabled={updatingId === invoice.id}
                          value={
                            invoice.status === "PAID"
                              ? "PAID"
                              : "PENDING_PAYMENT"
                          }
                          onChange={(event) =>
                            void updateStatus(
                              invoice,
                              event.target.value as "PAID" | "PENDING_PAYMENT",
                            )
                          }
                        >
                          <option value="PENDING_PAYMENT">Pendiente de pago</option>
                          <option value="PAID">Pagada</option>
                        </SelectInput>
                        <span className="mt-1 block text-[10px] font-black text-slate-500">
                          {statusLabel(invoice.status)}
                        </span>
                      </td>
                      <td>
                        <div className="flex min-w-max gap-2"><a className="inline-flex rounded-md border border-sky-200 px-3 py-2 text-xs font-black text-sky-700" href={`/api/billing/${invoice.id}/pdf?currency=USD&lang=en`} target="_blank">USD · English</a><a className="inline-flex rounded-md border border-sky-200 px-3 py-2 text-xs font-black text-sky-700" href={`/api/billing/${invoice.id}/pdf?currency=HNL&lang=es`} target="_blank">HNL · Español</a></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
