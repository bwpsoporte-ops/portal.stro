import { NextResponse } from "next/server";
import { readPasswordResetToken } from "@/lib/server/password-reset-token";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };

    if (!body.token) {
      return NextResponse.json({ ok: false, message: "Token requerido." }, { status: 400 });
    }

    const reset = readPasswordResetToken(body.token);

    return NextResponse.json({
      ok: true,
      reset: {
        name: reset.name,
        email: reset.email,
        createdAt: reset.createdAt,
        expiresAt: reset.expiresAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "El enlace para restablecer contraseña no es válido.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
