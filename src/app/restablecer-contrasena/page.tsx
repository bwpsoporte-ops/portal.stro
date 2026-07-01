"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getUsers, isRootUser, logout } from "@/lib/auth";

type PasswordResetPreview = {
  name: string;
  email: string;
  expiresAt: string;
};

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [reset, setReset] = useState<PasswordResetPreview | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadReset() {
      if (!token) {
        setMessage("El enlace no contiene token.");
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string; reset?: PasswordResetPreview };

      if (!response.ok || !data.ok || !data.reset) {
        setMessage(data.message ?? "El enlace no es válido.");
        setIsLoading(false);
        return;
      }

      setReset(data.reset);
      setIsLoading(false);
    }

    loadReset();
  }, [token]);

  const handleResetPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reset) return;

    const form = new FormData(event.currentTarget);
    const nextPassword = String(form.get("nextPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (nextPassword.length < 8) {
      setMessage("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (nextPassword !== confirmPassword) {
      setMessage("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    setIsSubmitting(true);
    const users = getUsers();
    const user = users.find((item) => item.email.toLowerCase() === reset.email.trim().toLowerCase());

    if (!user) {
      setMessage("No se encontró una cuenta activa con ese correo.");
      setIsSubmitting(false);
      return;
    }

    if (isRootUser(user)) {
      setMessage("La contraseña del usuario root se administra desde .env.local.");
      setIsSubmitting(false);
      return;
    }

    window.localStorage.setItem(
      "rss-dashboard-users",
      JSON.stringify(users.map((item) => (item.id === user.id ? { ...item, password: nextPassword } : item))),
    );
    logout();
    setMessage("Contraseña actualizada correctamente. Ya puedes iniciar sesión.");
    setIsSubmitting(false);
    window.setTimeout(() => router.replace("/login"), 1000);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eaf4fb] px-4">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#f8fcff_0%,#e5f3fb_48%,#c8e6f6_100%)]" />
      <div className="absolute -left-24 top-0 h-full w-[46%] skew-x-[-12deg] bg-white/72 shadow-[28px_0_70px_rgba(2,132,199,0.12)]" />
      <div className="absolute right-[-14%] top-0 h-full w-[44%] skew-x-[-12deg] bg-[#5bbbe8]/22" />
      <div className="absolute right-[-7%] top-0 h-full w-[30%] skew-x-[-12deg] bg-[#1688c7]/18" />

      <section className="relative z-10 w-full max-w-md overflow-hidden rounded bg-white shadow-2xl">
        <div className="bg-blue-500 px-6 py-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white shadow-lg">
            <Image src="/roatanselfstorage.png" alt="Logo Roatan Self Storage" width={80} height={80} className="h-20 w-20 object-contain" priority />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-wide text-white">Nueva contraseña</h1>
        </div>

        <div className="px-8 py-6">
          {isLoading ? <p className="text-sm font-semibold text-slate-600">Validando enlace...</p> : null}

          {!isLoading && reset ? (
            <>
              <p className="text-sm leading-6 text-slate-600">
                Restablecimiento para <strong className="text-slate-900">{reset.name}</strong>
                <br />
                <span className="text-sky-700">{reset.email}</span>
              </p>

              <form className="mt-5 space-y-3" onSubmit={handleResetPassword}>
                <input name="nextPassword" type="password" placeholder="Nueva contraseña" className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-400" minLength={8} required />
                <input name="confirmPassword" type="password" placeholder="Confirmar nueva contraseña" className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-400" minLength={8} required />

                {message ? <p className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">{message}</p> : null}

                <button type="submit" disabled={isSubmitting} className="w-full rounded bg-blue-500 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? "Guardando..." : "Guardar nueva contraseña"}
                </button>
              </form>
            </>
          ) : null}

          {!isLoading && !reset && message ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#eaf4fb] px-4">
          <section className="w-full max-w-md rounded bg-white px-8 py-6 shadow-2xl">
            <p className="text-sm font-semibold text-slate-600">Cargando restablecimiento...</p>
          </section>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
