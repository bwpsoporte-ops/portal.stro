"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { login, logout } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    logout();

    const handlePageShow = () => {
      logout();
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const user = login(email, password);

    if (!user) {
      setMessage("Usuario o contraseña incorrectos.");
      return;
    }

    router.replace("/dashboard/overview");
  };

  
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eaf4fb] px-4">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#f8fcff_0%,#e5f3fb_48%,#c8e6f6_100%)]" />
      <div className="absolute -left-24 top-0 h-full w-[46%] skew-x-[-12deg] bg-white/72 shadow-[28px_0_70px_rgba(2,132,199,0.12)]" />
      <div className="absolute right-[-14%] top-0 h-full w-[44%] skew-x-[-12deg] bg-[#5bbbe8]/22" />
      <div className="absolute right-[-7%] top-0 h-full w-[30%] skew-x-[-12deg] bg-[#1688c7]/18" />
      <div className="absolute bottom-0 left-0 h-32 w-full bg-gradient-to-t from-[#9fd6ef]/42 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/90" />
      <div className="absolute left-10 top-10 h-20 w-56 border-l-4 border-sky-500/45 bg-white/24" />
      <div className="absolute bottom-12 right-10 h-24 w-72 border-r-4 border-blue-500/35 bg-white/20" />

      <section className="relative z-10 w-full max-w-sm bg-white rounded shadow-2xl overflow-hidden">
        {/* Header azul con logo más grande */}
        <div className="bg-blue-500 px-6 py-6 flex flex-col items-center justify-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white overflow-hidden shadow-lg">
            <Image
              src="/roatanselfstorage.png"
              alt="Logo Roatan Self Storage"
              width={80}
              height={80}
              className="h-20 w-20 object-contain"
              priority
            />
          </div>

          <span className="text-white text-2xl font-bold tracking-wide">
            Roatan Self Storage
          </span>
        </div>

        {/* Cuerpo del formulario */}
        <div className="px-8 py-6">
          <h2 className="text-gray-700 text-base font-normal mb-5">
            Inicie sesión para continuar
          </h2>

          <form className="space-y-3" onSubmit={handleLogin}>
            {/* Campo de email */}
            <div className="flex items-center border border-gray-300 rounded overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-400">
              <span className="px-3 py-2 bg-gray-100 border-r border-gray-300 text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </span>

              <input
                id="email"
                type="text"
                placeholder="Usuario"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="flex-1 px-3 py-2 text-sm text-gray-800 outline-none bg-white placeholder-gray-400"
                required
              />
            </div>

            {/* Campo de contraseña */}
            <div className="flex items-center border border-gray-300 rounded overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-400">
              <span className="px-3 py-2 bg-gray-100 border-r border-gray-300 text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect
                    x="5"
                    y="11"
                    width="14"
                    height="10"
                    rx="2"
                    ry="2"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 11V7a4 4 0 018 0v4"
                  />
                </svg>
              </span>

              <input
                id="password"
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="flex-1 px-3 py-2 text-sm text-gray-800 outline-none bg-white placeholder-gray-400"
                required
              />
            </div>

            {message ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                {message}
              </p>
            ) : null}

            {/* Botón iniciar sesión */}
            <button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2.5 rounded transition-colors duration-200"
            >
              Iniciar sesión
            </button>
          </form>

          {/* Enlace olvidé contraseña */}
          <div className="mt-4 text-center">
            <a href="#" className="text-sm text-blue-500 hover:underline">
              ¿Ha olvidado su contraseña?
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
