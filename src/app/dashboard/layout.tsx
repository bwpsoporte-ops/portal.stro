"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { getCurrentUser, isRootUser, logout } from "@/lib/auth";

type MenuItem = {
  href: string;
  label: string;
  icon: string;
  mobileOnly?: boolean;
  rootOnly?: boolean;
};

const menu: MenuItem[] = [
  { href: "/dashboard/overview", label: "Overview", icon: "grid" },
  { href: "/dashboard/facturas", label: "Facturas", icon: "invoice" },
  { href: "/dashboard/proformas", label: "Proformas", icon: "template" },
  { href: "/dashboard/caja", label: "Caja", icon: "cash" },
  { href: "/dashboard/pagos-servicios", label: "Pagos de servicios", icon: "services" },
  { href: "/dashboard/facturas-servicios", label: "emitidos de servicios", icon: "invoice" },
  { href: "/dashboard/pagos-bac", label: "Pagos BAC", icon: "card" },
  { href: "/dashboard/cai-correlativos", label: "CAI / Correlativos", icon: "shield" },
  { href: "/dashboard/plantilla-factura", label: "Plantilla de Factura", icon: "template" },
  { href: "/dashboard/storeganise", label: "Storeganise", icon: "sync" },
  { href: "/dashboard/estado-sistema", label: "Estado del Sistema", icon: "pulse", rootOnly: true },
  { href: "/dashboard/reportes", label: "Reportes", icon: "chart" },
  { href: "/dashboard/alertas", label: "Alertas", icon: "alert" },
  { href: "/dashboard/configuracion", label: "Configuración", icon: "settings", mobileOnly: true },
];

const icons: Record<string, React.ReactNode> = {
  grid: (
    <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />
  ),
  invoice: (
    <path d="M6 3h10l3 3v15l-3-1.5L13 21l-3-1.5L7 21l-3-1.5V5a2 2 0 0 1 2-2Zm9 0v4h4M8 10h8M8 14h8M8 18h4" />
  ),
  card: (
    <path d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm0 4h16M7 15h4" />
  ),
  services: (
    <path d="M12 2v20M17 5.5A4.5 4.5 0 0 0 12 3c-2.8 0-5 1.6-5 4s2 3.5 5 4 5 1.6 5 4-2.2 4-5 4a5.5 5.5 0 0 1-5-2.5M3 12h18" />
  ),
  cash: (
    <path d="M3 6h18v12H3V6Zm4 3a3 3 0 0 1-3 3m13-3a3 3 0 0 0 3 3M7 15a3 3 0 0 0-3-3m13 3a3 3 0 0 1 3-3m-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
  ),
  shield: (
    <path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Zm-3 9 2 2 4-5" />
  ),
  template: (
    <path d="M5 4h14v16H5V4Zm3 4h8M8 12h8M8 16h5" />
  ),
  sync: (
    <path d="M17 2v5h-5M7 22v-5h5M19 11a7 7 0 0 0-12-5l-2 2M5 13a7 7 0 0 0 12 5l2-2" />
  ),
  pulse: (
    <path d="M3 12h4l2-7 4 14 2-7h6M5 20h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
  ),
  chart: (
    <path d="M4 19h16M7 16V9M12 16V5M17 16v-4" />
  ),
  alert: (
    <path d="M12 3 22 20H2L12 3Zm0 6v5m0 3h.01" />
  ),
  settings: (
    <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Zm7.4-2.3a8 8 0 0 0 0-2.4l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2-1.2L14.7 3h-5.4L9 5.6a8 8 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 2 1.2l.3 2.6h5.4l.3-2.6a8 8 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5Z" />
  ),
  logout: (
    <path d="M10 17l5-5-5-5M15 12H3m12-9h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {icons[name]}
    </svg>
  );
}

