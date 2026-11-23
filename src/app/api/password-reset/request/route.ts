import { NextResponse } from "next/server";
import { createSmtpMailer } from "@/lib/server/smtp";
import { passwordResetEmailTemplate } from "@/lib/server/email-templates";
import { createPasswordResetToken } from "@/lib/server/password-reset-token";

type PasswordResetRequest = {
  name?: string;
  email?: string;
};

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
    const transporter = createSmtpMailer();

    await transporter.sendMail({
      to: email,
      subject: "Restablece tu contraseña - Roatan Self Storage",
      ...passwordResetEmailTemplate({ name, resetUrl }),
    });

    return NextResponse.json({ ok: true, message: `Enviamos un enlace para restablecer la contraseña a ${email}.`, resetUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el enlace para restablecer contraseña.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
