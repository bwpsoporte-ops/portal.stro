"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export type LanguageCode = "es" | "en";

const STORAGE_KEY = "roatanselfstorage-language";
const textTranslations: Record<string, string> = {
  Dashboard: "Dashboard",
  "Panel Administrativo": "Admin Panel",
  "Facturación Fiscal": "Fiscal Billing",
  "Control BAC, CAI, facturas y Storeganise.": "BAC, CAI, invoices, and Storeganise control.",
  Overview: "Overview",
  Facturas: "Invoices",
  "Pagos BAC": "BAC Payments",
  "CAI / Correlativos": "CAI / Correlatives",
  "Plantilla de Factura": "Invoice Template",
  Storeganise: "Storeganise",
  "Estado del Sistema": "System Status",
  Reportes: "Reports",
  Alertas: "Alerts",
  "Configuración": "Settings",
  "Cerrar sesión": "Sign Out",
  Notificaciones: "Notifications",
  "Cambiar idioma": "Change Language",
  "Roatan Self Storage": "Roatan Self Storage",
  Español: "Spanish",
  English: "English",

  "Inicie sesión para continuar": "Sign in to continue",
  Usuario: "User",
  Contraseña: "Password",
  "Usuario o contraseña incorrectos.": "Incorrect username or password.",
  "Iniciar sesión": "Sign In",
  "¿Ha olvidado su contraseña?": "Forgot your password?",
  "Ingresa el correo con el que activaste tu cuenta. Te enviaremos un enlace para crear una nueva contraseña.":
    "Enter the email used to activate your account. We will send you a link to create a new password.",
  "correo@empresa.com": "email@company.com",
  "Enviar enlace": "Send Link",
  "Enviando...": "Sending...",
  "Enviando enlace de restablecimiento...": "Sending reset link...",
  "Revisa tu correo para continuar.": "Check your email to continue.",
  "No se pudo enviar el enlace.": "The link could not be sent.",
  "Ingresa el correo de una cuenta activa. El usuario root no se restablece por correo.":
    "Enter the email of an active account. The root user cannot be reset by email.",

  "Vista general del sistema: facturación, pagos BAC, CAI, correo, alertas e integración con Storeganise.":
    "System overview: billing, BAC payments, CAI, email, alerts, and Storeganise integration.",
  "Total facturado hoy": "Total Billed Today",
  "Facturas emitidas el 2 de mayo de 2026": "Invoices issued on May 2, 2026",
  "Total facturado del mes": "Total Billed This Month",
  "Acumulado mensual": "Monthly accumulated total",
  "Pagos BAC aprobados": "Approved BAC Payments",
  "Transacciones confirmadas": "Confirmed transactions",
  "Pagos BAC pendientes": "Pending BAC Payments",
  "Requieren validación": "Require validation",
  "Facturas generadas": "Generated Invoices",
  "Documentos fiscales guardados": "Saved fiscal documents",
  "Facturas enviadas": "Sent Invoices",
  "Correos entregados o aceptados": "Delivered or accepted emails",
  "Correlativos disponibles": "Available Correlatives",
  "Alertas críticas": "Critical Alerts",
  "Pendientes de resolver": "Pending resolution",
  "CAI activo": "Active CAI",
  "No configurado": "Not configured",
  "LISTO PARA FACTURAR": "READY TO INVOICE",
  BLOQUEADO: "BLOCKED",
  "Últimos pagos BAC": "Latest BAC Payments",
  Cliente: "Customer",
  Monto: "Amount",
  Estado: "Status",
  Referencia: "Reference",
  Fecha: "Date",
  "Estado de Storeganise": "Storeganise Status",
  "Últimas facturas emitidas": "Latest Issued Invoices",
  Número: "Number",
  Total: "Total",
  Correo: "Email",
  Emisión: "Issue Date",

  "Solo consulta de facturas generadas automáticamente después de pagos confirmados. Aquí no se crean facturas manualmente.":
    "View-only list of invoices generated automatically after confirmed payments. Manual invoices are not created here.",
  "Filtrar por cliente o correo": "Filter by customer or email",
  "Todos los estados": "All statuses",
  Enviada: "Sent",
  Pendiente: "Pending",
  Fallida: "Failed",
  "Limpiar filtros": "Clear Filters",
  "Listado de facturas generadas": "Generated Invoices List",
  "No hay facturas con esos filtros.": "There are no invoices with those filters.",
  RTN: "RTN",
  ISV: "ISV",
  "CAI / Correlativo": "CAI / Correlative",
  "Referencia BAC": "BAC Reference",
  Acciones: "Actions",
  Reenviar: "Resend",
  Factura: "Invoice",
  "Datos del cliente": "Customer Details",
  "Fecha de emision": "Issue Date",
  "Rango autorizado": "Authorized Range",
  "Fecha limite": "Limit Date",
  Servicio: "Service",
  Cantidad: "Quantity",
  Precio: "Price",
  "Alquiler mensual de unidad de almacenamiento": "Monthly storage unit rental",
  Subtotal: "Subtotal",
  "La factura es beneficio de todos, exijala.": "The invoice benefits everyone, request it.",
  "Original: Adquiriente | Copia: Emisor": "Original: Buyer | Copy: Issuer",

  "Monitoreo de pagos procesados por BAC: estado real, referencia bancaria, confirmación, idempotencia y relación con la factura fiscal.":
    "Monitoring of BAC payments: real status, bank reference, confirmation, idempotency, and fiscal invoice relation.",
  "Pagos aprobados": "Approved Payments",
  "Pagos pendientes": "Pending Payments",
  "Pagos rechazados": "Rejected Payments",
  "No generan factura": "Do not generate invoices",
  "Pagos fallidos": "Failed Payments",
  "Crean alerta operativa": "Create an operational alert",
  "Total cobrado": "Total Collected",
  "Total pendiente": "Pending Total",
  "Por confirmar": "To be confirmed",
  "Última confirmación BAC": "Latest BAC Confirmation",
  "Errores BAC": "BAC Errors",
  "Cliente, correo, referencia o transacción": "Customer, email, reference, or transaction",
  "Factura Storeganise o fiscal": "Storeganise or fiscal invoice",
  "Tabla principal de pagos BAC": "Main BAC Payments Table",
  "Una factura fiscal solo nace de un pago BAC aprobado y validado contra idempotencia.":
    "A fiscal invoice is created only from an approved BAC payment validated against idempotency.",
  "No hay pagos BAC con esos filtros.": "There are no BAC payments with those filters.",
  "ID Pago": "Payment ID",
  "Estado BAC": "BAC Status",
  "Transacción BAC": "BAC Transaction",
  "Factura fiscal": "Fiscal Invoice",
  "Fecha creación": "Creation Date",
  "Fecha pago": "Payment Date",
  "Ver detalle": "View Details",
  "Consultar BAC": "Check BAC",
  Reintentar: "Retry",
  "Ver factura": "View Invoice",
  "Ver cliente": "View Customer",
  "Respuesta BAC": "BAC Response",
  "En revisión": "In Review",
  "Cerrar detalle": "Close Details",
  "Correo enviado": "Email Sent",
  "Correo pendiente": "Email Pending",

  "Administración fiscal de CAI, rangos autorizados, correlativos disponibles, vencimientos y control de emisión de facturas.":
    "Fiscal administration of CAI, authorized ranges, available correlatives, expirations, and invoice issuance control.",
  "Fecha límite": "Limit Date",
  "Bloquea si está vencido": "Blocks if expired",
  "Correlativos usados": "Used Correlatives",
  "Consumidos por facturas": "Consumed by invoices",
  "Capacidad restante": "Remaining capacity",
  "Porcentaje consumido": "Consumed Percentage",
  "Uso fiscal acumulado": "Accumulated fiscal use",
  "Rangos activos": "Active Ranges",
  "Debe existir solo uno por serie": "Only one per series should exist",
  "Rangos vencidos": "Expired Ranges",
  "No permiten emitir": "Do not allow issuing",
  "Vencimiento o rango agotado": "Expiration or depleted range",
  "Regla fiscal de emisión": "Fiscal Issuance Rule",
  "Facturación permitida": "Billing Allowed",
  "Facturación bloqueada": "Billing Blocked",
  "El consumo de correlativo debe hacerse con bloqueo transaccional del CAI activo.":
    "Correlative consumption must use transactional locking on the active CAI.",
  PERMITIDO: "ALLOWED",
  "Registrar nuevo CAI": "Register New CAI",
  "Rango inicial": "Initial Range",
  "Rango final": "Final Range",
  "Correlativo actual": "Current Correlative",
  "Tipo documento": "Document Type",
  Establecimiento: "Establishment",
  "Punto de emisión": "Issuing Point",
  Sucursal: "Branch",
  Notas: "Notes",
  "Tabla de CAI / Correlativos": "CAI / Correlatives Table",
  "No se debe editar una factura ya emitida para cambiarle CAI o correlativo.":
    "An already issued invoice must not be edited to change its CAI or correlative.",
  Disponibles: "Available",
  Usados: "Used",
  "Sin alertas": "No Alerts",
  Activar: "Activate",
  Desactivar: "Deactivate",
  "Editar rango": "Edit Range",
  "Ver historial": "View History",
  "Ver facturas": "View Invoices",
  Agotado: "Depleted",
  Bloquear: "Block",
  "Historial del CAI": "CAI History",
  "Auditoría de cambios, consumo de correlativos y acciones fiscales.": "Audit of changes, correlative use, and fiscal actions.",
  "Cerrar historial": "Close History",
  Acción: "Action",
  Anterior: "Previous",
  Nuevo: "New",
  "Factura relacionada": "Related Invoice",
  Comentario: "Comment",

  "Administra tu perfil, la seguridad de tu cuenta y el acceso de usuarios al dashboard.":
    "Manage your profile, account security, and user access to the dashboard.",
  "Usuario autenticado": "Authenticated User",
  Administrador: "Administrator",
  ACTIVO: "ACTIVE",
  "ID de usuario": "User ID",
  "Último acceso": "Last Access",
  Permisos: "Permissions",
  "Acceso completo al dashboard": "Full dashboard access",
  "Gestión de accesos": "Access Management",
  "Invitar usuario": "Invite User",
  "Crea un acceso para otro miembro del equipo y envíale la invitación por correo.":
    "Create access for another team member and email the invitation.",
  "Nombre completo": "Full Name",
  "Nombre del usuario": "User name",
  "Correo electrónico": "Email Address",
  "usuario@empresa.com": "user@company.com",
  "Contraseña temporal": "Temporary Password",
  "Mínimo 8 caracteres": "Minimum 8 characters",
  "Crear acceso": "Create Access",
  Seguridad: "Security",
  "Cambiar contraseña": "Change Password",
  "Actualiza periódicamente tu contraseña para proteger tu cuenta.": "Update your password periodically to protect your account.",
  "Contraseña actual": "Current Password",
  "Nueva contraseña": "New Password",
  "Confirmar nueva contraseña": "Confirm New Password",
  "Actualizar contraseña": "Update Password",
  "Usuarios con acceso": "Users With Access",
  "Cuentas habilitadas para ingresar a la plataforma.": "Accounts enabled to access the platform.",
  Rol: "Role",

  "Monitoreo de eventos críticos relacionados con CAI, correlativos, pagos BAC, correos, facturas y Storeganise.":
    "Monitoring of critical events related to CAI, correlatives, BAC payments, emails, invoices, and Storeganise.",
  "Alertas pendientes": "Pending Alerts",
  "Alertas resueltas": "Resolved Alerts",
  "CAI por vencer": "CAI Expiring",
  "Correlativos bajos": "Low Correlatives",
  "Errores Storeganise": "Storeganise Errors",
  "Correos fallidos": "Failed Emails",
  "Todos los niveles": "All Levels",
  "Todos los módulos": "All Modules",
  "Buscar mensaje o referencia": "Search message or reference",
  "Tabla de alertas": "Alerts Table",
  "Centro de control operativo, fiscal y técnico.": "Operational, fiscal, and technical control center.",
  Nivel: "Level",
  Tipo: "Type",
  Mensaje: "Message",
  "Módulo relacionado": "Related Module",
  "Marcar revisada": "Mark Reviewed",
  Resolver: "Resolve",

  "Generación de reportes de facturación, pagos BAC, ingresos, CAI, correlativos, correos y actividad fiscal.":
    "Generate reports for billing, BAC payments, revenue, CAI, correlatives, email, and fiscal activity.",
  "Exportar PDF": "Export PDF",
  "Exportar Excel": "Export Excel",
  "Exportar CSV": "Export CSV",
  Imprimir: "Print",
  "Total facturado": "Total Billed",
  "Total ISV": "Total ISV",
  "Impuesto calculado": "Calculated tax",
  "Ingresos netos": "Net Revenue",
  "Subtotal sin ISV": "Subtotal without ISV",
  "Correos enviados": "Sent Emails",
  "Facturas entregadas": "Delivered invoices",
  "Errores de correo": "Email Errors",
  "Requieren reenvío": "Require resend",
  "Capacidad fiscal": "Fiscal capacity",
  "Estado factura": "Invoice Status",
  "Estado correo": "Email Status",
  "Todos los CAI": "All CAI",
  Generar: "Generate",
  Resumen: "Summary",
  Correos: "Emails",
  Errores: "Errors",
  "Tabla principal de reportes": "Main Reports Table",
  "Reportes administrativos, contables y fiscales disponibles.": "Available administrative, accounting, and fiscal reports.",
  "Tipo de reporte": "Report Type",
  Descripción: "Description",
  "Total registros": "Total Records",
  "Total monto": "Total Amount",
  "Generado por": "Generated By",

  "Monitoreo de webhooks, eventos, facturas recibidas, clientes sincronizados, errores y reintentos entre Storeganise, BAC, facturación y dashboard.":
    "Monitoring of webhooks, events, received invoices, synced customers, errors, and retries across Storeganise, BAC, billing, and dashboard.",
  "Eventos recibidos hoy": "Events Received Today",
  "Eventos procesados": "Processed Events",
  "Eventos fallidos": "Failed Events",
  "Facturas Storeganise": "Storeganise Invoices",
  "Clientes sincronizados": "Synced Customers",
  "Última sincronización": "Latest Sync",
  "Reintentos pendientes": "Pending Retries",
  "Estado API Storeganise": "Storeganise API Status",
  "Buscar por cliente o correo": "Search by customer or email",
  "Factura Storeganise": "Storeganise Invoice",
  "Todos los eventos": "All Events",
  "Tabla principal de webhooks": "Main Webhooks Table",
  "Todo evento recibido se conserva aunque falle; los duplicados se identifican antes de generar registros.":
    "Every received event is preserved even if it fails; duplicates are identified before records are generated.",
  Evento: "Event",
  "Fecha recibido": "Received Date",
  Procesado: "Processed",
  Error: "Error",
  "Ver payload": "View Payload",
  "Marcar revisado": "Mark Reviewed",
  "Ver pago": "View Payment",
  "Flujo de integración": "Integration Flow",

  "Panel de salud operativa para BAC, Storeganise, correo, PDF, webhooks, facturas y procesos pendientes.":
    "Operational health panel for BAC, Storeganise, email, PDF, webhooks, invoices, and pending processes.",
  "Servicios críticos": "Critical Services",
  "Requieren atención inmediata": "Require immediate attention",
  "Servicios degradados": "Degraded Services",
  "Operan con pendientes": "Operate with pending items",
  "Procesos en cola": "Queued Processes",
  "Pendientes o bloqueados": "Pending or blocked",
  "Capacidad fiscal actual": "Current fiscal capacity",
  "Salud por servicio": "Service Health",
  "Estado calculado desde pagos, eventos, facturas, PDF y correlativos.":
    "Status calculated from payments, events, invoices, PDF, and correlatives.",
  "Abrir modulo": "Open Module",
  "Ultimo webhook recibido": "Latest Webhook Received",
  "Ultima factura generada": "Latest Generated Invoice",
  "Cola de procesos pendientes": "Pending Process Queue",
  "Pagos por confirmar, correos por reenviar y eventos por sincronizar.":
    "Payments to confirm, emails to resend, and events to sync.",
  Proceso: "Process",
  Modulo: "Module",
  Prioridad: "Priority",
  Creado: "Created",
  Completar: "Complete",
  "Ver origen": "View Source",
  "No hay procesos pendientes.": "There are no pending processes.",
};

