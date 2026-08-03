"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ActionButton, SelectInput, TextInput } from "@/components/ui";

type Template = {
  logo: string;
  tradeName: string;
  legalName: string;
  rtn: string;
  address: string;
  headOfficeAddress: string;
  establishmentAddress: string;
  phone: string;
  email: string;
  primaryColor: string;
  headerDesign: "clasico" | "compacto" | "moderno";
  legalText: string;
  footer: string;
};

const initialTemplate: Template = {
  logo: "",
  tradeName: "BODEGAS SEGURAS ROATAN",
  legalName: "BODEGAS SEGURAS ROATAN SOCIEDAD DE RESPONSABILIDAD LIMITADA",
  rtn: "08019024613041",
  address: "COLONIA SAN CARLOS AVENIDA REPUBLICA DE COLOMBIA una cuadra atras de la embajada de los estados unidos. FRANCISCO MORAZÁN DISTRITO CENTRAL",
  headOfficeAddress: "COLONIA SAN CARLOS AVENIDA REPUBLICA DE COLOMBIA una cuadra atras de la embajada de los estados unidos. FRANCISCO MORAZÁN DISTRITO CENTRAL",
  establishmentAddress: "COLONIA SAN CARLOS AVENIDA REPUBLICA DE COLOMBIA - REFERENCIA DEL DOMICILIO: una cuadra atras de la embajada de los estados unidos.",
  phone: "98721324",
  email: "bdesol@des.hn",
  primaryColor: "#004B13",
  headerDesign: "moderno",
  legalText: "La factura es beneficio de todos, exíjala.",
  footer: "Original: Adquiriente | Copia: Emisor",
};

const TEMPLATE_STORAGE_KEY = "rss-invoice-template";

const previewInvoice = {
  number: "000-001-01-00000001",
  client: "Cliente de ejemplo",
  rtn: "08019000000000",
  email: "cliente@empresa.com",
};

const previewCai = {
  cai: "560A6F-CE7444-46FEE0-63BE03-09094F-1B",
  establishment: "000",
  emissionPoint: "001",
  documentType: "01",
  initial: 1,
  final: 1000,
  limitDate: "07/07/2027",
};

const sampleItems = [
  { description: "Alquiler de unidad de almacenamiento F01 por 30 días", quantity: 1, unitPrice: 955, discount: 0, taxRate: 15 },
];