function ToolbarIcon({ label, children, href }: { label: string; children: React.ReactNode; href?: string }) {
  const content = (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );

  if (href) {
    return (
      <Link aria-label={label} title={label} href={href} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sky-300/70 bg-white/15 text-white transition hover:bg-white/25">
        {content}
      </Link>
    );
  }

  return (
    <button
      aria-label={label}
      title={label}
      type="button"
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sky-300/70 bg-white/15 text-white transition hover:bg-white/25"
    >
      {content}
    </button>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const visibleMenu = menu.filter((item) => !item.rootOnly || isRootUser(currentUser));

  useEffect(() => {
    const validateSession = () => {
      setIsSessionReady(false);
      const user = getCurrentUser();

      if (!user) {
        setCurrentUser(null);
        router.replace("/login");
        return;
      }

      if (pathname === "/dashboard/estado-sistema" && !isRootUser(user)) {
        router.replace("/dashboard/overview");
        return;
      }

      setCurrentUser(user);
      setIsSessionReady(true);
    };

    const timeout = window.setTimeout(validateSession, 0);
    window.addEventListener("pageshow", validateSession);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("pageshow", validateSession);
    };
  }, [pathname, router]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="no-print sticky top-0 z-40 border-b border-[#2f70d6] bg-[#4188ef] text-white shadow-lg shadow-sky-900/20">
        <div className="flex min-h-16 items-center gap-3 px-3 md:px-4">
          <Link href="/dashboard/overview" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border border-white bg-white p-2 shadow-md shadow-black/20">
              <Image alt="Roatan Self Storage" className="h-auto w-9" height={206} priority src="/logologin.png" width={263} />
            </span>
            <span className="hidden min-w-0 2xl:block">
              <span className="block truncate text-sm font-black tracking-tight text-white md:text-base">Roatan Self Storage</span>
              <span className="block truncate text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100">Portal administrativo</span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 self-stretch overflow-x-auto md:block">
            <div className="flex h-full w-max min-w-full items-stretch justify-center gap-0.5">
              {visibleMenu.filter((item) => !item.mobileOnly).map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`group relative flex min-h-16 items-center gap-2 px-2.5 text-xs font-extrabold transition ${
                      active ? "bg-white text-sky-800" : "text-sky-50 hover:bg-white/12 hover:text-white"
                    }`}
                  >
                    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                      active ? "bg-sky-50 text-sky-700" : "bg-white/12 text-white group-hover:bg-white/20"
                    }`}>
                      <Icon name={item.icon} />
                    </span>
                    <span className="hidden whitespace-nowrap xl:inline">{item.label}</span>
                    {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-sky-600" /> : null}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="mr-2 hidden text-right lg:block">
              <p className="text-xs font-black text-white">{currentUser?.name ?? "Administrador"}</p>
              <p className="max-w-52 truncate text-[11px] font-semibold text-sky-100">{currentUser?.email ?? ""}</p>
            </div>
            <LanguageToggle />
            <ToolbarIcon href="/dashboard/alertas" label="Notificaciones">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </ToolbarIcon>
            <ToolbarIcon href="/dashboard/configuracion" label="Configuración">
              <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Zm7.4-2.3a8 8 0 0 0 0-2.4l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2-1.2L14.7 3h-5.4L9 5.6a8 8 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 2 1.2l.3 2.6h5.4l.3-2.6a8 8 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5Z" />
            </ToolbarIcon>
            <button
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-red-500 px-3 text-white shadow-sm transition hover:bg-red-600"
            >
              <Icon name="logout" />
              <span className="hidden text-xs font-black xl:inline">Salir</span>
            </button>
          </div>
        </div>

        <div className="border-t border-white/15 bg-[#397fe5] p-3 md:hidden">
          <select
            value={visibleMenu.find((item) => item.href === pathname)?.href ?? "/dashboard/overview"}
            onChange={(event) => {
              window.location.href = event.target.value;
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 shadow-sm outline-none focus:border-sky-400"
          >
            {visibleMenu.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_right,#e8f5eb_0,#f8fafc_34%,#f1f8f3_100%)]">{isSessionReady ? children : null}</main>
      <footer className="no-print border-t border-sky-100 bg-white/90 px-5 py-3 text-center text-[11px] font-semibold text-slate-400">
        Created by BWP
      </footer>
    </div>
  );
}
