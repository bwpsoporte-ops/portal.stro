"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { ActionButton, EmptyState, MetricCard, SelectInput, TextInput } from "@/components/ui";
import { CaiRange, CaiStatus, caiRanges, invoices, shortDate } from "@/lib/dashboard-data";

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

const today = new Date("2026-05-05T00:00:00-06:00").getTime();
const statuses: ExtendedCaiStatus[] = ["ACTIVO", "INACTIVO", "VENCIDO", "AGOTADO", "BLOQUEADO"];

function available(range: ExtendedCaiRange) {
  return Math.max(range.final - range.current, 0);
}

function used(range: ExtendedCaiRange) {
  return Math.max(range.current - range.initial + 1, 0);
}

function consumedPercent(range: ExtendedCaiRange) {
  const total = Math.max(range.final - range.initial + 1, 1);
  return Math.min(100, Math.round((used(range) / total) * 100));
}

function daysLeft(range: ExtendedCaiRange) {
  return Math.ceil((new Date(`${range.limitDate}T00:00:00-06:00`).getTime() - today) / 86_400_000);
}

function buildInitialRanges(): ExtendedCaiRange[] {
  return caiRanges.map((range) => ({
    ...range,
    authorizedAt: range.status === "ACTIVO" ? "2026-04-01" : "2025-12-01",
    office: "Roatan Self Storage",
    notes: range.status === "ACTIVO" ? "Rango activo para facturación fiscal." : "Rango histórico agotado.",
  }));
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

function toNumber(value: string) {
  return Number(value.replaceAll("-", "").replace(/^0+/, "") || 0);
}

export default function CaiCorrelativosPage() {
  const [ranges, setRanges] = useState<ExtendedCaiRange[]>(buildInitialRanges);
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
    point: "002",
    office: "Principal",
    status: "INACTIVO",
    notes: "",
  });

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

  const addRange = () => {
    if (!form.cai || !form.initial || !form.final || !form.current || !form.limitDate) {
      setMessage("Completa CAI, rango inicial, rango final, correlativo actual y fecha límite.");
      return;
    }

    if (form.status === "ACTIVO" && ranges.some((range) => range.status === "ACTIVO" && range.documentType === form.documentType && range.branch === form.branch && range.point === form.point)) {
      setMessage("Regla fiscal: solo puede existir un CAI activo por tipo de documento, sucursal y punto de emisión.");
      return;
    }

    const nextRange: ExtendedCaiRange = {
      id: `cai-${Date.now()}`,
      cai: form.cai,
      initial: toNumber(form.initial),
      final: toNumber(form.final),
      current: toNumber(form.current),
      limitDate: form.limitDate,
      status: form.status,
      branch: form.branch,
      point: form.point,
      documentType: form.documentType,
      authorizedAt: form.authorizedAt,
      office: form.office,
      notes: form.notes,
    };

    setRanges((current) => [nextRange, ...current]);
    setMessage(`CAI ${form.cai} registrado correctamente. Los cambios aplican solo a nuevas facturas.`);
    setForm({ cai: "", initial: "", final: "", current: "", authorizedAt: "", limitDate: "", documentType: "01", branch: "001", point: "002", office: "Principal", status: "INACTIVO", notes: "" });
  };

  const updateStatus = (id: string, nextStatus: ExtendedCaiStatus) => {
    setRanges((current) =>
      current.map((range) => {
        if (range.id !== id) {
          return nextStatus === "ACTIVO" && range.status === "ACTIVO" ? { ...range, status: "INACTIVO" } : range;
        }
        return { ...range, status: nextStatus };
      }),
    );
    setMessage(`Rango actualizado a ${nextStatus}. El backend debe asignar correlativos con transacción para evitar duplicados.`);
  };

  const histories = useMemo<Record<string, HistoryRow[]>>(() => {
    return Object.fromEntries(
      ranges.map((range) => [
        range.id,
        [
          { id: `${range.id}-h1`, date: `${range.authorizedAt}T09:00:00-06:00`, user: "Contador", action: "CAI creado", previous: "-", next: String(range.initial), comment: range.notes || "Rango registrado en SAR." },
          { id: `${range.id}-h2`, date: "2026-05-02T09:18:00-06:00", user: "Sistema", action: "Correlativo consumido", previous: String(range.current - 1), next: String(range.current), invoice: invoices[0]?.number, comment: "Pago BAC aprobado; factura fiscal emitida." },
          { id: `${range.id}-h3`, date: "2026-05-05T08:00:00-06:00", user: "Sistema", action: "Revisión automática", previous: String(available(range) + 1), next: String(available(range)), comment: "Control de vencimientos y correlativos bajos." },
        ],
      ]),
    );
  }, [ranges]);

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

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-4 font-black text-slate-950">Registrar nuevo CAI</h2>
          <div className="grid gap-3 lg:grid-cols-4">
            <TextInput placeholder="CAI" value={form.cai} onChange={(event) => setForm({ ...form, cai: event.target.value })} />
            <TextInput placeholder="Rango inicial: 000-001-01-00000001" value={form.initial} onChange={(event) => setForm({ ...form, initial: event.target.value })} />
            <TextInput placeholder="Rango final: 000-001-01-00000500" value={form.final} onChange={(event) => setForm({ ...form, final: event.target.value })} />
            <TextInput placeholder="Correlativo actual" value={form.current} onChange={(event) => setForm({ ...form, current: event.target.value })} />
            <TextInput type="date" value={form.authorizedAt} onChange={(event) => setForm({ ...form, authorizedAt: event.target.value })} />
            <TextInput type="date" value={form.limitDate} onChange={(event) => setForm({ ...form, limitDate: event.target.value })} />
            <TextInput placeholder="Tipo documento" value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })} />
            <TextInput placeholder="Establecimiento" value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} />
            <TextInput placeholder="Punto de emisión" value={form.point} onChange={(event) => setForm({ ...form, point: event.target.value })} />
            <TextInput placeholder="Sucursal" value={form.office} onChange={(event) => setForm({ ...form, office: event.target.value })} />
            <SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ExtendedCaiStatus })}>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectInput>
            <TextInput placeholder="Notas" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
          <div className="mt-3">
            <ActionButton onClick={addRange}>Registrar nuevo CAI</ActionButton>
          </div>
        </section>

        {message ? <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{message}</div> : null}

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
                      <td>{range.initial}</td>
                      <td>{range.final}</td>
                      <td className="font-black">{range.current}</td>
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
                          <ActionButton variant="secondary" onClick={() => updateStatus(range.id, "INACTIVO")}>Desactivar</ActionButton>
                          <ActionButton variant="secondary" onClick={() => setMessage(`Edición habilitada solo si no hay facturas asociadas al CAI ${range.cai}.`)}>Editar rango</ActionButton>
                          <ActionButton variant="secondary" onClick={() => setHistoryFor(range.id)}>Ver historial</ActionButton>
                          <ActionButton variant="secondary" onClick={() => setMessage(`${invoices.filter((invoice) => invoice.cai === range.cai).length} facturas asociadas a este CAI.`)}>Ver facturas</ActionButton>
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
