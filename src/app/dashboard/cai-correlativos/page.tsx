"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { ActionButton, EmptyState, MetricCard, TextInput } from "@/components/ui";
import { CaiRange, CaiStatus, shortDate } from "@/lib/dashboard-data";

type ExtendedCaiStatus = CaiStatus | "BLOQUEADO";

type CaiForm = {
  cai: string;
  initial: string;
  final: string;
  current: string;
  authorizedAt: string;
  limitDate: string;
  documentType: string;
  branch: string;
  point: string;
  office: string;
  status: ExtendedCaiStatus;
  notes: string;
};

type ExtendedCaiRange = Omit<CaiRange, "status"> & {
  status: ExtendedCaiStatus;
  authorizedAt: string;
  office: string;
  notes: string;
};

type HistoryRow = {
  id: string;
  date: string;
  user: string;
  action: string;
  previous: string;
  next: string;
  invoice?: string;
  comment: string;
};

type DatabaseRange = {
  id: string; cai: string; range_start: number; range_end: number; current_number: number;
  expiration_date: string; authorization_date: string; status: string; document_type: string;
  establishment: string; emission_point: string; branch: string;
};

type FiscalDocument = {
  id: string; document_number: string; cai: string; fiscal_correlative: number;
  created_at: string; customer_name: string; total: string; currency: string;
};

function inputIsoDate(input: HTMLInputElement) {
  const selected = input.valueAsDate;
  return selected && !Number.isNaN(selected.getTime())
    ? selected.toISOString().slice(0, 10)
    : input.value;
}

const today = () => Date.now();
function available(range: ExtendedCaiRange) {
  return Math.max(range.final - range.current + 1, 0);
}

function used(range: ExtendedCaiRange) {
  return Math.max(range.current - range.initial, 0);
}

function consumedPercent(range: ExtendedCaiRange) {
  const total = Math.max(range.final - range.initial + 1, 1);
  return Math.min(100, Math.round((used(range) / total) * 100));
}

function daysLeft(range: ExtendedCaiRange) {
  return Math.ceil((new Date(`${range.limitDate}T23:59:59-06:00`).getTime() - today()) / 86_400_000);
}

function fiscalNumber(range: ExtendedCaiRange, value: number) {
  return `${range.branch}-${range.point}-${range.documentType}-${String(value).padStart(8, "0")}`;
}

function rangeAlerts(range: ExtendedCaiRange) {
  const alerts: string[] = [];
  const remaining = daysLeft(range);
  const count = available(range);

  if (range.status === "ACTIVO" && [30, 15, 7].some((day) => remaining <= day)) alerts.push(`CAI vence en ${remaining} días`);
  if (remaining < 0 || range.status === "VENCIDO") alerts.push("CAI vencido");
  if (count <= 100 && count > 50) alerts.push("Quedan 100 correlativos o menos");
  if (count <= 50 && count > 25) alerts.push("Quedan 50 correlativos o menos");
  if (count <= 25 && count > 0) alerts.push("Quedan 25 correlativos o menos");
  if (count <= 0 || range.status === "AGOTADO") alerts.push("Rango agotado");

  return alerts;
}