const regexTranslations: Array<[RegExp, string]> = [
  [/^PDF de factura (.+) preparado para descarga\.$/, "Invoice $1 PDF prepared for download."],
  [/^Factura (.+) reenviada a (.+)\.$/, "Invoice $1 resent to $2."],
  [/^Alerta (.+) marcada como (.+)\.$/, "Alert $1 marked as $2."],
  [/^(.+) iniciado para (.+)\. La alerta queda en revisión\.$/, "$1 started for $2. The alert is now in review."],
  [/^Evento (.+) marcado para reintento\. Estado interno: RETRYING\.$/, "Event $1 marked for retry. Internal status: RETRYING."],
  [/^Reporte "(.+)" generado en formato (.+)\.$/, 'Report "$1" generated in $2 format.'],
  [/^Reporte "(.+)" actualizado con (.+) facturas\.$/, 'Report "$1" updated with $2 invoices.'],
  [/^Proceso (.+) marcado como completado\.$/, "Process $1 marked as completed."],
  [/^(.+) iniciado para (.+)\. El proceso queda en revision\.$/, "$1 started for $2. The process is now in review."],
];

const textNodeOriginals = new WeakMap<Text, string>();
const elementOriginals = new WeakMap<Element, Record<string, string>>();

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function translateText(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return value;
  }

  const exact = textTranslations[trimmed];

  if (exact) {
    return value.replace(trimmed, exact);
  }

  for (const [pattern, replacement] of regexTranslations) {
    if (pattern.test(trimmed)) {
      return value.replace(trimmed, trimmed.replace(pattern, replacement));
    }
  }

  return value;
}

