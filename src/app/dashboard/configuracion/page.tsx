"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton, TextInput } from "@/components/ui";
import { changePassword, DashboardUser, getCurrentUser, getUsers, inviteUser, isRootUser } from "@/lib/auth";

function formatDate(value: string) {
  if (value === "Pendiente de primer acceso") return value;
  return new Intl.DateTimeFormat("es-HN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export default function ConfiguracionPage() {
  const [currentUser, setCurrentUser] = useState<DashboardUser | null>(null);
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [inviteMessage, setInviteMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [isInviteSending, setIsInviteSending] = useState(false);
  const visibleUsers = currentUser && !isRootUser(currentUser)
    ? users.filter((user) => user.invitedById === currentUser.id)
    : users;

  useEffect(() => {
    async function loadUsers() {
      try {
        const response = await fetch("/api/users");
        const data = (await response.json()) as { ok: boolean; users?: DashboardUser[] };

        if (response.ok && data.ok && data.users) {
          setUsers(data.users);
          return;
        }
      } catch {
        // Local fallback keeps the settings screen usable if the database is unavailable.
      }

      setUsers(getUsers());
    }

    const timeout = window.setTimeout(() => {
      setCurrentUser(getCurrentUser());
      loadUsers();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    if (password.length < 8) {
      setInviteMessage("La contraseña temporal debe tener al menos 8 caracteres.");
      return;
    }

    if (!currentUser) {
      setInviteMessage("No se pudo identificar el usuario autenticado.");
      return;
    }

    if (getUsers().some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) {
      setInviteMessage("Ya existe un usuario registrado con ese correo.");
      return;
    }

    setIsInviteSending(true);
    setInviteMessage("Enviando invitación por correo...");

    const response = await fetch("/api/invitations/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        temporaryPassword: password,
        invitedById: currentUser.id,
        invitedByName: currentUser.name,
        invitedByEmail: currentUser.email,
      }),
    });
    const data = (await response.json()) as { ok: boolean; message: string };

    if (!response.ok || !data.ok) {
      setInviteMessage(data.message ?? "No se pudo enviar la invitación.");
      setIsInviteSending(false);
      return;
    }

    const result = inviteUser(name, email, password, currentUser);
    setInviteMessage(result.ok ? `${data.message} El acceso quedó creado como pendiente de primer ingreso.` : result.message);
    if (result.ok) {
      try {
        const usersResponse = await fetch("/api/users");
        const usersData = (await usersResponse.json()) as { ok: boolean; users?: DashboardUser[] };
        setUsers(usersResponse.ok && usersData.ok && usersData.users ? usersData.users : getUsers());
      } catch {
        setUsers(getUsers());
      }
      event.currentTarget.reset();
    }
    setIsInviteSending(false);
  };

  const handlePasswordChange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) return;

    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const nextPassword = String(form.get("nextPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (nextPassword.length < 8) {
      setPasswordMessage("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (nextPassword !== confirmPassword) {
      setPasswordMessage("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    const result = changePassword(currentUser.id, currentPassword, nextPassword);
    setPasswordMessage(result.message);
    if (result.ok) event.currentTarget.reset();
  };

  return (
    <>
      <PageHeader title="Configuración" description="Administra tu perfil, la seguridad de tu cuenta y el acceso de usuarios al dashboard." />
      <div className="space-y-5 p-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-xl font-black text-sky-700">
              {currentUser?.name.split(" ").map((part) => part[0]).slice(0, 2).join("") ?? "RS"}
            </div>
            <div>
              <p className="text-xs font-black uppercase text-sky-600">Usuario autenticado</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{currentUser?.name ?? "Cargando usuario..."}</h2>
              <p className="mt-1 text-sm text-slate-500">{currentUser?.email ?? "Validando sesión..."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentUser ? (
                  <>
                    <StatusBadge tone="green">{currentUser.status}</StatusBadge>
                    <StatusBadge tone="blue">{currentUser.role}</StatusBadge>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 border-t border-sky-100 pt-4 text-sm sm:grid-cols-3">
            <div><p className="text-xs font-black uppercase text-slate-400">ID de usuario</p><p className="mt-1 font-bold text-slate-700">{currentUser?.id ?? "-"}</p></div>
            <div><p className="text-xs font-black uppercase text-slate-400">Último acceso</p><p className="mt-1 font-bold text-slate-700">{currentUser ? formatDate(currentUser.lastAccess) : "-"}</p></div>
            <div><p className="text-xs font-black uppercase text-slate-400">Permisos</p><p className="mt-1 font-bold text-slate-700">Acceso completo al dashboard</p></div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-black uppercase text-sky-600">Gestión de accesos</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Invitar usuario</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Crea un acceso para otro miembro del equipo y envíale la invitación por correo.</p>
            <form className="mt-5 space-y-4" onSubmit={handleInvite}>
              <Field label="Nombre completo"><TextInput name="name" placeholder="Nombre del usuario" required /></Field>
              <Field label="Correo electrónico"><TextInput name="email" placeholder="usuario@empresa.com" required type="email" /></Field>
              <Field label="Contraseña temporal"><TextInput minLength={8} name="password" placeholder="Mínimo 8 caracteres" required type="password" /></Field>
              {inviteMessage ? <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{inviteMessage}</p> : null}
              <button
                type="submit"
                disabled={isInviteSending}
                className="rounded-md bg-sky-500 px-3 py-2 text-sm font-black text-white shadow-sm shadow-sky-900/20 transition hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isInviteSending ? "Enviando..." : "Crear acceso"}
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-black uppercase text-sky-600">Seguridad</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Cambiar contraseña</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Actualiza periódicamente tu contraseña para proteger tu cuenta.</p>
            <form className="mt-5 space-y-4" onSubmit={handlePasswordChange}>
              <Field label="Contraseña actual"><TextInput name="currentPassword" required type="password" /></Field>
              <Field label="Nueva contraseña"><TextInput minLength={8} name="nextPassword" required type="password" /></Field>
              <Field label="Confirmar nueva contraseña"><TextInput minLength={8} name="confirmPassword" required type="password" /></Field>
              {passwordMessage ? <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700">{passwordMessage}</p> : null}
              <ActionButton type="submit">Actualizar contraseña</ActionButton>
            </form>
          </section>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-black text-slate-950">{currentUser && !isRootUser(currentUser) ? "Usuarios invitados por ti" : "Usuarios con acceso"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {currentUser && !isRootUser(currentUser)
                ? "Cuentas que invitaste desde tu usuario."
                : "Cuentas habilitadas para ingresar a la plataforma."}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Invitado por</th></tr></thead>
              <tbody>
                {visibleUsers.length ? visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <p className="font-bold text-slate-900">{user.name}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{user.id}</p>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td><StatusBadge tone="green">{user.status}</StatusBadge></td>
                    <td>{formatDate(user.lastAccess)}</td>
                    <td>{user.invitedByName ? `${user.invitedByName} | ${user.invitedByEmail}` : "Sin registro"}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="text-center font-bold text-slate-500">No hay usuarios invitados todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
