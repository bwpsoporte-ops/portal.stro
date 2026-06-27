"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { ActionButton, EmptyState, SelectInput, TextInput } from "@/components/ui";
import { Invoice, activeCai, invoices, money, shortDate } from "@/lib/dashboard-data";

function InvoicePrintPage({ invoice }: { invoice: Invoice }) {
  return (
    <div className="print-area hidden">
      <article className="print-page bg-white text-slate-900">
        <header className="grid grid-cols-[1fr_auto] gap-6 border-b border-teal-700 pb-5">
          <div>
            <h2 className="text-2xl font-black text-teal-700">Roatan Self Storage</h2>
            <p className="mt-1 text-sm font-bold">Roatan Self Storage S. de R.L.</p>
            <p className="mt-2 text-sm text-slate-600">RTN: 08019012345678</p>
            <p className="text-sm text-slate-600">Coxen Hole, Roatan, Islas de la Bahia, Honduras</p>
            <p className="text-sm text-slate-600">+504 2400-0000 | facturacion@roatanselfstorage.hn</p>
          </div>
          <div className="text-right">
            <h1 className="text-4xl font-black uppercase text-teal-700">Factura</h1>
            <p className="mt-2 font-mono text-sm text-slate-600">No. {invoice.number}</p>
            <div className="mt-4 max-w-72 rounded-md border border-slate-200 bg-slate-50 p-3 text-left">
              <p className="text-xs font-black uppercase text-slate-500">CAI</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-800">{invoice.cai}</p>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 border-b border-slate-200 py-5">
          <div>
            <p className="text-xs font-black uppercase text-slate-500">Datos del cliente</p>
            <h3 className="mt-2 text-lg font-black text-slate-950">{invoice.client}</h3>
            <p className="text-sm text-slate-600">RTN: {invoice.rtn}</p>
            <p className="text-sm text-slate-600">{invoice.email}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-600">Fecha de emision: {shortDate(invoice.issuedAt)}</p>
            <p className="text-sm text-slate-600">Referencia BAC: {invoice.bacReference}</p>
            <p className="text-sm text-slate-600">
              Rango autorizado: 001-002-01-{String(activeCai?.initial).padStart(8, "0")} al 001-002-01-{String(activeCai?.final).padStart(8, "0")}
            </p>
            <p className="text-sm text-slate-600">Fecha limite: {activeCai?.limitDate}</p>
          </div>
        </section>

        <section className="py-5">
          <table>
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Alquiler mensual de unidad de almacenamiento</td>
                <td>1</td>
                <td>{money(invoice.amount)}</td>
                <td className="font-bold">{money(invoice.amount)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="ml-auto w-full max-w-sm space-y-3">
          <div className="flex justify-between text-sm"><span>Subtotal</span><strong>{money(invoice.amount)}</strong></div>
          <div className="flex justify-between text-sm"><span>ISV 15%</span><strong>{money(invoice.isv)}</strong></div>
          <div className="flex justify-between rounded-md bg-teal-700 p-4 text-lg font-black text-white">
            <span>Total</span>
            <span>{money(invoice.total)}</span>
          </div>
        </section>

        <footer className="mt-16 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
          <p className="font-bold text-teal-700">La factura es beneficio de todos, exijala.</p>
          <p className="mt-2">Original: Adquiriente | Copia: Emisor</p>
        </footer>
      </article>
    </div>
  );
}

export default function FacturasPage() {
  const [client, setClient] = useState("");
  const [status, setStatus] = useState("TODOS");
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);

  const filtered = useMemo(() => {
    return invoices.filter((invoice) => {
      const matchClient = invoice.client.toLowerCase().includes(client.toLowerCase()) || invoice.email.toLowerCase().includes(client.toLowerCase());
      const matchStatus = status === "TODOS" || invoice.emailStatus === status;
      const matchDate = !date || invoice.issuedAt.startsWith(date);
      return matchClient && matchStatus && matchDate;
    });
  }, [client, status, date]);

  useEffect(() => {
    if (!invoiceToPrint) return;

    const clearInvoice = () => setInvoiceToPrint(null);
    window.addEventListener("afterprint", clearInvoice, { once: true });
    const printTimer = window.setTimeout(() => window.print(), 80);

    return () => {
      window.clearTimeout(printTimer);
      window.removeEventListener("afterprint", clearInvoice);
    };
  }, [invoiceToPrint]);

  const downloadInvoice = (invoice: Invoice) => {
    setMessage(`PDF de factura ${invoice.number} preparado para descarga.`);
    setInvoiceToPrint(invoice);
  };

  const resendInvoice = (number: string, email: string) => {
    setMessage(`Factura ${number} reenviada a ${email}.`);
  };

  return (
    <>
      <PageHeader
        title="Facturas"
        description="Solo consulta de facturas generadas automáticamente después de pagos confirmados. Aquí no se crean facturas manualmente."
      />
      <div className="space-y-5 p-5">
        <section className="no-print grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
          <TextInput placeholder="Filtrar por cliente o correo" value={client} onChange={(event) => setClient(event.target.value)} />
          <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="TODOS">Todos los estados</option>
            <option value="ENVIADA">Enviada</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="FALLIDA">Fallida</option>
          </SelectInput>
          <ActionButton variant="secondary" onClick={() => { setClient(""); setStatus("TODOS"); setDate(""); }}>
            Limpiar filtros
          </ActionButton>
        </section>

        {message ? <div className="no-print rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{message}</div> : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">Listado de facturas generadas</h2>
          </div>
          {filtered.length === 0 ? (
            <div className="p-4"><EmptyState text="No hay facturas con esos filtros." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>RTN</th>
                    <th>Correo</th>
                    <th>Monto</th>
                    <th>ISV</th>
                    <th>Total</th>
                    <th>CAI / Correlativo</th>
                    <th>Emisión</th>
                    <th>Correo</th>
                    <th>Referencia BAC</th>
                    <th className="no-print">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="font-mono">{invoice.number}</td>
                      <td className="font-bold text-slate-900">{invoice.client}</td>
                      <td>{invoice.rtn}</td>
                      <td>{invoice.email}</td>
                      <td>{money(invoice.amount)}</td>
                      <td>{money(invoice.isv)}</td>
                      <td className="font-black">{money(invoice.total)}</td>
                      <td>
                        <p className="font-mono text-xs">{invoice.cai}</p>
                        <p className="mt-1 text-xs text-slate-500">{invoice.correlative}</p>
                      </td>
                      <td>{shortDate(invoice.issuedAt)}</td>
                      <td><StatusBadge tone={statusTone(invoice.emailStatus)}>{invoice.emailStatus}</StatusBadge></td>
                      <td>{invoice.bacReference}</td>
                      <td className="no-print">
                        <div className="flex gap-2">
                          <ActionButton variant="secondary" onClick={() => downloadInvoice(invoice)}>PDF</ActionButton>
                          <ActionButton variant="secondary" onClick={() => resendInvoice(invoice.number, invoice.email)}>Reenviar</ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {invoiceToPrint ? <InvoicePrintPage invoice={invoiceToPrint} /> : null}
    </>
  );
}
