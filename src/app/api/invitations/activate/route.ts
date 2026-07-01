import { NextResponse } from "next/server";
import crypto from "crypto";
import { readInvitationToken } from "@/lib/server/invitation-token";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";

type ActivateRequest = {
  token?: string;
  temporaryPassword?: string;
  nextPassword?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ActivateRequest;

    if (!body.token || !body.temporaryPassword) {
      return NextResponse.json({ ok: false, message: "Token y contraseña temporal son requeridos." }, { status: 400 });
    }

    if (body.nextPassword && body.nextPassword.length < 8) {
      return NextResponse.json({ ok: false, message: "La nueva contraseña debe tener al menos 8 caracteres." }, { status: 400 });
    }

    const invitation = readInvitationToken(body.token);

    if (invitation.temporaryPassword !== body.temporaryPassword) {
      return NextResponse.json({ ok: false, message: "La contraseña temporal no es correcta." }, { status: 401 });
    }

    if (body.nextPassword) {
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
         )
         ON CONFLICT (username) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           password_hash = EXCLUDED.password_hash,
           role = 'Usuario',
           status = 'ACTIVO',
           invited_by_id = COALESCE(app_users.invited_by_id, EXCLUDED.invited_by_id),
           invited_by_name = COALESCE(app_users.invited_by_name, EXCLUDED.invited_by_name),
           invited_by_email = COALESCE(app_users.invited_by_email, EXCLUDED.invited_by_email),
           updated_at = now()`,
        [
          `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          invitation.email.toLowerCase(),
          invitation.name,
          body.nextPassword,
          invitation.invitedById ?? null,
          invitation.invitedByName ?? null,
          invitation.invitedByEmail ?? null,
        ],
      );
    }

    return NextResponse.json({
      ok: true,
      invitation: {
        name: invitation.name,
        email: invitation.email,
        invitedById: invitation.invitedById,
        invitedByName: invitation.invitedByName,
        invitedByEmail: invitation.invitedByEmail,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo activar la invitación.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
