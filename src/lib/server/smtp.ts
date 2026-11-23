import nodemailer from "nodemailer";

/** Read at send time, on the server only. Never mix the new SMTP account with
 * old GMAIL_* credentials, and never alter spaces in the mailbox password.
 */
function smtpConfiguration() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const address = process.env.SMTP_FROM?.trim() || user;
  const name = process.env.SMTP_FROM_NAME?.trim() || "Roatan Self Storage";
  const port = Number(process.env.SMTP_PORT?.trim() || 465);
  const secureValue = process.env.SMTP_SECURE?.trim().toLowerCase();

  if (!host || !user || !address) {
    throw new Error("Configura SMTP_HOST, SMTP_USER y SMTP_FROM para enviar correos.");
  }
  if (!password?.trim() || password.trim() === "COLOCA_AQUI_TU_CONTRASENA") {
    throw new Error("Configura SMTP_PASSWORD con la contraseña real del correo; el texto de ejemplo no permite enviar.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT debe ser un puerto válido, por ejemplo 465.");
  }
  if (secureValue && secureValue !== "true" && secureValue !== "false") {
    throw new Error("SMTP_SECURE debe ser true o false.");
  }
  const secure = secureValue ? secureValue === "true" : port === 465;
  if (port === 465 && !secure) {
    throw new Error("El puerto SMTP 465 requiere SMTP_SECURE=true.");
  }
  if (/[\r\n]/.test(host + user + address + name)
    || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address)) {
    throw new Error("SMTP_FROM debe contener solo el correo; coloca el nombre en SMTP_FROM_NAME.");
  }
  return { host, port, secure, user, password, from: { name, address } };
}

/** Checks configuration only; this does not connect to or authenticate with SMTP. */
export function isSmtpConfigured(): boolean {
  try {
    smtpConfiguration();
    return true;
  } catch {
    return false;
  }
}

export function createSmtpMailer() {
  const config = smtpConfiguration();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  }, {
    from: config.from,
    replyTo: config.from.address,
  });
}
