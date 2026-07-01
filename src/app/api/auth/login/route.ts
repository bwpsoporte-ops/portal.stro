import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";

type LoginRequest = {
  email?: string;
  password?: string;
};

type DbUser = {
  id: string;
  username: string;
  display_name: string;
  role: "Administrador" | "Usuario";
  status: "ACTIVO";
  created_at: Date;
  last_access: Date | null;
  invited_by_id: string | null;
  invited_by_name: string | null;
  invited_by_email: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginRequest;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ ok: false, message: "Usuario y contraseña son requeridos." }, { status: 400 });
    }

    const result = await query<DbUser>(
      `UPDATE app_users
       SET last_access = now(), updated_at = now()
       WHERE lower(username) = $1
         AND password_hash = crypt($2, password_hash)
         AND role = 'Usuario'
       RETURNING id, username, display_name, role, status, created_at, last_access, invited_by_id, invited_by_name, invited_by_email`,
      [email, password],
    );

    const user = result.rows[0];

    if (!user) {
      return NextResponse.json({ ok: false, message: "Usuario o contraseña incorrectos." }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.display_name,
        email: user.username,
        role: user.role,
        status: user.status,
        createdAt: user.created_at.toISOString(),
        lastAccess: user.last_access?.toISOString() ?? "Pendiente de primer acceso",
        invitedById: user.invited_by_id ?? undefined,
        invitedByName: user.invited_by_name ?? undefined,
        invitedByEmail: user.invited_by_email ?? undefined,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar sesión.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
