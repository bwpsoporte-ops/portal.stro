"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton, TextInput } from "@/components/ui";
import { changePassword, DashboardUser, getCurrentUser, getUsers } from "@/lib/auth";

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
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setCurrentUser(getCurrentUser());
      setUsers(getUsers());
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

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
              <h2 className="mt-1 text-xl font-black text-slate-950">{currentUser?.name ?? "Administrador RSS"}</h2>
              <p className="mt-1 text-sm text-slate-500">{currentUser?.email ?? "admin@roatanselfstorage.com"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge tone="green">{currentUser?.status ?? "ACTIVO"}</StatusBadge>
                <StatusBadge tone="blue">{currentUser?.role ?? "Administrador"}</StatusBadge>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 border-t border-sky-100 pt-4 text-sm sm:grid-cols-3">
            <div><p className="text-xs font-black uppercase text-slate-400">ID de usuario</p><p className="mt-1 font-bold text-slate-700">{currentUser?.id ?? "USR-001"}</p></div>
            <div><p className="text-xs font-black uppercase text-slate-400">Último acceso</p><p className="mt-1 font-bold text-slate-700">{currentUser ? formatDate(currentUser.lastAccess) : "-"}</p></div>
            <div><p className="text-xs font-black uppercase text-slate-400">Permisos</p><p className="mt-1 font-bold text-slate-700">Acceso completo al dashboard</p></div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-black uppercase text-sky-600">Gestión de accesos</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Usuario root único</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">El acceso al dashboard queda limitado al usuario ROOT.BWP configurado en .env.local.</p>
            <div className="mt-5 rounded-md border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-800">
              No se crean usuarios adicionales desde esta pantalla.
            </div>
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
            <h2 className="font-black text-slate-950">Usuarios con acceso</h2>
            <p className="mt-1 text-sm text-slate-500">Cuentas habilitadas para ingresar a la plataforma.</p>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="font-bold text-slate-900">{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td><StatusBadge tone="green">{user.status}</StatusBadge></td>
                    <td>{formatDate(user.lastAccess)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
