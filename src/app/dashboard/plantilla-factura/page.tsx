"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ActionButton, SelectInput, TextInput } from "@/components/ui";
import { money } from "@/lib/dashboard-data";

type Template = {
  logo: string;
  tradeName: string;
  legalName: string;
  rtn: string;
  address: string;
  phone: string;
  email: string;
  primaryColor: string;
  headerDesign: "clasico" | "compacto" | "moderno";
  legalText: string;
  footer: string;
};

const initialTemplate: Template = {
  logo: "",
  tradeName: "Roatan Self Storage",
  legalName: "Roatan Self Storage S. de R.L.",
  rtn: "08019012345678",
  address: "Coxen Hole, Roatán, Islas de la Bahía, Honduras",
  phone: "+504 2400-0000",
  email: "facturacion@roatanselfstorage.hn",
  primaryColor: "#0f766e",
  headerDesign: "moderno",
  legalText: "La factura es beneficio de todos, exíjala.",
  footer: "Original: Adquiriente | Copia: Emisor",
};

const TEMPLATE_STORAGE_KEY = "rss-invoice-template";

const previewInvoice = {
  number: "001-002-01-00000001",
  client: "Cliente de ejemplo",
  rtn: "08019000000000",
  email: "cliente@empresa.com",
  bacReference: "BAC-EJEMPLO",
};

const previewCai = {
  cai: "CAI-DE-EJEMPLO-000000-000000-000000",
  initial: 1,
  final: 1000,
  limitDate: "2026-12-31",
};

const sampleItems = [
  { description: "Alquiler mensual de unidad climatizada", quantity: 1, unitPrice: 10826.09 },
  { description: "Seguro y administración del servicio", quantity: 1, unitPrice: 0 },
];

