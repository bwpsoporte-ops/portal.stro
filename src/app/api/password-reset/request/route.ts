import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createPasswordResetToken } from "@/lib/server/password-reset-token";

type PasswordResetRequest = {
  name?: string;
  email?: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} no está configurado.`);
  }

  return value;
}

function passwordResetTemplate({ name, resetUrl }: { name: string; resetUrl: string }) {
  return `
    <div style="margin:0;background:#f3f8fc;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:10px;overflow:hidden">
        <div style="background:#4188ef;padding:22px 28px;color:#ffffff">
          <h1 style="margin:0;font-size:22px;line-height:1.2">Roatan Self Storage</h1>
          <p style="margin:8px 0 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Restablecer contraseña</p>
        </div>
        <div style="padding:28px">
          <p style="margin:0 0 16px;font-size:16px">Hola ${name},</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#334155">
            Recibimos una solicitud para crear una nueva contraseña de acceso al dashboard administrativo.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 18px;border-radius:7px">
            Crear nueva contraseña
          </a>
          <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#64748b">
            Este enlace vence en 30 minutos. Si no solicitaste este cambio, puedes ignorar este correo.<br />
            <span style="word-break:break-all;color:#0369a1">${resetUrl}</span>
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PasswordResetRequest;
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!name || !email) {
      return NextResponse.json({ ok: false, message: "Nombre y correo son requeridos." }, { status: 400 });
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 30);
    const token = createPasswordResetToken({
      name,
      email,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    const origin = new URL(request.url).origin;
    const resetUrl = `${origin}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
    const smtpUser = requiredEnv("GMAIL_EMAIL");
    const transporter = nodemailer.createTransport({
      host: requiredEnv("GMAIL_SMTP_HOST"),
      port: Number(process.env.GMAIL_SMTP_PORT ?? 587),
      secure: false,
      auth: {
        user: smtpUser,
        pass: requiredEnv("GMAIL_PASSWORD").replace(/\s/g, ""),
      },
    });

    await transporter.sendMail({
      from: `"Roatan Self Storage" <${smtpUser}>`,
      to: email,
      replyTo: process.env.YOUR_EMAIL ?? smtpUser,
      subject: "Restablece tu contraseña - Roatan Self Storage",
      html: passwordResetTemplate({ name, resetUrl }),
    });

    return NextResponse.json({ ok: true, message: `Enviamos un enlace para restablecer la contraseña a ${email}.`, resetUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el enlace para restablecer contraseña.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
