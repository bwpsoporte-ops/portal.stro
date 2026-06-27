import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { MetricCard } from "@/components/ui";
import {
  activeCai,
  alerts,
  canGenerateInvoice,
  getAvailableCorrelatives,
  invoices,
  money,
  overview,
  payments,
  shortDate,
  storeganiseEvents,
} from "@/lib/dashboard-data";

export default function OverviewPage() {
  const validation = canGenerateInvoice();

  return (
    <>
      <PageHeader
        title="Overview"
        description="Vista general del sistema: facturación, pagos BAC, CAI, correo, alertas e integración con Storeganise."
      />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total facturado hoy" value={money(overview.billedToday)} hint="Facturas emitidas el 2 de mayo de 2026" />
          <MetricCard label="Total facturado del mes" value={money(overview.billedMonth)} hint="Acumulado mensual" />
          <MetricCard label="Pagos BAC aprobados" value={String(overview.approvedPayments)} hint="Transacciones confirmadas" />
          <MetricCard label="Pagos BAC pendientes" value={String(overview.pendingPayments)} hint="Requieren validación" />
          <MetricCard label="Facturas generadas" value={String(overview.generatedInvoices)} hint="Documentos fiscales guardados" />
          <MetricCard label="Facturas enviadas" value={String(overview.sentInvoices)} hint="Correos entregados o aceptados" />
          <MetricCard label="Correlativos disponibles" value={String(getAvailableCorrelatives())} hint={activeCai?.cai ?? "Sin CAI activo"} />
          <MetricCard label="Alertas críticas" value={String(overview.criticalAlerts)} hint="Pendientes de resolver" />
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">CAI activo</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">{activeCai?.cai ?? "No configurado"}</h2>
              <p className="mt-1 text-sm text-slate-500">{validation.reason}</p>
            </div>
            <StatusBadge tone={validation.ok ? "green" : "red"}>{validation.ok ? "LISTO PARA FACTURAR" : "BLOQUEADO"}</StatusBadge>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-3">
          <section className="rounded-lg border border-slate-200 bg-white xl:col-span-2">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-black text-slate-950">Últimos pagos BAC</h2>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th>Referencia</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.slice(0, 5).map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.client}</td>
                      <td className="font-bold">{money(payment.amount)}</td>
                      <td><StatusBadge tone={statusTone(payment.status)}>{payment.status}</StatusBadge></td>
                      <td>{payment.bacReference}</td>
                      <td>{shortDate(payment.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="font-black text-slate-950">Estado de Storeganise</h2>
              <p className="mt-1 text-sm text-slate-500">{overview.storeganiseStatus}</p>
            </div>
            <div className="divide-y divide-slate-200">
              {storeganiseEvents.slice(0, 4).map((event) => (
                <div key={event.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-slate-900">{event.event}</p>
                    <StatusBadge tone={statusTone(event.status)}>{event.status}</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{shortDate(event.receivedAt)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Últimas facturas emitidas</h2>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Correo</th>
                  <th>Emisión</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 5).map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-mono">{invoice.number}</td>
                    <td>{invoice.client}</td>
                    <td className="font-bold">{money(invoice.total)}</td>
                    <td><StatusBadge tone={statusTone(invoice.emailStatus)}>{invoice.emailStatus}</StatusBadge></td>
                    <td>{shortDate(invoice.issuedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Alertas críticas</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {alerts.filter((alert) => alert.level === "CRITICAL" || alert.level === "WARNING").map((alert) => (
              <div key={alert.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold text-slate-950">{alert.title}</p>
                  <p className="text-sm text-slate-500">{alert.message}</p>
                </div>
                <StatusBadge tone={statusTone(alert.level)}>{alert.level}</StatusBadge>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