type FiscalPreview = typeof previewCai;
const usd = (value: number) => `USD ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hnl = (value: number) => `L ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const [fiscalPreview, setFiscalPreview] = useState<FiscalPreview>(previewCai);
  const [exchangeRate, setExchangeRate] = useState(26.78);

  useEffect(() => {
    const loadTemplate = async () => {
      const response = await fetch("/api/fiscal", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.template) return;
      const stored = data.template;
      setTemplate({
        logo: stored.logo_url ?? "",
        tradeName: stored.trade_name ?? initialTemplate.tradeName,
        legalName: stored.legal_name ?? initialTemplate.legalName,
        rtn: stored.rtn ?? initialTemplate.rtn,
        address: stored.address ?? initialTemplate.address,
        headOfficeAddress: stored.head_office_address ?? stored.address ?? initialTemplate.headOfficeAddress,
        establishmentAddress: stored.establishment_address ?? initialTemplate.establishmentAddress,
        phone: stored.phone ?? initialTemplate.phone,
        email: stored.email ?? initialTemplate.email,
        primaryColor: stored.primary_color ?? initialTemplate.primaryColor,
        headerDesign: stored.header_design ?? initialTemplate.headerDesign,
        legalText: stored.legal_text ?? initialTemplate.legalText,
        footer: stored.footer ?? initialTemplate.footer,
      });
      const activeRange = data.ranges?.find((range: { status: string }) => range.status === "ACTIVE");
      if (activeRange) {
        setFiscalPreview({
          cai: activeRange.cai,
          establishment: activeRange.establishment,
          emissionPoint: activeRange.emission_point,
          documentType: activeRange.document_type,
          initial: Number(activeRange.range_start),
          final: Number(activeRange.range_end),
          limitDate: String(activeRange.expiration_date).slice(0, 10).split("-").reverse().join("/"),
        });
      }
      const rateResponse = await fetch("/api/exchange-rate", { cache: "no-store" });
      const rateData = await rateResponse.json();
      if (rateResponse.ok && Number(rateData.rate) > 0) setExchangeRate(Number(rateData.rate));
    };
    void loadTemplate();
  }, []);

  const subtotal = useMemo(() => sampleItems.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discount, 0), []);
  const discount = useMemo(() => sampleItems.reduce((sum, item) => sum + item.discount, 0), []);
  const isv = subtotal * 0.15;
  const total = subtotal + isv;
  const totalHnl = total * exchangeRate;

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

  const saveTemplate = async () => {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(template));
    const response = await fetch("/api/fiscal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "template", template }),
    });
    setSaved(response.ok);
  };

  return (
    <>
      <PageHeader
        title="Plantilla de Factura"
        description="Configura el PDF que recibe el cliente: logo, empresa, cliente, CAI, rango autorizado, totales, referencia BAC, texto legal y pie de página."
        actions={
          <>
            <ActionButton variant="secondary" onClick={() => window.print()}>Vista previa PDF</ActionButton>
            <ActionButton onClick={() => void saveTemplate()}>Guardar plantilla</ActionButton>
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
              <TextInput placeholder="Dirección casa matriz" value={template.headOfficeAddress} onChange={(event) => update("headOfficeAddress", event.target.value)} />
              <TextInput placeholder="Dirección establecimiento" value={template.establishmentAddress} onChange={(event) => update("establishmentAddress", event.target.value)} />
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

        <section className="print-area overflow-auto rounded-lg border border-slate-200 bg-slate-200 p-3 md:p-6">
          <div className="print-page relative mx-auto min-h-[1056px] w-[816px] overflow-hidden bg-white p-10 text-slate-700 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-2" style={{ backgroundColor: template.primaryColor }} />
            {template.logo ? <img src={template.logo} alt="Marca de agua" className="pointer-events-none absolute left-1/2 top-[370px] w-72 -translate-x-1/2 opacity-[0.04]" /> : null}

            <header className="grid grid-cols-[110px_1fr_210px] gap-4 border-b pb-5" style={{ borderColor: template.primaryColor }}>
              <div>{template.logo ? <img src={template.logo} alt="Logo" className="h-16 w-24 object-contain" /> : <div className="h-16" />}</div>
              <div>
                <p className="text-[8px] font-black" style={{ color: template.primaryColor }}>Nombre completo o Razón social</p>
                <p className="text-[9px] font-bold">{template.legalName}</p>
                <p className="mt-1 text-[8px] font-black" style={{ color: template.primaryColor }}>Nombre comercial</p>
                <p className="text-[9px] font-bold">{template.tradeName}</p>
                <div className="mt-1 grid grid-cols-3 gap-2"><div><p className="text-[8px] font-black" style={{ color: template.primaryColor }}>RTN</p><p className="text-[8px]">{template.rtn}</p></div><div><p className="text-[8px] font-black" style={{ color: template.primaryColor }}>Teléfono móvil</p><p className="text-[8px]">{template.phone.replace(/^(\d{4})(\d{4})$/, "$1-$2")}</p></div><div><p className="text-[8px] font-black" style={{ color: template.primaryColor }}>Email</p><p className="truncate text-[8px]">{template.email}</p></div></div>
                <p className="mt-1 text-[8px] font-black" style={{ color: template.primaryColor }}>Dirección casa matriz</p>
                <p className="text-[8px] leading-tight">{template.headOfficeAddress}</p>
                <p className="mt-1 text-[8px] font-black" style={{ color: template.primaryColor }}>Dirección establecimiento</p>
                <p className="text-[8px] leading-tight">{template.establishmentAddress}</p>
              </div>
              <div className="rounded-lg p-3 text-right text-white" style={{ backgroundColor: template.primaryColor }}>
                <p className="text-[9px] font-black">ORIGINAL: CLIENTE</p>
                <h1 className="mt-1 text-2xl font-black">FACTURA</h1>
                <p className="mt-1 font-mono text-[10px]">No. {previewInvoice.number}</p>
                <p className="mt-1 text-[10px]">Fecha de emisión: 02/08/2026</p>
                <p className="text-[10px]">Moneda: USD</p>
              </div>
            </header>

            <section className="grid grid-cols-2 gap-8 py-5 text-[10px]">
              <div>
                <p className="font-black" style={{ color: template.primaryColor }}>DATOS DEL CLIENTE</p>
                <h3 className="mt-2 text-sm font-black text-slate-950">{previewInvoice.client}</h3>
                <p className="mt-1">RTN: {previewInvoice.rtn}</p>
                <p>Correo: {previewInvoice.email}</p>
                <p>Dirección: Roatán, Islas de la Bahía, Honduras</p>
              </div>
              <div className="space-y-0.5 text-right text-[9px]">
                <p className="mb-1 text-[10px] font-black" style={{ color: template.primaryColor }}>DATOS FISCALES</p>
                <p>No. Orden de compra exenta: -</p>
                <p>No. Constancia del registro exonerado: -</p>
                <p>No. Identificativo del registro de la SAG: -</p>
                <p className="pt-1">CAI:</p>
                <p className="break-all font-mono font-black">{fiscalPreview.cai}</p>
                <p className="pt-1">Rango autorizado:</p>
                <p className="font-mono">{fiscalPreview.establishment}-{fiscalPreview.emissionPoint}-{fiscalPreview.documentType}-{String(fiscalPreview.initial).padStart(8, "0")} al {fiscalPreview.establishment}-{fiscalPreview.emissionPoint}-{fiscalPreview.documentType}-{String(fiscalPreview.final).padStart(8, "0")}</p>
                <p>Fecha límite de emisión: {fiscalPreview.limitDate}</p>
              </div>
            </section>

            <section className="mt-2">
              <div className="rounded-t-md px-3 py-2 text-[8px] font-black text-white" style={{ backgroundColor: template.primaryColor }}>
                <div className="grid grid-cols-[2fr_.55fr_.9fr_.8fr_.9fr_.65fr_.9fr] gap-2 text-right"><span className="text-left">Descripción</span><span>Cantidad</span><span>Precio unitario</span><span>Descuento</span><span>Base gravada</span><span>ISV</span><span>Total</span></div>
              </div>
              <div className="border-x border-b border-slate-200">
                <div className="px-3 py-2 text-[9px] font-black" style={{ backgroundColor: `${template.primaryColor}12`, color: template.primaryColor }}>BODEGA F01</div>
                {sampleItems.map((item) => {
                  const base = item.quantity * item.unitPrice - item.discount;
                  const tax = base * item.taxRate / 100;
                  return <div key={item.description} className="grid grid-cols-[2fr_.55fr_.9fr_.8fr_.9fr_.65fr_.9fr] gap-2 px-3 py-3 text-right text-[8px]"><span className="text-left">{item.description}</span><span>{item.quantity.toFixed(2)}</span><span>{usd(item.unitPrice)}</span><span>{usd(item.discount)}</span><span>{usd(base)}</span><span>{usd(tax)}</span><strong>{usd(base + tax)}</strong></div>;
                })}
              </div>
            </section>

            <section className="mt-5 grid grid-cols-[1fr_310px] gap-8">
              <div className="self-end text-[9px]">
                <p className="font-black" style={{ color: template.primaryColor }}>SON: MIL NOVENTA Y OCHO DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA CON 25/100.</p>
                <p className="mt-2 text-slate-500">EQUIVALENTE EN MONEDA NACIONAL: {hnl(totalHnl)}.</p>
                <div className="mt-5 space-y-1">
                  <p className="font-black" style={{ color: template.primaryColor }}>INFORMACIÓN DEL PAGO</p>
                  <p>Condición de pago: Crédito</p><p>Método de pago: Pendiente</p><p>Fecha de vencimiento: 01/09/2026</p>
                  <p>Total pagado: {usd(0)}</p><p className="font-black">Saldo pendiente: {usd(total)}</p>
                </div>
              </div>
              <div className="text-[9px]">
                <p className="mb-2 font-black" style={{ color: template.primaryColor }}>RESUMEN FISCAL</p>
                {[["Importe exento",0],["Importe exonerado",0],["Descuentos y rebajas",discount],["Subtotal gravado al 15%",subtotal],["Subtotal gravado al 18%",0],["Subtotal",subtotal],["ISV 15%",isv],["ISV 18%",0]].map(([label,value]) => <div key={String(label)} className="flex justify-between py-0.5"><span>{label}</span><strong>{usd(Number(value))}</strong></div>)}
                <div className="mt-2 flex justify-between rounded-md p-2 font-black text-white" style={{ backgroundColor: template.primaryColor }}><span>TOTAL USD</span><span>{usd(total)}</span></div>
                <div className="mt-3 flex justify-between"><strong>Tasa de cambio:</strong><span>USD 1.00 = L {exchangeRate.toFixed(4)}</span></div>
                <div className="mt-1 flex justify-between font-black"><span>TOTAL EQUIVALENTE EN LEMPIRAS:</span><span>{hnl(totalHnl)}</span></div>
              </div>
            </section>

            <footer className="absolute inset-x-10 bottom-8 border-t border-slate-200 pt-3 text-center text-[9px] text-slate-600">
              <p className="font-black" style={{ color: template.primaryColor }}>DESTINO DE LOS EJEMPLARES</p>
              <p>Original: Cliente</p><p>Copia: Obligado Tributario Emisor</p>
              <p className="mt-1">Comprobante emitido mediante Sistema de Facturación Computarizado - Autoimpresor SFC independiente fijo.</p>
              <p className="mt-2 font-bold" style={{ color: template.primaryColor }}>{template.legalText}</p>
            </footer>
          </div>
        </section>
      </div>
    </>
  );
}
