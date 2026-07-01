import { NextResponse } from "next/server";
import { readInvitationToken } from "@/lib/server/invitation-token";
import { query } from "@/lib/server/db";

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
        `UPDATE app_users
         SET display_name = $1,
             password_hash = crypt($2, gen_salt('bf')),
             invited_by_id = COALESCE(invited_by_id, $3),
             invited_by_name = COALESCE(invited_by_name, $4),
             invited_by_email = COALESCE(invited_by_email, $5),
             updated_at = now()
         WHERE lower(username) = $6
           AND role = 'Usuario'`,
        [
          invitation.name,
          body.nextPassword,
          invitation.invitedById ?? null,
          invitation.invitedByName ?? null,
          invitation.invitedByEmail ?? null,
          invitation.email.toLowerCase(),
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