function shouldSkipNode(node: Node) {
  const parent = node.parentElement;

  if (!parent) {
    return true;
  }

  return Boolean(parent.closest("script, style, svg, code, pre"));
}

function applyDomLanguage(language: LanguageCode) {
  if (typeof document === "undefined") {
    return;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;

    if (!shouldSkipNode(textNode)) {
      if (!textNodeOriginals.has(textNode)) {
        textNodeOriginals.set(textNode, textNode.nodeValue ?? "");
      }

      const original = textNodeOriginals.get(textNode) ?? "";
      textNode.nodeValue = language === "en" ? translateText(original) : original;
    }

    node = walker.nextNode();
  }

  document.querySelectorAll("[placeholder], [title], [aria-label]").forEach((element) => {
    const original = elementOriginals.get(element) ?? {};

    ["placeholder", "title", "aria-label"].forEach((attribute) => {
      const value = element.getAttribute(attribute);

      if (value && !original[attribute]) {
        original[attribute] = value;
      }

      if (original[attribute]) {
        element.setAttribute(attribute, language === "en" ? translateText(original[attribute]) : original[attribute]);
      }
    });

    elementOriginals.set(element, original);
  });
}

function getStoredLanguage(): LanguageCode {
  if (typeof window === "undefined") {
    return "es";
  }

  return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "es";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => getStoredLanguage());
  const languageRef = useRef(language);
  const isApplyingRef = useRef(false);

  const setLanguage = (nextLanguage: LanguageCode) => {
    languageRef.current = nextLanguage;
    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
    document.body.classList.add("language-is-changing");
    isApplyingRef.current = true;
    applyDomLanguage(nextLanguage);
    window.setTimeout(() => {
      applyDomLanguage(nextLanguage);
      isApplyingRef.current = false;
    }, 0);

    window.setTimeout(() => {
      document.body.classList.remove("language-is-changing");
    }, 260);
  };

  useEffect(() => {
    document.documentElement.lang = language;
    languageRef.current = language;
    applyDomLanguage(language);

    const observer = new MutationObserver(() => {
      if (isApplyingRef.current) {
        return;
      }

      isApplyingRef.current = true;
      window.setTimeout(() => {
        applyDomLanguage(languageRef.current);
        isApplyingRef.current = false;
      }, 0);
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });

    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage debe usarse dentro de LanguageProvider.");
  }

  return context;
}

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const handleLanguageSelect = (nextLanguage: LanguageCode) => {
    setLanguage(nextLanguage);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-expanded={isOpen}
        aria-label="Cambiar idioma"
        title="Cambiar idioma"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-sky-300/70 bg-white/15 text-white transition hover:bg-white/25"
      >
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
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 0 20" />
          <path d="M12 2a15.3 15.3 0 0 0 0 20" />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-50 w-36 overflow-hidden rounded-md border border-sky-100 bg-white py-1 text-sm font-black text-slate-700 shadow-xl shadow-sky-900/15">
          <button
            type="button"
            onClick={() => handleLanguageSelect("es")}
            className={`flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-sky-50 ${language === "es" ? "text-sky-700" : ""}`}
          >
            <span>Español</span>
            {language === "es" ? <span aria-hidden="true">*</span> : null}
          </button>
          <button
            type="button"
            onClick={() => handleLanguageSelect("en")}
            className={`flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-sky-50 ${language === "en" ? "text-sky-700" : ""}`}
          >
            <span>English</span>
            {language === "en" ? <span aria-hidden="true">*</span> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
