import { NextResponse } from "next/server";
import { readInvitationToken } from "@/lib/server/invitation-token";

type ActivateRequest = {
  token?: string;
  temporaryPassword?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ActivateRequest;

    if (!body.token || !body.temporaryPassword) {
      return NextResponse.json({ ok: false, message: "Token y contraseña temporal son requeridos." }, { status: 400 });
    }

    const invitation = readInvitationToken(body.token);

    if (invitation.temporaryPassword !== body.temporaryPassword) {
      return NextResponse.json({ ok: false, message: "La contraseña temporal no es correcta." }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      invitation: {
        name: invitation.name,
        email: invitation.email,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo activar la invitación.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
