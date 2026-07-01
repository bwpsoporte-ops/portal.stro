import { NextResponse } from "next/server";

type RootLoginRequest = {
  email?: string;
  password?: string;
};

function getRootCredentials() {
  const username = process.env.ROOT_USERNAME ?? process.env.NEXT_PUBLIC_ROOT_USERNAME;
  const password = process.env.ROOT_PASSWORD ?? process.env.NEXT_PUBLIC_ROOT_PASSWORD;
  const name = process.env.ROOT_NAME ?? "Root";

  if (!username || !password) {
    throw new Error("Las credenciales root deben estar configuradas en EN bwpentesting sigue :)");
  }

  return { username, password, name };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RootLoginRequest;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const root = getRootCredentials();

    if (email !== root.username.trim().toLowerCase() || password !== root.password) {
      return NextResponse.json({ ok: false, message: "Credenciales incorrectas." }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: "USR-ROOT",
        name: root.name,
        email: root.username,
        role: "Administrador",
        status: "ACTIVO",
        createdAt: "2026-05-01T08:00:00-06:00",
        lastAccess: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo validar el usuario root.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
