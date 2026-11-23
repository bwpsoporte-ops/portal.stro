import { existsSync } from "node:fs";
import path from "node:path";

const green = "#004B13";
const logoCid = "roatan-brand@portal";
const paragraph = "margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

function details(rows: { label: string; value: string }[]) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:16px 0 24px">
    ${rows.map((row) => `<tr>
      <td width="36%" valign="top" style="padding:12px 10px 12px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px">${escapeHtml(row.label)}</td>
      <td valign="top" style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#172b24;font-size:14px;font-weight:bold;word-break:break-word">${escapeHtml(row.value)}</td>
    </tr>`).join("")}
  </table>`;
}

/** Table layout and inline styles for email clients. All dynamic text is escaped.
 * The logo is a CID attachment: no external image host or client login required.
 * PDF attachments are added separately by the billing sender, not embedded HTML.
 */
function emailLayout(input: {
  category: string; title: string; preheader: string; name: string;
  bodyHtml: string; bodyText: string;
}) {
  const brand = process.env.SMTP_FROM_NAME?.trim() || "Roatan Self Storage";
  const logoPath = path.join(process.cwd(), "public", "roatanselfstorage.png");
  const attachments = existsSync(logoPath) ? [{
    filename: "roatan-self-storage.png", path: logoPath, cid: logoCid,
    contentType: "image/png", contentDisposition: "inline" as const,
  }] : [];
  const logo = attachments.length
    ? `<td width="90" valign="middle" style="padding-right:18px"><img src="cid:${logoCid}" alt="${escapeHtml(brand)}" width="80" height="80" style="display:block;border:0;width:80px;height:80px" /></td>`
    : "";
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#eef2f0;font-family:Arial,Helvetica,sans-serif;color:#172b24">
  <div style="display:none;font-size:1px;line-height:1px;color:#eef2f0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f0;border-collapse:collapse">
    <tr><td align="center" style="padding:28px 12px">
      <!--[if mso]><table role="presentation" width="640" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #d9e4dd;border-collapse:collapse">
        <tr><td style="height:6px;line-height:6px;background:${green}">&nbsp;</td></tr>
        <tr><td style="padding:26px 28px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${logo}<td valign="middle">
            <p style="margin:0 0 7px;font-size:21px;font-weight:bold;color:${green}">${escapeHtml(brand)}</p>
            <p style="margin:0;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b">${escapeHtml(input.category)}</p>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:23px 28px;background:${green};color:#ffffff">
          <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:bold">${escapeHtml(input.title)}</h1>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="${paragraph}">Hola <strong>${escapeHtml(input.name || "cliente")}</strong>,</p>
          ${input.bodyHtml}
          <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#334155">Gracias por confiar en nosotros.<br /><strong style="color:${green}">Equipo de ${escapeHtml(brand)}</strong></p>
        </td></tr>
        <tr><td style="padding:20px 28px;background:#f5f8f6;border-top:1px solid #d9e4dd">
          <p style="margin:0;font-size:12px;line-height:1.7;color:#64748b">¿Necesitas ayuda? Responde a este correo y nuestro equipo te atenderá.<br />Este mensaje está dirigido a su destinatario. Evita compartir documentos o enlaces de acceso con terceros.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body></html>`;
  return {
    html,
    text: `${brand}\n${input.title}\n\nHola ${input.name || "cliente"},\n\n${input.bodyText}\n\nGracias por confiar en nosotros.\nEquipo de ${brand}\n\nSi necesitas ayuda, responde a este correo. No compartas documentos o enlaces de acceso con terceros.`,
    attachments,
  };
}

