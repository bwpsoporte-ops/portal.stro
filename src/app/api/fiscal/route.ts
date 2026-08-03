import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";
import { ensureIntegrationSchema } from "@/lib/server/integrations/schema";

export const runtime = "nodejs";

const statusToDatabase: Record<string, string> = {
  ACTIVO: "ACTIVE", INACTIVO: "INACTIVE", VENCIDO: "EXPIRED",
  AGOTADO: "EXHAUSTED", BLOQUEADO: "BLOCKED",
};

function correlativeNumber(value: unknown) {
  const text = String(value ?? "").trim();
  const lastPart = text.includes("-") ? text.split("-").at(-1) ?? "" : text;
  if (!/^\d{1,8}$/.test(lastPart)) throw new Error("El correlativo debe terminar en un número de hasta 8 dígitos.");
  return Number(lastPart);
}

function fiscalRangeParts(value: unknown, fallback?: { establishment: string; emissionPoint: string; documentType: string; prefix: string }) {
  const text = String(value ?? "").trim();
  if (/^\d{1,8}$/.test(text)) {
    return fallback ?? {
      establishment: "000",
      emissionPoint: "001",
      documentType: "01",
      prefix: "000-001-01",
    };
  }
  const parts = text.split("-");
  if (parts.length !== 4 || !parts.every((part) => /^\d+$/.test(part))) {
    throw new Error("Escribe solamente el número correlativo o el rango fiscal completo.");
  }
  const [establishment, emissionPoint, documentType] = parts;
  return {
    establishment: establishment.padStart(3, "0"),
    emissionPoint: emissionPoint.padStart(3, "0"),
    documentType: documentType.padStart(2, "0"),
    prefix: `${establishment.padStart(3, "0")}-${emissionPoint.padStart(3, "0")}-${documentType.padStart(2, "0")}`,
  };
}

