import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSmtpMailer } from "@/lib/server/smtp";
import { invitationEmailTemplate } from "@/lib/server/email-templates";
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
  modulePermissions?: string[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InviteRequest;
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const temporaryPassword = body.temporaryPassword ?? "";
    const modulePermissions = Array.isArray(body.modulePermissions)
      ? [...new Set(body.modulePermissions.filter((entry) => typeof entry === "string"))]
      : [];

    if (!name || !email || !temporaryPassword) {
      return NextResponse.json({ ok: false, message: "Nombre, correo y contraseña temporal son requeridos." }, { status: 400 });
    }

    if (temporaryPassword.length < 8) {
      return NextResponse.json({ ok: false, message: "La contraseña temporal debe tener al menos 8 caracteres." }, { status: 400 });
    }

    if (!modulePermissions.length) {
      return NextResponse.json({ ok: false, message: "Selecciona al menos un módulo para el nuevo usuario." }, { status: 400 });
    }

    if (body.invitedById !== "USR-ROOT") {
      const inviter = await query<{ can_invite: boolean }>("SELECT can_invite FROM app_users WHERE id = $1 LIMIT 1", [body.invitedById ?? ""]);
      if (!inviter.rows[0]?.can_invite) {
        return NextResponse.json({ ok: false, message: "Tu usuario no tiene permiso para invitar a otras personas." }, { status: 403 });
      }
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
      modulePermissions,
    });
    const origin = new URL(request.url).origin;
    const activationUrl = `${origin}/activar-cuenta?token=${encodeURIComponent(token)}`;
    const transporter = createSmtpMailer();

    await transporter.sendMail({
      to: email,
      subject: "Activa tu cuenta - Roatan Self Storage",
      ...invitationEmailTemplate({ name, email, activationUrl, temporaryPassword }),
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
        invited_by_email,
        module_permissions,
        can_invite
      ) VALUES (
        $1,
        $2,
        $3,
        crypt($4, gen_salt('bf')),
        'Usuario',
        'ACTIVO',
        $5,
        $6,
        $7,
        $8::jsonb,
        false
      )`,
      [
        `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        email,
        name,
        temporaryPassword,
        body.invitedById ?? null,
        body.invitedByName ?? null,
        body.invitedByEmail ?? null,
        JSON.stringify(modulePermissions),
      ],
    );

    return NextResponse.json({ ok: true, message: `Invitación enviada a ${email}.`, activationUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar la invitación.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
