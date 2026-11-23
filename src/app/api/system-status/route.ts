import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";
import { hasRootAuthorization } from "@/lib/server/root-session";
import { isSmtpConfigured } from "@/lib/server/smtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!(await hasRootAuthorization())) {
      return NextResponse.json({ ok:false,message:"Esta información está disponible únicamente para el usuario superior." },{ status:403 });
    }
    await ensureIntegrationSchema();
    const db = getPool();
    const [webhooks, latestWebhook, latestInvoice, emailQueue, fiscal, template, customers] = await Promise.all([
      db.query<{ failed: string; retrying: string; processed: string }>(`SELECT count(*) FILTER (WHERE status='FAILED')::text AS failed,count(*) FILTER (WHERE status='RETRYING')::text AS retrying,count(*) FILTER (WHERE status='PROCESSED')::text AS processed FROM integration_webhook_events WHERE lower(provider)='storeganise'`),
      db.query(`SELECT event_id,event_type,status,error_message,received_at FROM integration_webhook_events WHERE lower(provider)='storeganise' ORDER BY received_at DESC LIMIT 1`),
      db.query(`SELECT id,document_number,customer_name,status,sent_at,created_at FROM billing_documents WHERE document_type='INVOICE' ORDER BY created_at DESC LIMIT 1`),
      db.query(`SELECT id,document_number,customer_name,status,created_at FROM billing_documents WHERE document_type='INVOICE' AND status='PAID' AND sent_at IS NULL ORDER BY created_at DESC LIMIT 100`),
      db.query<{ cai: string; available: number }>(`SELECT cai,GREATEST(range_end-current_number+1,0)::integer AS available FROM cai_ranges WHERE status::text='ACTIVE' AND document_type='01' AND expiration_date>=current_date AND current_number<=range_end ORDER BY created_at DESC LIMIT 1`),
      db.query<{ count: string }>(`SELECT count(*)::text AS count FROM invoice_templates WHERE is_active=true`),
      db.query<{ count: string }>(`SELECT count(*)::text AS count FROM integration_customers WHERE disabled=false`),
    ]);

    const webhook = webhooks.rows[0];
    const failed = Number(webhook.failed);
    const retrying = Number(webhook.retrying);
    const processed = Number(webhook.processed);
    const available = fiscal.rows[0]?.available ?? 0;
    const storeganiseConfigured = Boolean(process.env.STOREGANISE_WEBHOOK_SECRET && process.env.STOREGANISE_API_URL && process.env.STOREGANISE_API_KEY);
    const smtpConfigured = isSmtpConfigured();
    const now = new Date().toISOString();

    const services = [
      { id:"database",name:"Base de datos",status:"OPERATIVO",detail:"Conexión y esquema disponibles.",lastCheck:now,href:"/dashboard/overview" },
      { id:"storeganise",name:"Storeganise",status:failed>0?"CRITICO":storeganiseConfigured&&(processed>0||Number(customers.rows[0]?.count)>0)?"OPERATIVO":"DEGRADADO",detail:failed>0?`${failed} evento(s) fallidos.`:storeganiseConfigured?`${processed} evento(s) procesados y ${customers.rows[0]?.count??0} cliente(s) sincronizados.`:"Configuración incompleta.",lastCheck:latestWebhook.rows[0]?.received_at??now,href:"/dashboard/storeganise" },
      { id:"billing",name:"Facturación",status:fiscal.rowCount?available<=25?"DEGRADADO":"OPERATIVO":"CRITICO",detail:fiscal.rowCount?`CAI activo con ${available} correlativo(s) disponibles.`:"No existe CAI activo para facturas.",lastCheck:now,href:"/dashboard/cai-correlativos" },
      { id:"email",name:"Correo",status:!smtpConfigured?"DEGRADADO":emailQueue.rowCount?"DEGRADADO":"OPERATIVO",detail:!smtpConfigured?"Configuración SMTP incompleta.":emailQueue.rowCount?`${emailQueue.rowCount} factura(s) pagadas pendientes de envío.`:"SMTP configurado y sin envíos pendientes.",lastCheck:latestInvoice.rows[0]?.created_at??now,href:"/dashboard/facturas" },
      { id:"pdf",name:"PDF",status:Number(template.rows[0]?.count)>0?"OPERATIVO":"DEGRADADO",detail:Number(template.rows[0]?.count)>0?"Plantilla fiscal activa y generador disponible.":"No existe plantilla fiscal activa.",lastCheck:now,href:"/dashboard/plantilla-factura" },
      { id:"reports",name:"Reportes",status:"OPERATIVO",detail:"Reportes HNL, CSV y PDF contable disponibles.",lastCheck:now,href:"/dashboard/reportes" },
      { id:"bac",name:"BAC Credomatic",status:"DEGRADADO",detail:"Pendiente de integración bancaria. No se simulan transacciones.",lastCheck:now,href:"/dashboard/pagos-bac" },
    ];

    const queue = [
      ...emailQueue.rows.map((row) => ({ id:`Q-EMAIL-${row.id}`,process:"Enviar factura por correo",module:"Correos",reference:row.document_number,priority:"Media",status:"PENDIENTE",createdAt:row.created_at,action:"Abrir factura",href:"/dashboard/facturas" })),
      ...(failed || retrying ? [{ id:"Q-STOREGANISE",process:"Revisar eventos Storeganise",module:"Storeganise",reference:`${failed} fallido(s) · ${retrying} reintento(s)`,priority:failed?"Alta":"Media",status:failed?"BLOQUEADO":"EN_REVISION",createdAt:latestWebhook.rows[0]?.received_at??now,action:"Abrir monitor",href:"/dashboard/storeganise" }] : []),
    ];

    return NextResponse.json({ ok:true,services,queue,availableCorrelatives:available,latestWebhook:latestWebhook.rows[0]??null,latestInvoice:latestInvoice.rows[0]??null },{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return NextResponse.json({ ok:false,message:error instanceof Error?error.message:"No se pudo consultar el estado del sistema." },{status:503});
  }
}