function fiscalDate(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${label} debe seleccionarse nuevamente en formato año, mes y día.`);
  }
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error(`${label} no es una fecha válida.`);
  }
  return text;
}

export async function GET() {
  try {
    await ensureIntegrationSchema();
    const [template, ranges, documents] = await Promise.all([
      getPool().query(`SELECT * FROM invoice_templates WHERE is_active=true ORDER BY updated_at DESC LIMIT 1`),
      getPool().query(`SELECT id,cai,range_start,range_end,current_number,
        expiration_date::text AS expiration_date,authorization_date::text AS authorization_date,
        status,document_type,establishment,emission_point,branch,created_by,created_at,updated_at
        FROM cai_ranges ORDER BY created_at DESC`),
      getPool().query(
        `SELECT id,document_number,cai,fiscal_correlative,created_at,customer_name,total,currency
         FROM billing_documents WHERE cai IS NOT NULL ORDER BY created_at DESC LIMIT 500`,
      ),
    ]);
    return NextResponse.json({ ok: true, template: template.rows[0] ?? null, ranges: ranges.rows, documents: documents.rows });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Error fiscal." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureIntegrationSchema();
    const input = await request.json();
    if (input.kind === "template") {
      const value = input.template ?? {};
      await getPool().query(
        `INSERT INTO invoice_templates
         (id,name,logo_url,trade_name,legal_name,rtn,address,head_office_address,establishment_address,phone,email,
          primary_color,header_design,legal_text,footer,is_active)
         VALUES ('TPL-DEFAULT','Plantilla principal',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
         ON CONFLICT (id) DO UPDATE SET logo_url=$1,trade_name=$2,legal_name=$3,
          rtn=$4,address=$5,head_office_address=$6,establishment_address=$7,phone=$8,email=$9,primary_color=$10,header_design=$11,
          legal_text=$12,footer=$13,is_active=true,updated_at=now()`,
        [value.logo || null,value.tradeName,value.legalName,value.rtn,value.headOfficeAddress,value.headOfficeAddress,value.establishmentAddress,value.phone,value.email,value.primaryColor,value.headerDesign,value.legalText,value.footer],
      );
      return NextResponse.json({ ok: true });
    }
    if (input.kind === "cai") {
      const value = input.range ?? {};
      if (!value.cai || !value.initial || !value.final || !value.current || !value.limitDate) throw new Error("Completa los datos requeridos del CAI.");
      const initialParts = fiscalRangeParts(value.initial);
      const finalParts = fiscalRangeParts(value.final, initialParts);
      const currentText = String(value.current).trim();
      const currentParts = fiscalRangeParts(currentText, initialParts);
      if (initialParts.prefix !== finalParts.prefix || initialParts.prefix !== currentParts.prefix) {
        throw new Error("El rango inicial, final y correlativo actual deben pertenecer a la misma serie fiscal.");
      }
      const rangeStart = correlativeNumber(value.initial);
      const rangeEnd = correlativeNumber(value.final);
      const currentNumber = correlativeNumber(value.current);
      const authorizationDate = fiscalDate(value.authorizedAt, "La fecha de autorización");
      const expirationDate = fiscalDate(value.limitDate, "La fecha límite de emisión");
      if (authorizationDate > expirationDate) {
        throw new Error("La fecha de autorización no puede ser posterior a la fecha límite de emisión.");
      }
      if (rangeStart > rangeEnd || currentNumber < rangeStart || currentNumber > rangeEnd) {
        throw new Error("El correlativo actual debe estar dentro del rango autorizado.");
      }
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const nextStatus = "ACTIVE";
        if (nextStatus === "ACTIVE") {
          await client.query(
            `UPDATE cai_ranges SET status='INACTIVE',updated_at=now()
             WHERE status='ACTIVE' AND document_type=$1 AND establishment=$2 AND emission_point=$3`,
            [initialParts.documentType, initialParts.establishment, initialParts.emissionPoint],
          );
        }
        const inserted = await client.query(
          `INSERT INTO cai_ranges
           (id,cai,range_start,range_end,current_number,expiration_date,
            authorization_date,status,document_type,establishment,emission_point,branch)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id,cai,range_start,range_end,current_number,expiration_date,
                     authorization_date,status,document_type,establishment,emission_point,branch`,
          [randomUUID(),String(value.cai).trim().toUpperCase(),rangeStart,rangeEnd,currentNumber,expirationDate,authorizationDate,nextStatus,initialParts.documentType,initialParts.establishment,initialParts.emissionPoint,value.office || "Principal"],
        );
        await client.query("COMMIT");
        return NextResponse.json({ ok: true, range: inserted.rows[0] }, { status: 201 });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error("Operación fiscal inválida.");
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 422 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureIntegrationSchema();
    const input = await request.json();
    const id = String(input.id ?? "");
    const status = statusToDatabase[String(input.status ?? "")];
    if (!id || !status) throw new Error("Estado de CAI inválido.");

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const target = await client.query<{ document_type: string; establishment: string; emission_point: string; expiration_date: string; current_number: number; range_end: number }>(
        `SELECT document_type,establishment,emission_point,expiration_date,current_number,range_end FROM cai_ranges WHERE id=$1 FOR UPDATE`, [id],
      );
      if (!target.rowCount) throw new Error("Rango CAI no encontrado.");
      if (status === "ACTIVE") {
        const row = target.rows[0];
        if (new Date(row.expiration_date).getTime() < new Date(new Date().toISOString().slice(0, 10)).getTime()) {
          throw new Error("No puedes activar un CAI vencido.");
        }
        if (Number(row.current_number) > Number(row.range_end)) {
          throw new Error("No puedes activar un rango agotado.");
        }
        await client.query(
          `UPDATE cai_ranges SET status='INACTIVE',updated_at=now()
           WHERE id<>$1 AND status='ACTIVE' AND document_type=$2 AND establishment=$3 AND emission_point=$4`,
          [id, row.document_type, row.establishment, row.emission_point],
        );
      }
      await client.query(`UPDATE cai_ranges SET status=$2,updated_at=now() WHERE id=$1`, [id, status]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "No se pudo actualizar." }, { status: 422 });
  }
}
