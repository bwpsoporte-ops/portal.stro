"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
      <Link aria-label={label} title={label} href={href} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-sky-300/70 bg-white/15 text-white transition hover:bg-white/25">
        {content}
      </Link>
    );
  }

  return (
    <button
      aria-label={label}
      title={label}
      type="button"
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-sky-300/70 bg-white/15 text-white transition hover:bg-white/25"
    >
      {content}
    </button>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  const visibleMenu = menu.filter((item) => !item.rootOnly || isRootUser(currentUser));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const user = getCurrentUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      if (pathname === "/dashboard/estado-sistema" && !isRootUser(user)) {
        router.replace("/dashboard/overview");
        return;
      }

      setCurrentUser(user);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [pathname, router]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`no-print relative hidden shrink-0 bg-[#4188ef] text-white shadow-2xl shadow-sky-900/25 transition-[width] duration-200 md:flex md:flex-col ${
          collapsed ? "w-20" : "w-62"
        }`}
      >
        <button
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="absolute -right-3 top-6 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-700 shadow-lg shadow-sky-900/20 transition hover:bg-sky-50"
        >
          <svg
            aria-hidden="true"
            className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div className={`border-b border-white/12 px-2 py-6 ${collapsed ? "px-3" : ""}`}>
          <div className={`flex items-center justify-center   ${collapsed ? "h-15 w-15 p-3" : "w-full p-3"}`}>
            <Image
              alt="Roatan Self Storage"
              className={`h-auto ${collapsed ? "w-10" : "w-30"}`}
              height={206}
              priority
              src="/logologin.png"
              width={263}
            />
          </div>
          {!collapsed ? (
            <>
              <p className="mt-4 text-xs font-black uppercase text-sky-100">Roatan Self Storage</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-white">Facturación Fiscal</h2>
              <p className="mt-2 text-xs font-semibold leading-5 text-sky-50/90">Control BAC, CAI, facturas y Storeganise.</p>
            </>
          ) : null}
        </div>
        <nav className="flex-1 space-y-1.5 p-3">
          {visibleMenu.filter((item) => !item.mobileOnly).map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-extrabold transition ${
                  active
                    ? "bg-white text-sky-800 shadow-lg shadow-sky-900/15"
                    : "text-sky-50 hover:bg-white/14 hover:text-white"
                } ${collapsed ? "justify-center px-2" : ""}`}
              >
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    active ? "bg-sky-50 text-sky-700" : "bg-white/12 text-white"
                  }`}
                >
                  <Icon name={item.icon} />
                </span>
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/15 p-3">
          <button
            aria-label="Cerrar sesión"
            title={collapsed ? "Cerrar sesión" : undefined}
            type="button"
            onClick={handleLogout}
            className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-extrabold text-sky-50 transition hover:bg-white/14 hover:text-white ${collapsed ? "justify-center px-2" : ""}`}
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/12 text-white">
              <Icon name="logout" />
            </span>
            {!collapsed ? <span>Cerrar sesión</span> : null}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex min-h-16 items-center justify-between gap-3 border-b border-[#2f70d6] bg-[#4188ef] px-4 text-white shadow-lg shadow-sky-900/15 md:px-6">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-sky-100">Panel Administrativo</p>
            <p className="truncate text-sm font-bold text-white">{currentUser ? `${currentUser.name} | ${currentUser.email}` : "Roatan Self Storage"}</p>
          </div>
          <div className="flex items-center gap-2">
            <ToolbarIcon href="/dashboard/alertas" label="Notificaciones">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </ToolbarIcon>
            <ToolbarIcon href="/dashboard/configuracion" label="Configuración">
              <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Zm7.4-2.3a8 8 0 0 0 0-2.4l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2-1.2L14.7 3h-5.4L9 5.6a8 8 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 2 1.2l.3 2.6h5.4l.3-2.6a8 8 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5Z" />
            </ToolbarIcon>
          </div>
        </header>

        <div className="no-print border-b border-sky-100 bg-white p-3 md:hidden">
          <select
            value={visibleMenu.find((item) => item.href === pathname)?.href ?? "/dashboard/overview"}
            onChange={(event) => {
              window.location.href = event.target.value;
            }}
            className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-sky-400"
          >
            {visibleMenu.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_right,#e0f7ff_0,#f8fafc_34%,#eef8ff_100%)]">{children}</main>
      </div>
    </div>
  );
}
