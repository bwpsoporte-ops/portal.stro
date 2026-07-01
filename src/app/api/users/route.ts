import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";

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

export async function GET() {
  try {
    const result = await query<DbUser>(
      `SELECT id, username, display_name, role, status, created_at, last_access, invited_by_id, invited_by_name, invited_by_email
       FROM app_users
       WHERE role = 'Usuario'
       ORDER BY created_at DESC`,
    );

    return NextResponse.json({
      ok: true,
      users: result.rows.map((user) => ({
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
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron cargar los usuarios.";
    return NextResponse.json({ ok: false, message, users: [] }, { status: 500 });
  }
}
