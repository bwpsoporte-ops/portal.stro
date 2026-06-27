import { NextResponse } from "next/server";
import { readInvitationToken } from "@/lib/server/invitation-token";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };

    if (!body.token) {
      return NextResponse.json({ ok: false, message: "Token requerido." }, { status: 400 });
    }

    const invitation = readInvitationToken(body.token);

    return NextResponse.json({
      ok: true,
      invitation: {
        name: invitation.name,
        email: invitation.email,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "La invitación no es válida.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