export default function CaiCorrelativosPage() {
  const [ranges, setRanges] = useState<ExtendedCaiRange[]>([]);
  const [fiscalDocuments, setFiscalDocuments] = useState<FiscalDocument[]>([]);
  const [message, setMessage] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [form, setForm] = useState<CaiForm>({
    cai: "",
    initial: "",
    final: "",
    current: "",
    authorizedAt: "",
    limitDate: "",
    documentType: "01",
    branch: "001",
    point: "001",
    office: "Principal",
    status: "ACTIVO",
    notes: "",
  });

  const loadFiscalData = useCallback(async () => {
    const response = await fetch("/api/fiscal", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "No se pudo cargar la configuración fiscal.");
    const statusFromDatabase: Record<string, ExtendedCaiStatus> = {
      ACTIVE: "ACTIVO", INACTIVE: "INACTIVO", EXPIRED: "VENCIDO",
      EXHAUSTED: "AGOTADO", BLOCKED: "BLOQUEADO",
    };
    setRanges((data.ranges as DatabaseRange[]).map((range) => ({
      id: range.id,
      cai: range.cai,
      initial: Number(range.range_start),
      final: Number(range.range_end),
      current: Number(range.current_number),
      limitDate: String(range.expiration_date).slice(0, 10),
      status: statusFromDatabase[range.status] ?? "INACTIVO",
      branch: range.establishment,
      point: range.emission_point,
      documentType: range.document_type,
      authorizedAt: String(range.authorization_date).slice(0, 10),
      office: range.branch,
      notes: "",
    })));
    setFiscalDocuments(data.documents ?? []);
  }, []);

  useEffect(() => {
    void loadFiscalData().catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar."));
  }, [loadFiscalData]);

  const active = useMemo(() => ranges.find((range) => range.status === "ACTIVO"), [ranges]);
  const criticalAlerts = useMemo(() => ranges.flatMap(rangeAlerts).filter((alert) => alert.includes("vencido") || alert.includes("agotado") || alert.includes("25")).length, [ranges]);

  const metrics = useMemo(() => {
    const totalUsed = ranges.reduce((sum, range) => sum + used(range), 0);
    const totalAvailable = ranges.reduce((sum, range) => sum + available(range), 0);
    const totalCapacity = totalUsed + totalAvailable || 1;
    return {
      activeCai: active?.cai ?? "Sin CAI activo",
      limitDate: active?.limitDate ?? "No configurado",
      used: totalUsed,
      available: totalAvailable,
      percent: Math.round((totalUsed / totalCapacity) * 100),
      activeRanges: ranges.filter((range) => range.status === "ACTIVO").length,
      expiredRanges: ranges.filter((range) => range.status === "VENCIDO" || daysLeft(range) < 0).length,
      depletedRanges: ranges.filter((range) => range.status === "AGOTADO" || available(range) <= 0).length,
    };
  }, [active, ranges]);

  const addRange = async () => {
    if (!form.cai || !form.initial || !form.final || !form.current || !form.authorizedAt || !form.limitDate) {
      setMessage("Completa CAI, fecha de autorización, fecha límite, rango inicial, rango final y correlativo actual.");
      return;
    }

    const response = await fetch("/api/fiscal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "cai", range: form }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.message || "No se pudo registrar el CAI.");
      return;
    }
    if (!result.range?.id || result.range.status !== "ACTIVE") {
      setMessage("El servidor no confirmó el CAI activo. No se creó ningún correlativo.");
      return;
    }
    await loadFiscalData();
    setMessage(`CAI ${form.cai} registrado y activado correctamente. Caja ya puede consumir sus correlativos.`);
    setForm({ cai: "", initial: "", final: "", current: "", authorizedAt: "", limitDate: "", documentType: "01", branch: "001", point: "001", office: "Principal", status: "ACTIVO", notes: "" });
  };

  const updateStatus = async (id: string, nextStatus: ExtendedCaiStatus) => {
    const response = await fetch("/api/fiscal", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status: nextStatus }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.message || "No se pudo actualizar el rango.");
      return;
    }
    await loadFiscalData();
    setMessage(`Rango actualizado a ${nextStatus}. Las nuevas facturas usarán esta configuración.`);
  };

  const histories = useMemo<Record<string, HistoryRow[]>>(() => {
    return Object.fromEntries(
      ranges.map((range) => [
        range.id,
        fiscalDocuments.filter((document) => document.cai === range.cai).map((document) => ({
          id: document.id,
          date: document.created_at,
          user: "Sistema",
          action: "Correlativo consumido",
          previous: String(Math.max(document.fiscal_correlative - 1, 0)),
          next: String(document.fiscal_correlative),
          invoice: document.document_number,
          comment: `Factura emitida a ${document.customer_name} por ${document.currency} ${Number(document.total).toFixed(2)}.`,
        })),
      ]),
    );
  }, [fiscalDocuments, ranges]);

  const visibleHistory = historyFor ? histories[historyFor] ?? [] : [];

  return (
    <>
      <PageHeader
        title="CAI / Correlativos"
        description="Administración fiscal de CAI, rangos autorizados, correlativos disponibles, vencimientos y control de emisión de facturas."
      />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="CAI activo" value={metrics.activeCai} hint="Único por documento/sucursal/punto" />
          <MetricCard label="Fecha límite" value={metrics.limitDate} hint="Bloquea si está vencido" />
          <MetricCard label="Correlativos usados" value={String(metrics.used)} hint="Consumidos por facturas" />
          <MetricCard label="Correlativos disponibles" value={String(metrics.available)} hint="Capacidad restante" />
          <MetricCard label="Porcentaje consumido" value={`${metrics.percent}%`} hint="Uso fiscal acumulado" />
          <MetricCard label="Rangos activos" value={String(metrics.activeRanges)} hint="Debe existir solo uno por serie" />
          <MetricCard label="Rangos vencidos" value={String(metrics.expiredRanges)} hint="No permiten emitir" />
          <MetricCard label="Alertas críticas" value={String(criticalAlerts)} hint="Vencimiento o rango agotado" />
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Regla fiscal de emisión</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                {active && daysLeft(active) >= 0 && available(active) > 0 ? "Facturación permitida" : "Facturación bloqueada"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">El consumo de correlativo debe hacerse con bloqueo transaccional del CAI activo.</p>
            </div>
            <StatusBadge tone={active && daysLeft(active) >= 0 && available(active) > 0 ? "green" : "red"}>
              {active && daysLeft(active) >= 0 && available(active) > 0 ? "PERMITIDO" : "BLOQUEADO"}
            </StatusBadge>
          </div>
        </section>

        <form className="rounded-lg border border-slate-200 bg-white p-4" onSubmit={(event) => { event.preventDefault(); void addRange(); }}>
          <h2 className="mb-4 font-black text-slate-950">Registrar nuevo CAI</h2>
          <p className="mb-4 text-sm text-slate-600">Escribe los rangos completos autorizados. El sistema detectará automáticamente establecimiento, punto de emisión y tipo de documento, y dejará este CAI activo para Caja.</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-black text-slate-700">CAI<TextInput required placeholder="Escribe el CAI autorizado" value={form.cai} onChange={(event) => setForm({ ...form, cai: event.target.value.toUpperCase() })} /></label>
            <label className="text-xs font-black text-slate-700">Fecha de autorización<TextInput required type="date" value={form.authorizedAt} onChange={(event) => setForm({ ...form, authorizedAt: inputIsoDate(event.currentTarget) })} /></label>
            <label className="text-xs font-black text-slate-700">Fecha límite de emisión<TextInput required type="date" value={form.limitDate} onChange={(event) => setForm({ ...form, limitDate: inputIsoDate(event.currentTarget) })} /></label>
            <label className="text-xs font-black text-slate-700">Rango inicial<TextInput required inputMode="numeric" placeholder="Ejemplo: 1" value={form.initial} onChange={(event) => setForm({ ...form, initial: event.target.value, current: form.current || event.target.value })} /></label>
            <label className="text-xs font-black text-slate-700">Rango final<TextInput required inputMode="numeric" placeholder="Ejemplo: 1000" value={form.final} onChange={(event) => setForm({ ...form, final: event.target.value })} /></label>
            <label className="text-xs font-black text-slate-700">Próximo correlativo a utilizar<TextInput required inputMode="numeric" placeholder="Ejemplo: 1" value={form.current} onChange={(event) => setForm({ ...form, current: event.target.value })} /></label>
          </div>
          <div className="mt-3">
            <ActionButton type="submit">Registrar y activar CAI</ActionButton>
          </div>
          {message ? <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{message}</div> : null}
        </form>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Tabla de CAI / Correlativos</h2>
            <p className="mt-1 text-sm text-slate-500">No se debe editar una factura ya emitida para cambiarle CAI o correlativo.</p>
          </div>
          {ranges.length === 0 ? (
            <div className="p-4"><EmptyState text="No hay rangos CAI registrados." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>CAI</th>
                    <th>Rango inicial</th>
                    <th>Rango final</th>
                    <th>Correlativo actual</th>
                    <th>Disponibles</th>
                    <th>Usados</th>
                    <th>Fecha límite</th>
                    <th>Estado</th>
                    <th>Alertas</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ranges.map((range) => (
                    <tr key={range.id}>
                      <td className="min-w-72 font-mono text-xs">{range.cai}</td>
                      <td className="font-mono text-xs">{fiscalNumber(range, range.initial)}</td>
                      <td className="font-mono text-xs">{fiscalNumber(range, range.final)}</td>
                      <td className="font-mono text-xs font-black">{fiscalNumber(range, range.current)}</td>
                      <td>{available(range)}</td>
                      <td>{used(range)} ({consumedPercent(range)}%)</td>
                      <td>{range.limitDate}</td>
                      <td><StatusBadge tone={statusTone(range.status)}>{range.status}</StatusBadge></td>
                      <td className="min-w-64">
                        {rangeAlerts(range).length ? rangeAlerts(range).map((alert) => <p key={alert} className="text-xs font-bold text-rose-700">{alert}</p>) : <p className="text-xs font-bold text-emerald-700">Sin alertas</p>}
                      </td>
                      <td>
                        <div className="flex min-w-[560px] flex-wrap gap-2">
                          <ActionButton variant="secondary" onClick={() => updateStatus(range.id, "ACTIVO")}>Activar</ActionButton>
                          <ActionButton variant="danger" onClick={() => {
                            if (window.confirm(`¿Dar de baja el CAI ${range.cai}? Caja dejará de utilizar este rango.`)) {
                              void updateStatus(range.id, "INACTIVO");
                            }
                          }}>Dar de baja</ActionButton>
                          <ActionButton variant="secondary" onClick={() => setMessage(`Edición habilitada solo si no hay facturas asociadas al CAI ${range.cai}.`)}>Editar rango</ActionButton>
                          <ActionButton variant="secondary" onClick={() => setHistoryFor(range.id)}>Ver historial</ActionButton>
                          <ActionButton variant="secondary" onClick={() => setMessage(`${fiscalDocuments.filter((invoice) => invoice.cai === range.cai).length} facturas asociadas a este CAI.`)}>Ver facturas</ActionButton>
                          <ActionButton variant="secondary" onClick={() => updateStatus(range.id, "AGOTADO")}>Agotado</ActionButton>
                          <ActionButton onClick={() => updateStatus(range.id, "BLOQUEADO")}>Bloquear</ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {historyFor ? (
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-black text-slate-950">Historial del CAI</h2>
                <p className="mt-1 text-sm text-slate-500">Auditoría de cambios, consumo de correlativos y acciones fiscales.</p>
              </div>
              <ActionButton variant="secondary" onClick={() => setHistoryFor(null)}>Cerrar historial</ActionButton>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Anterior</th>
                    <th>Nuevo</th>
                    <th>Factura relacionada</th>
                    <th>Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{shortDate(row.date)}</td>
                      <td>{row.user}</td>
                      <td className="font-bold text-slate-900">{row.action}</td>
                      <td>{row.previous}</td>
                      <td>{row.next}</td>
                      <td className="font-mono">{row.invoice ?? "-"}</td>
                      <td>{row.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