export default function PlantillaFacturaPage() {
  const [template, setTemplate] = useState<Template>(() => {
    if (typeof window === "undefined") return initialTemplate;

    const savedTemplate = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!savedTemplate) return initialTemplate;

    try {
      return { ...initialTemplate, ...(JSON.parse(savedTemplate) as Partial<Template>) };
    } catch {
      window.localStorage.removeItem(TEMPLATE_STORAGE_KEY);
      return initialTemplate;
    }
  });
  const [saved, setSaved] = useState(false);

  const subtotal = useMemo(() => sampleItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), []);
  const isv = subtotal * 0.15;
  const total = subtotal + isv;

  const update = (field: keyof Template, value: string) => {
    setSaved(false);
    setTemplate((current) => ({ ...current, [field]: value }));
  };

  const uploadLogo = (file?: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      update("logo", String(reader.result ?? ""));
    };
    reader.readAsDataURL(file);
  };

  const saveTemplate = () => {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(template));
    setSaved(true);
  };

  return (
    <>
      <PageHeader
        title="Plantilla de Factura"
        description="Configura el PDF que recibe el cliente: logo, empresa, cliente, CAI, rango autorizado, totales, referencia BAC, texto legal y pie de página."
        actions={
          <>
            <ActionButton variant="secondary" onClick={() => window.print()}>Vista previa PDF</ActionButton>
            <ActionButton onClick={saveTemplate}>Guardar plantilla</ActionButton>
          </>
        }
      />

      <div className="grid gap-5 p-5 xl:grid-cols-[420px_1fr]">
        <section className="no-print space-y-5">
          {saved ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Plantilla guardada correctamente.</div> : null}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-4 font-black text-slate-950">Datos de empresa</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-2 block text-xs font-black uppercase text-slate-500">Logo de la factura</label>
                <div className="rounded-lg border border-dashed border-sky-200 bg-sky-50/60 p-4">
                  {template.logo ? (
                    <div className="mb-3 flex items-center gap-3">
                      <img src={template.logo} alt="Logo cargado" className="h-14 w-24 rounded-md bg-white object-contain p-2 shadow-sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">Imagen cargada</p>
                        <p className="text-xs text-slate-500">Se usará en la vista previa del PDF.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <p className="text-sm font-black text-slate-900">Sube el logo manualmente</p>
                      <p className="text-xs text-slate-500">PNG, JPG o WEBP desde tu computadora.</p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-md bg-sky-500 px-3 py-2 text-sm font-black text-white shadow-sm shadow-sky-900/20 transition hover:bg-sky-600">
                      Seleccionar imagen
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={(event) => uploadLogo(event.target.files?.[0])}
                      />
                    </label>
                    {template.logo ? (
                      <button
                        type="button"
                        onClick={() => update("logo", "")}
                        className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-black text-sky-700 transition hover:bg-sky-50"
                      >
                        Quitar imagen
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <TextInput placeholder="Nombre comercial" value={template.tradeName} onChange={(event) => update("tradeName", event.target.value)} />
              <TextInput placeholder="Razón social" value={template.legalName} onChange={(event) => update("legalName", event.target.value)} />
              <TextInput placeholder="RTN empresa" value={template.rtn} onChange={(event) => update("rtn", event.target.value)} />
              <TextInput placeholder="Dirección" value={template.address} onChange={(event) => update("address", event.target.value)} />
              <TextInput placeholder="Teléfono" value={template.phone} onChange={(event) => update("phone", event.target.value)} />
              <TextInput placeholder="Correo" value={template.email} onChange={(event) => update("email", event.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-4 font-black text-slate-950">Diseño</h2>
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-slate-500">Color principal</label>
              <div className="grid grid-cols-[56px_1fr] gap-3">
                <input type="color" value={template.primaryColor} onChange={(event) => update("primaryColor", event.target.value)} className="h-10 w-14 rounded-md border border-slate-200" />
                <TextInput value={template.primaryColor} onChange={(event) => update("primaryColor", event.target.value)} />
              </div>
              <label className="block text-xs font-bold uppercase text-slate-500">Diseño de encabezado</label>
              <SelectInput value={template.headerDesign} onChange={(event) => update("headerDesign", event.target.value)}>
                <option value="moderno">Moderno</option>
                <option value="clasico">Clásico</option>
                <option value="compacto">Compacto</option>
              </SelectInput>
              <textarea
                value={template.legalText}
                onChange={(event) => update("legalText", event.target.value)}
                className="h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
                placeholder="Texto legal"
              />
              <TextInput placeholder="Pie de página" value={template.footer} onChange={(event) => update("footer", event.target.value)} />
            </div>
          </div>
        </section>

        <section className="print-area rounded-lg border border-slate-200 bg-slate-200 p-4 md:p-8">
          <div className="print-page mx-auto min-h-[980px] max-w-[820px] bg-white p-8 shadow-sm md:p-12">
            <header
              className={`border-b pb-6 ${template.headerDesign === "compacto" ? "flex items-center justify-between" : "grid gap-6 md:grid-cols-2"}`}
              style={{ borderColor: template.primaryColor }}
            >
              <div>
                {template.logo ? <img src={template.logo} alt="Logo" className="mb-4 h-16 max-w-48 object-contain" /> : null}
                <h2 className="text-2xl font-black" style={{ color: template.primaryColor }}>{template.tradeName}</h2>
                <p className="mt-1 text-sm font-bold text-slate-700">{template.legalName}</p>
                <p className="mt-2 text-sm text-slate-500">RTN: {template.rtn}</p>
                <p className="text-sm text-slate-500">{template.address}</p>
                <p className="text-sm text-slate-500">{template.phone} | {template.email}</p>
              </div>
              <div className="text-left md:text-right">
                <h1 className="text-4xl font-black uppercase tracking-normal" style={{ color: template.primaryColor }}>Factura</h1>
                <p className="mt-2 font-mono text-sm text-slate-600">No. {previewInvoice.number}</p>
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase text-slate-500">CAI visible</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-800">{previewCai.cai}</p>
                </div>
              </div>
            </header>

            <section className="grid gap-6 border-b border-slate-200 py-6 md:grid-cols-2">
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Datos del cliente</p>
                <h3 className="mt-2 text-lg font-black text-slate-950">{previewInvoice.client}</h3>
                <p className="text-sm text-slate-600">RTN: {previewInvoice.rtn}</p>
                <p className="text-sm text-slate-600">{previewInvoice.email}</p>
              </div>
              <div className="md:text-right">
                <p className="text-sm text-slate-600">Fecha de emisión: 02/05/2026</p>
                <p className="text-sm text-slate-600">Referencia BAC: {previewInvoice.bacReference}</p>
                <p className="text-sm text-slate-600">Rango autorizado: 001-002-01-{String(previewCai.initial).padStart(8, "0")} al 001-002-01-{String(previewCai.final).padStart(8, "0")}</p>
                <p className="text-sm text-slate-600">Fecha límite: {previewCai.limitDate}</p>
              </div>
            </section>

            <section className="py-6">
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
                  {sampleItems.map((item) => (
                    <tr key={item.description}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{money(item.unitPrice)}</td>
                      <td className="font-bold">{money(item.quantity * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="ml-auto w-full max-w-sm space-y-3">
              <div className="flex justify-between text-sm"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
              <div className="flex justify-between text-sm"><span>ISV 15%</span><strong>{money(isv)}</strong></div>
              <div className="flex justify-between rounded-md p-4 text-lg font-black text-white" style={{ backgroundColor: template.primaryColor }}>
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
            </section>

            <footer className="mt-16 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
              <p className="font-bold" style={{ color: template.primaryColor }}>{template.legalText}</p>
              <p className="mt-2">{template.footer}</p>
            </footer>
          </div>
        </section>
      </div>
    </>
  );
}