export function billingEmailTemplate(input: {
  name: string; documentType: "PROFORMA" | "INVOICE"; documentNumber: string;
  date: string; currency: string; total: string; status: string;
  unit?: string | null; filenames: string[];
}) {
  const kind = input.documentType === "PROFORMA" ? "Proforma" : "Factura";
  const states: Record<string, string> = {
    PAID: "Pagada", PENDING_PAYMENT: "Pendiente de pago", PARTIALLY_PAID: "Abono registrado",
    DRAFT: "Borrador", SENT: "Enviada", ACCEPTED: "Aceptada", REJECTED: "Rechazada",
    CONVERTED: "Convertida en factura", CANCELLED: "Anulada",
  };
  const status = states[input.status] || "Registrado";
  // Display saved values only: no currency conversion or tax recalculation here.
  const total = `${input.currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(input.total))}`;
  const rows = [
    { label: "Documento", value: `${kind} ${input.documentNumber}` },
    { label: "Fecha de emisión", value: input.date },
    { label: "Cliente", value: input.name },
    ...(input.unit ? [{ label: "Bodega", value: input.unit }] : []),
    { label: "Estado del documento", value: status },
  ];
  const note = input.documentType === "PROFORMA"
    ? "Este correo acompaña una proforma; no sustituye una factura fiscal."
    : "El PDF adjunto contiene el detalle y los datos fiscales del documento. El envío de este correo no modifica su estado de pago.";
  return emailLayout({
    category: "Administración y facturación",
    title: `${kind} ${input.documentNumber}`,
    preheader: `${kind} en PDF adjunta · ${total} · ${status}`,
    name: input.name,
    bodyHtml: `<p style="${paragraph}">Te enviamos tu ${kind.toLowerCase()} en formato PDF. A continuación encontrarás un resumen del documento; el archivo completo está adjunto a este correo.</p>
      ${details(rows)}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef6f0;border:1px solid #c8ddcf"><tr><td style="padding:20px">
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${green}">Total del documento</p>
        <p style="margin:0;font-size:29px;font-weight:bold;color:${green}">${escapeHtml(total)}</p>
      </td></tr></table>
      <p style="margin:16px 0 24px;font-size:12px;line-height:1.7;color:#64748b">${escapeHtml(note)}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d9e4dd"><tr><td style="padding:20px">
        <p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:${green}">Documento PDF adjunto</p>
        ${input.filenames.map((filename) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;word-break:break-all;color:#334155">PDF &nbsp; ${escapeHtml(filename)}</p>`).join("")}
        <p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:#64748b">Abre el archivo adjunto de este mensaje para consultar, descargar o imprimir el documento. No necesitas ingresar al portal para abrirlo.</p>
      </td></tr></table>`,
    bodyText: `Adjuntamos tu ${kind.toLowerCase()} en PDF.\n\n${rows.map((row) => `${row.label}: ${row.value}`).join("\n")}\nTotal del documento: ${total}\n\n${note}\n\nDocumento PDF adjunto:\n${input.filenames.join("\n")}\nPuedes abrirlo, guardarlo o imprimirlo desde los archivos adjuntos de este mensaje.`,
  });
}

function accessAction(label: string, url: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td bgcolor="${green}" style="padding:15px 24px;border-radius:4px">
    <a href="${escapeHtml(url)}" style="font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;display:inline-block">${escapeHtml(label)}</a>
  </td></tr></table>
  <p style="margin:0 0 20px;font-size:12px;line-height:1.7;color:#64748b">Si el botón no funciona, copia y pega este enlace en tu navegador:<br /><a href="${escapeHtml(url)}" style="color:${green};word-break:break-all">${escapeHtml(url)}</a></p>`;
}

export function invitationEmailTemplate(input: {
  name: string; email: string; activationUrl: string; temporaryPassword: string;
}) {
  return emailLayout({
    category: "Acceso al portal", title: "Bienvenido a tu cuenta",
    preheader: "Tu invitación al portal está lista. Activa tu acceso y configura tu contraseña.",
    name: input.name,
    bodyHtml: `<p style="${paragraph}">Has recibido una invitación para ingresar al portal administrativo. Activa tu cuenta con la contraseña temporal y establece una nueva contraseña personal.</p>
      ${details([{ label: "Usuario", value: input.email }, { label: "Vigencia del enlace", value: "7 días desde la invitación" }])}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef6f0;border:1px solid #c8ddcf"><tr><td style="padding:18px">
        <p style="margin:0 0 8px;font-size:12px;color:${green};font-weight:bold">Contraseña temporal</p>
        <p style="margin:0;font-size:20px;font-family:Consolas,monospace;color:#172b24;white-space:pre-wrap;word-break:break-all">${escapeHtml(input.temporaryPassword)}</p>
      </td></tr></table>
      ${accessAction("Activar mi cuenta", input.activationUrl)}
      <p style="${paragraph}">Por seguridad, no compartas esta contraseña ni el enlace. Si no esperabas esta invitación, contacta al administrador antes de activar la cuenta.</p>`,
    bodyText: `Has recibido una invitación al portal administrativo.\nUsuario: ${input.email}\nContraseña temporal: ${input.temporaryPassword}\n\nActiva tu cuenta y define una nueva contraseña:\n${input.activationUrl}\n\nEl enlace vence en 7 días. Si no esperabas esta invitación, contacta al administrador.`,
  });
}

export function passwordResetEmailTemplate(input: { name: string; resetUrl: string }) {
  return emailLayout({
    category: "Seguridad de tu cuenta", title: "Restablece tu contraseña",
    preheader: "Enlace para restablecer tu contraseña. Válido durante 30 minutos.",
    name: input.name,
    bodyHtml: `<p style="${paragraph}">Recibimos una solicitud para restablecer la contraseña de tu cuenta del portal administrativo. Usa el siguiente botón para crear una nueva.</p>
      ${accessAction("Crear nueva contraseña", input.resetUrl)}
      <p style="padding:16px;background:#eef6f0;border-left:3px solid ${green};font-size:14px;line-height:1.7;color:#334155">Este enlace vence en <strong>30 minutos</strong>. Si no solicitaste el cambio, ignora este correo. Tu contraseña no cambiará por recibir este mensaje.</p>`,
    bodyText: `Recibimos una solicitud para restablecer tu contraseña.\n\nCrea una nueva contraseña aquí:\n${input.resetUrl}\n\nEl enlace vence en 30 minutos. Si no solicitaste el cambio, ignora este correo. Tu contraseña no cambia por recibir este mensaje.`,
  });
}
