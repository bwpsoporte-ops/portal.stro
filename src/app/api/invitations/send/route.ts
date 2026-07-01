import { NextResponse } from "next/server";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createInvitationToken } from "@/lib/server/invitation-token";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";

type InviteRequest = {
  name?: string;
  email?: string;
  temporaryPassword?: string;
  invitedById?: string;
  invitedByName?: string;
  invitedByEmail?: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} no está configurado.`);
  }

  return value;
}

function invitationTemplate({ name, activationUrl, temporaryPassword }: { name: string; activationUrl: string; temporaryPassword: string }) {
  return `
    <div style="margin:0;background:#f3f8fc;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:10px;overflow:hidden">
        <div style="background:#4188ef;padding:22px 28px;color:#ffffff">
          <h1 style="margin:0;font-size:22px;line-height:1.2">Roatan Self Storage</h1>
          <p style="margin:8px 0 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Activación de cuenta</p>
        </div>
        <div style="padding:28px">
          <p style="margin:0 0 16px;font-size:16px">Hola ${name},</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#334155">
            Se creó un acceso para que ingreses al dashboard administrativo. Para activar tu cuenta, confirma la contraseña temporal y define una nueva contraseña.
          </p>
          <div style="margin:22px 0;padding:16px;border:1px solid #bae6fd;background:#f0f9ff;border-radius:8px">
            <p style="margin:0 0 6px;font-size:12px;font-weight:800;text-transform:uppercase;color:#0369a1">Contraseña temporal</p>
            <p style="margin:0;font-size:20px;font-weight:800;color:#0f172a">${temporaryPassword}</p>
          </div>
          <a href="${activationUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 18px;border-radius:7px">
            Activar cuenta
          </a>
          <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#64748b">
            Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
            <span style="word-break:break-all;color:#0369a1">${activationUrl}</span>
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InviteRequest;
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const temporaryPassword = body.temporaryPassword ?? "";

    if (!name || !email || !temporaryPassword) {
      return NextResponse.json({ ok: false, message: "Nombre, correo y contraseña temporal son requeridos." }, { status: 400 });
    }

    if (temporaryPassword.length < 8) {
      return NextResponse.json({ ok: false, message: "La contraseña temporal debe tener al menos 8 caracteres." }, { status: 400 });
    }

    const existingUser = await query<{ id: string }>("SELECT id FROM app_users WHERE lower(username) = $1 LIMIT 1", [email]);

    if (existingUser.rows.length > 0) {
      return NextResponse.json({ ok: false, message: "Ya existe un usuario registrado con ese correo." }, { status: 409 });
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 7);
    const token = createInvitationToken({
      name,
      email,
      temporaryPassword,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      invitedById: body.invitedById,
      invitedByName: body.invitedByName,
      invitedByEmail: body.invitedByEmail,
    });
    const origin = new URL(request.url).origin;
    const activationUrl = `${origin}/activar-cuenta?token=${encodeURIComponent(token)}`;
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
      subject: "Activa tu cuenta - Roatan Self Storage",
      html: invitationTemplate({ name, activationUrl, temporaryPassword }),
    });

    await query(
      `INSERT INTO app_users (
        id,
        username,
        display_name,
        password_hash,
        role,
        status,
        invited_by_id,
        invited_by_name,
        invited_by_email
      ) VALUES (
        $1,
        $2,
        $3,
        crypt($4, gen_salt('bf')),
        'Usuario',
        'ACTIVO',
        $5,
        $6,
        $7
      )`,
      [
        `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        email,
        name,
        temporaryPassword,
        body.invitedById ?? null,
        body.invitedByName ?? null,
        body.invitedByEmail ?? null,
      ],
    );

    return NextResponse.json({ ok: true, message: `Invitación enviada a ${email}.`, activationUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar la invitación.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
