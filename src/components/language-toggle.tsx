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
  Salir: "Sign Out",
  Caja: "Cashier",
  Proformas: "Proformas",
  "Factura proforma": "Proforma invoices",
  "Pagos de servicios": "Service Payments",
  "Facturas de servicios": "Service Invoices",
  "Caja (Cash Payment)": "Cashier (Cash Payment)",
  "Crea facturas manuales, selecciona la bodega y registra pagos en caja.": "Create manual invoices, select the storage unit, and record cash payments.",
  "Crea cotizaciones profesionales, envíalas y conviértelas en factura.": "Create professional quotes, send them, and convert them into invoices.",
  "Nueva factura manual": "New Manual Invoice",
  "Nueva proforma": "New Proforma",
  "Facturación manual digital con moneda seleccionable.": "Digital manual billing with selectable currency.",
  "Precio en USD ($)": "Price in USD ($)",
  "Precio en Lempiras (L)": "Price in Lempiras (L)",
  "Cliente y bodega": "Customer and Storage Unit",
  "Usar cliente del Portal": "Use Portal Customer",
  "Ingresar manual": "Enter Manually",
  "Nombre o empresa": "Name or Company",
  "RTN / Tax ID": "RTN / Tax ID",
  Teléfono: "Phone",
  "Dirección fiscal": "Billing Address",
  "Buscar cliente de las facturas...": "Search invoice customers...",
  "Bodegas del cliente": "Customer Storage Units",
  "Mapa principal": "Main Map",
  "Detalle manual de la factura": "Manual Invoice Details",
  "Escribe libremente lo que deseas cobrar.": "Enter the item or service you want to charge.",
  "+ Agregar concepto": "+ Add Item",
  "Descripción del producto, servicio o cargo": "Product, service, or charge description",
  Eliminar: "Delete",
  "Descuento %": "Discount %",
  "Impuesto %": "Tax %",
  Impuestos: "Taxes",
  "Notas y condiciones": "Notes and Terms",
  "Crear factura": "Create Invoice",
  "Guardar borrador": "Save Draft",
  "Guardar como enviada": "Save as Sent",
  "Historial de facturas de caja": "Cash Invoice History",
  "Historial de proformas": "Proforma History",
  "Cliente o número": "Customer or Number",
  "Todo el historial": "All History",
  Hoy: "Today",
  "Esta semana": "This Week",
  "Este mes": "This Month",
  Todos: "All",
  Borrador: "Draft",
  Aceptada: "Accepted",
  Rechazada: "Rejected",
  Convertida: "Converted",
  Abonada: "Partially Paid",
  Pagada: "Paid",
  Pagado: "Paid",
  "Registrar pago": "Record Payment",
  "Enviar correo": "Send Email",
  "Convertir en factura": "Convert to Invoice",
  "Selecciona clientes y bodegas desde el mapa, y asigna cargos diferentes a cada unidad.": "Select customers and storage units from the map and assign different charges to each unit.",
  "Cliente para el cargo": "Customer for the Charge",
  "Modo manual": "Manual Mode",
  "Buscar cliente": "Search Customer",
  "Mapa de bodegas": "Storage Unit Map",
  "Selecciona cualquier código para consultar y configurar la bodega.": "Select any code to view and configure the storage unit.",
  Disponible: "Available",
  "Referencia gris": "Gray Reference",
  Seleccionada: "Selected",
  "Bodega libre": "Available Storage Unit",
  "Bodega ocupada": "Assigned Storage Unit",
  "Sin cliente asignado": "No Customer Assigned",
  "Total configurado": "Configured Total",
  "Servicios disponibles": "Available Services",
  "Factura eléctrica": "Electric Bill",
  "Luz individual": "Individual Light",
  Internet: "Internet",
  Parqueo: "Parking",
  "Otros servicios": "Other Services",
  "Otros cargos": "Other Charges",
  "Configuración actual": "Current Configuration",
  "Todavía no seleccionaste servicios para esta bodega.": "No services have been selected for this storage unit yet.",
  "Facturas y cargos históricos": "Invoice and Charge History",
  "Cargos anteriores": "Previous Charges",
  "No existen cargos anteriores.": "There are no previous charges.",
  Cerrar: "Close",
  "Seleccionar y configurar": "Select and Configure",
  "Abrir configuración": "Open Configuration",
  "Configuración visible": "Visible Configuration",
  "Cargos por bodega": "Charges by Storage Unit",
  "Total global": "Global Total",
  "Quitar bodega ×": "Remove Storage Unit ×",
  "Cargos para bodega": "Charges for Storage Unit",
  "Total bodega en vivo": "Live Storage Unit Total",
  "Consumo estimado": "Estimated Consumption",
  "kWh estimados": "Estimated kWh",
  Costo: "Cost",
  "Total recibo": "Bill Total",
  "Margen %": "Margin %",
  "Precio automático": "Automatic Price",
  "Conversión USD/HNL:": "USD/HNL Conversion:",
  "Estado final": "Final Status",
  "Pendiente de pago": "Pending Payment",
  "Confirmar pagado": "Confirm Paid",
  Método: "Method",
  Efectivo: "Cash",
  Transferencia: "Bank Transfer",
  Tarjeta: "Card",
  "Generar factura global": "Generate Global Invoice",
  "Facturas globales de servicios": "Global Service Invoices",
  Conceptos: "Items",
  "Imprimir / PDF": "Print / PDF",
  "Facturas globales USD y HNL, detalladas por bodega y cargo.": "Global USD and HNL invoices detailed by storage unit and charge.",
  Todas: "All",
  "Buscar cliente, número, bodega o servicio": "Search customer, number, storage unit, or service",
  Pendientes: "Pending",
  Abonadas: "Partially Paid",
  Pagadas: "Paid",
  "Facturas globales emitidas": "Issued Global Invoices",
  "Bodegas y cargos": "Storage Units and Charges",
  Moneda: "Currency",
  Equivalente: "Equivalent",
  "PDF detallado": "Detailed PDF",
  "No hay facturas globales con estos filtros.": "There are no global invoices matching these filters.",
};

// Traducciones de los módulos operativos incorporados después del dashboard
// inicial. Los identificadores fiscales, nombres, códigos y valores no se
// incluyen aquí para que siempre permanezcan exactamente como fueron emitidos.
const additionalTextTranslations: Record<string, string> = {
  "Notas de crédito": "Credit Notes",
  "Anular facturas": "Void Invoices",
  "Alertas de bodegas": "Storage Unit Alerts",
  "Facturas vigentes": "Active Invoices",
  "Facturas anuladas": "Voided Invoices",
  "Reiniciar correlativos de prueba": "Reset Test Correlatives",
  "Documentos fiscales": "Fiscal Documents",
  "Número fiscal": "Fiscal Number",
  Origen: "Source",
  Bodega: "Storage Unit",
  "PDF fiscal": "Fiscal PDF",
  "Ver PDF": "View PDF",
  "Abrir PDF": "Open PDF",
  "Anular factura": "Void Invoice",
  Anulada: "Voided",
  Acreditado: "Credited",
  "Restablecer filtros": "Reset Filters",
  "Todos los módulos": "All Modules",
  "Todos los orígenes": "All Sources",
  "USD y HNL": "USD and HNL",
  "Proformas convertidas": "Converted Proformas",
  "Consulta central de todas las facturas fiscales generadas por Caja, Pagos de Servicios y conversiones de proformas.":
    "Central view of all fiscal invoices generated by Cashier, Service Payments, and converted proformas.",
  "Facturas de toda la plataforma": "Invoices Across the Platform",
  "No hay facturas con estos filtros.": "There are no invoices matching these filters.",

  "Consulta central de todas las proformas creadas, sus estados, PDF y conversión controlada a factura fiscal.":
    "Central view of all created proformas, their statuses, PDFs, and controlled conversion into fiscal invoices.",
  "Proformas creadas": "Created Proformas",
  "Historial completo": "Complete History",
  "Borradores y enviadas": "Drafts and Sent",
  "Aprobadas por el cliente": "Approved by the Customer",
  "Ya generaron factura fiscal": "Already Generated a Fiscal Invoice",
  "Proformas de toda la plataforma": "Proformas Across the Platform",
  "DOCUMENTO NO FISCAL": "NON-FISCAL DOCUMENT",
  "No hay facturas proforma con estos filtros.": "There are no proforma invoices matching these filters.",
  "Aceptar": "Accept",
  "Rechazar": "Reject",
  "Ver factura generada": "View Generated Invoice",

  "Emisión fiscal, control de saldos y trazabilidad de créditos vinculados a facturas de toda la plataforma.":
    "Fiscal issuance, balance control, and traceability of credits linked to invoices across the platform.",
  "Notas vigentes": "Active Credit Notes",
  "Documentos fiscales emitidos": "Issued Fiscal Documents",
  "Total acreditado": "Total Credited",
  "Vista consolidada nominal": "Nominal Consolidated View",
  "Facturas acreditables": "Invoices Available for Credit",
  "Con monto disponible": "With Available Amount",
  "CAI nota de crédito": "Credit Note CAI",
  "No configurado": "Not Configured",
  "Requiere serie fiscal tipo 03": "Requires Fiscal Series Type 03",
  "Control fiscal": "Fiscal Control",
  "Falta configurar el CAI para Nota de crédito": "Credit Note CAI Must Be Configured",
  "La nota mantiene la referencia a la factura original y consume una serie fiscal independiente.":
    "The note retains the original invoice reference and consumes an independent fiscal series.",
  "LISTO PARA EMITIR": "READY TO ISSUE",
  "CONFIGURACIÓN REQUERIDA": "CONFIGURATION REQUIRED",
  "Emitir nueva nota de crédito": "Issue New Credit Note",
  "El monto nunca puede superar lo aún disponible en la factura original.":
    "The amount can never exceed the amount still available on the original invoice.",
  "Factura original": "Original Invoice",
  "Selecciona una factura": "Select an Invoice",
  "Tipo de motivo": "Reason Type",
  "Error de facturación": "Billing Error",
  Devolución: "Return",
  "Descuento posterior": "Post-Sale Discount",
  "Cancelación parcial": "Partial Cancellation",
  "Cancelación total": "Full Cancellation",
  Otro: "Other",
  "Aplicación del crédito": "Credit Application",
  "Ajustar saldo de factura": "Adjust Invoice Balance",
  "Saldo a favor del cliente": "Customer Credit Balance",
  "Reembolso bancario": "Bank Refund",
  "Monto total del crédito": "Total Credit Amount",
  "Descripción y justificación": "Description and Justification",
  "Describe claramente por qué se emite esta nota de crédito.": "Clearly describe why this credit note is being issued.",
  "Vista previa": "Preview",
  "Total original": "Original Total",
  "Ya acreditado": "Already Credited",
  "Base acreditada": "Credited Base",
  "ISV acreditado": "Credited ISV",
  "Total crédito": "Total Credit",
  "Emitir nota de crédito": "Issue Credit Note",
  "Historial de notas de crédito": "Credit Note History",
  "Todos los estados": "All Statuses",
  Vigentes: "Active",
  Anuladas: "Voided",
  "Todavía no existen notas de crédito con estos filtros.": "There are no credit notes matching these filters yet.",
  "Nota de crédito": "Credit Note",
  "Motivo": "Reason",
  Vigente: "Active",
  "Anular": "Void",

  "Vista general sincronizada con facturación, Caja y CAI / Correlativos. BAC y Storeganise permanecen preparados para su integración.":
    "Overview synchronized with billing, Cashier, and CAI / Correlatives. BAC and Storeganise remain ready for integration.",
  "Facturas reales emitidas hoy · equivalente USD": "Actual Invoices Issued Today · USD Equivalent",
  "Acumulado mensual · equivalente USD": "Monthly Total · USD Equivalent",
  "Pendiente de conexión BAC": "BAC Connection Pending",
  "Facturas fiscales vigentes": "Active Fiscal Invoices",
  "Envíos reales registrados": "Actual Deliveries Recorded",
  "Storeganise pendiente de conexión": "Storeganise Connection Pending",
  "Próximo correlativo:": "Next Correlative:",
  "Disponibles:": "Available:",
  "Fecha límite:": "Deadline:",
  "Rango:": "Range:",
  "No existe un CAI de factura tipo 01 activo, vigente y con correlativos disponibles.":
    "There is no active, valid type 01 invoice CAI with available correlatives.",
  "Integración BAC todavía no conectada": "BAC Integration Not Connected Yet",
  "Integración todavía no conectada": "Integration Not Connected Yet",
  "Sincronizadas con Caja, Pagos de servicios y proformas convertidas":
    "Synchronized with Cashier, Service Payments, and Converted Proformas",
  "Todavía no existen facturas emitidas.": "No invoices have been issued yet.",
  "Consultando facturas…": "Loading Invoices…",
  "Se conservarán hasta conectar Storeganise": "They Will Remain Until Storeganise Is Connected",
  "No hay alertas críticas pendientes.": "There Are No Pending Critical Alerts.",

  "Reportes fiscales y operativos sincronizados con facturas, pagos, CAI, correlativos y notas de crédito.":
    "Fiscal and operational reports synchronized with invoices, payments, CAI, correlatives, and credit notes.",
  "Base gravada": "Taxable Base",
  "Sin ISV": "Without ISV",
  "ISV facturado": "Billed ISV",
  "Pagos registrados": "Recorded Payments",
  "Transferencia y POS": "Bank Transfer and POS",
  "Vigentes en el período": "Active During the Period",
  Servicios: "Services",
  "Proforma convertida": "Converted Proforma",
  Acreditada: "Credited",
  Restablecer: "Reset",
  Pagos: "Payments",
  "Resumen fiscal del período": "Fiscal Summary for the Period",
  "Período:": "Period:",
  "CAI factura activo:": "Active Invoice CAI:",
  "Facturación neta:": "Net Billing:",
  "BAC y Storeganise todavía no están conectados; este reporte no inventa operaciones de esas integraciones.":
    "BAC and Storeganise are not connected yet; this report does not fabricate operations from those integrations.",
  "No hay facturas en este período.": "There Are No Invoices in This Period.",
  "No hay pagos registrados en este período.": "There Are No Recorded Payments in This Period.",
  "No hay rangos CAI.": "There Are No CAI Ranges.",
  Documento: "Document",
  Rango: "Range",
  Próximo: "Next",
  Vence: "Expires",
  "No hay notas de crédito en este período.": "There Are No Credit Notes in This Period.",

  "Centro operativo sincronizado con CAI, correlativos, facturas y saldos reales.":
    "Operations Center Synchronized with CAI, Correlatives, Invoices, and Actual Balances.",
  Advertencias: "Warnings",
  "Atención preventiva": "Preventive Attention",
  "Alertas CAI": "CAI Alerts",
  "Vigencia y correlativos": "Validity and Correlatives",
  "Facturas pendientes": "Pending Invoices",
  "Saldos con 7 días o más": "Balances Outstanding for 7 Days or More",
  "Todos los niveles": "All Levels",
  Críticas: "Critical",
  "Buscar alerta o referencia": "Search Alert or Reference",
  "BAC pendiente de integración": "BAC Integration Pending",
  "No se generan alertas bancarias falsas hasta conectar webhooks y conciliación BAC.":
    "No false bank alerts are generated until BAC webhooks and reconciliation are connected.",
  "Storeganise pendiente de integración": "Storeganise Integration Pending",
  "Las alertas de sincronización se activarán cuando Storeganise esté conectado.":
    "Synchronization alerts will activate when Storeganise is connected.",
  "Alertas operativas reales": "Actual Operational Alerts",
  "No existen alertas operativas con estos filtros.": "There Are No Operational Alerts Matching These Filters.",
  "Revisar módulo": "Review Module",
  "No existe CAI de factura disponible": "No Invoice CAI Available",
  "Caja no podrá emitir nuevas facturas hasta activar un CAI tipo 01 vigente y con correlativos.":
    "Cashier cannot issue new invoices until a valid type 01 CAI with available correlatives is activated.",

  "Administración fiscal de CAI, rangos autorizados, correlativos disponibles, vencimientos y control de emisión de facturas.":
    "Fiscal management of CAI, authorized ranges, available correlatives, expiration dates, and invoice issuance control.",
  "Registra por separado la serie de Factura (01) y la serie de Nota de crédito (03). Cada documento consume únicamente su rango autorizado.":
    "Register Invoice series (01) and Credit Note series (03) separately. Each document consumes only its authorized range.",
  "Tipo de documento": "Document Type",
  "01 · Factura": "01 · Invoice",
  "03 · Nota de crédito": "03 · Credit Note",
  "Fecha de autorización": "Authorization Date",
  "Fecha límite de emisión": "Issuance Deadline",
  "Próximo correlativo a utilizar": "Next Correlative to Use",
  "Registrar y activar CAI": "Register and Activate CAI",
  "Dar de baja": "Deactivate",
  "Nota de crédito (03)": "Credit Note (03)",
  "Factura (01)": "Invoice (01)",

  "Conciliación bancaria": "Bank Reconciliation",
  "Selecciona cómo ingresó el dinero y registra el número que aparece en el banco o comprobante POS.":
    "Select how the funds were received and enter the number shown by the bank or POS receipt.",
  "Monto (": "Amount (",
  "Método de pago": "Payment Method",
  "Transferencia bancaria": "Bank Transfer",
  "POS bancario (tarjeta)": "Bank POS (Card)",
  "Referencia de transferencia": "Transfer Reference",
  "Número de autorización POS": "POS Authorization Number",
  "Nota para conciliación": "Reconciliation Note",
  "Banco, fecha, cuenta receptora u observaciones.": "Bank, date, receiving account, or comments.",
  Cancelar: "Cancel",
  "Registrar y conciliar": "Record and Reconcile",
  "Referencias de exención o exoneración": "Exemption or Exoneration References",
  "Déjalas vacías para cobrar el ISV normalmente. Al ingresar cualquiera, la factura se emitirá sin ISV y conservará el código en el PDF.":
    "Leave them blank to charge ISV normally. When any reference is entered, the invoice will be issued without ISV and the code will remain on the PDF.",
  "No. Orden de compra exenta": "Exempt Purchase Order No.",
  "No. Constancia del registro exonerado": "Exonerated Registry Certificate No.",
  "No. Identificativo del registro de la SAG": "SAG Registry Identification No.",
  "Exención activa: ISV 0%. El código quedará registrado en la factura.":
    "Active Exemption: 0% ISV. The code will be recorded on the invoice.",

  "Consumo kWh": "kWh Consumption",
  "Tarifa HNL/kWh": "HNL/kWh Rate",
  "Total a cobrar": "TOTAL DUE",
  "Consumo estimado manual": "Manual Estimated Consumption",
  "Cargos para bodega": "Charges for Storage Unit",
  "Marca los servicios que corresponden a esta bodega.": "Select the Services That Apply to This Storage Unit.",
  "Generando...": "Generating...",
  "Generar factura global": "Generate Global Invoice",
  "Consultando la tasa de cambio…": "Loading Exchange Rate…",
  "Actualizada:": "Updated:",
  "Impuesto:": "Tax:",
  "Subtotal:": "Subtotal:",
  "Representaciones": "Representations",
  "HNL · Español": "HNL · Spanish",

  "Facturación fiscal conectada": "Fiscal Billing Connected",
  "Configura y activa manualmente un CAI vigente en CAI / Correlativos antes de crear facturas de Caja.":
    "Manually configure and activate a valid CAI in CAI / Correlatives before creating Cashier invoices.",
  "Cliente y bodegas": "Customer and Storage Units",
  "Storeganise aún no envió una bodega para este cliente.":
    "Storeganise has not provided a storage unit for this customer yet.",
  "Aún no hay documentos con estos filtros.": "There are no documents matching these filters yet.",
  "Número de constancia": "Certificate Number",
  "Código de la orden exenta": "Exempt Order Code",
  "Identificativo SAG": "SAG Identification",
  "Registrando…": "Recording…",

  "Control de alquileres por ciclos de 30 días. Las alertas aparecen tres días antes del próximo pago y permanecen visibles si están vencidas.":
    "Rental control based on 30-day cycles. Alerts appear three days before the next payment and remain visible when overdue.",
  "Bodegas ocupadas": "Occupied Storage Units",
  "Vencidas": "Overdue",
  "Vencen en 3 días": "Due Within 3 Days",
  "Próximas": "Upcoming",
  "Cliente, correo o bodega": "Customer, Email, or Storage Unit",
  "Requieren atención": "Require Attention",
  "Próximos 3 días": "Next 3 Days",
  "No hay alertas de bodegas con estos filtros.": "There are no storage unit alerts matching these filters.",
  "Sin correo": "No Email",
  "Sin teléfono": "No Phone",
  "Próximo pago:": "Next Payment:",
  "Sus bodegas:": "Their Storage Units:",
  "Última factura:": "Latest Invoice:",
  "Total facturado:": "Total Billed:",
  "Cobrar alquiler": "Charge Rent",
  "Revisar servicios": "Review Services",

  "Busca un cliente de factura o ingrésalo manualmente. El resto del flujo es igual.":
    "Search for an invoice customer or enter one manually. The rest of the workflow is the same.",
  "Nombre del cliente": "Customer Name",
  "Cliente asignado": "Assigned Customer",
  "Cliente no identificado": "Unidentified Customer",
  "Bodegas del cliente:": "Customer Storage Units:",
  "Esta bodega todavía no tiene alquileres ni cargos facturados.":
    "This storage unit does not have any billed rent or charges yet.",
  "Descripción": "Description",
  "Total a cobrar · HNL": "TOTAL DUE · HNL",
  "Total global en vivo · USD": "Live Global Total · USD",
  "Total global en vivo · HNL": "Live Global Total · HNL",
  "Facturas globales de servicios": "Global Service Invoices",
  "No hay facturas globales de servicios en este período.":
    "There are no global service invoices in this period.",
  "Todo el historial": "Complete History",
  "Estado final": "Final Status",
  "Confirmar pagado": "Confirm Paid",
  "USD · English": "USD · English",
  "Activar cuenta": "Activate Account",
  "Validando invitación...": "Validating Invitation...",
  "Activando...": "Activating...",
  "Cuenta invitada para": "Invited Account for",
  "Nueva contraseña": "New Password",
  "Validando enlace...": "Validating Link...",
  "Restablecimiento para": "Password Reset for",
  "Guardar nueva contraseña": "Save New Password",
  "Factura duplicada": "Duplicate Invoice",
  "Error en los datos del cliente": "Error in Customer Details",
  "Error en los conceptos o montos": "Error in Items or Amounts",
  "Operación no realizada": "Transaction Not Completed",
  "Otro motivo documentado": "Other Documented Reason",
  "Sin CAI activo": "No Active CAI",
  "Sin registro": "No Record",
  "Pendiente de primer acceso": "Pending First Access",
  "Revisar pago BAC": "Review BAC Payment",
  "Enviar factura por correo": "Email Invoice",
  "Sin webhook": "No Webhook",
  "Sin factura": "No Invoice",
  "Factura con saldo vencido": "Invoice With Overdue Balance",
  "Factura pendiente de cobro": "Invoice Pending Collection",
  "Enviar": "Send",
  "Selecciona una factura para ver su saldo y cálculo fiscal.":
    "Select an invoice to view its balance and fiscal calculation.",
  "Selecciona al menos una bodega.": "Select at Least One Storage Unit.",
  "Selecciona primero el cliente de la factura.": "Select the Invoice Customer First.",
  "Selecciona una o varias bodegas disponibles para preparar la proforma.":
    "Select One or More Available Storage Units to Prepare the Proforma.",
  "Selecciona una o varias bodegas para cobrar sus alquileres en una sola factura.":
    "Select One or More Storage Units to Charge Their Rent on One Invoice.",
  "Selecciona una o varias bodegas para incluirlas en el documento.":
    "Select One or More Storage Units to Include in the Document.",
  "Asignada al cliente": "Assigned to Customer",
  "Ocupada por": "Occupied by",
  Libre: "Available",
  "Sin confirmar": "Unconfirmed",
  "Monto válido": "Valid Amount",
  "Cliente asociado": "Associated Customer",
  "Sin pago": "No Payment",
  "Cliente Storeganise": "Storeganise Customer",
  "Sin sincronización": "Not Synchronized",
  "Estado final PROCESSED": "Final Status PROCESSED",
  "Sin error": "No Error",
  "Cliente de ejemplo": "Sample Customer",
  "Factura, cliente, RTN o bodega": "Invoice, Customer, RTN, or Storage Unit",
  "Estado actualizado.": "Status Updated.",
  "Documento enviado por correo con PDF adjunto.": "Document Emailed With the PDF Attached.",
  "Proforma convertida en factura definitiva.": "Proforma Converted Into a Final Invoice.",
  "La invitación no es válida.": "The Invitation Is Not Valid.",
  "No se pudo activar la cuenta.": "The Account Could Not Be Activated.",
  "No se pudieron cargar las facturas.": "Invoices Could Not Be Loaded.",
  "No se pudieron cargar las alertas.": "Alerts Could Not Be Loaded.",
  "No se pudo guardar.": "The Information Could Not Be Saved.",
  "No se pudo actualizar.": "The Information Could Not Be Updated.",
  "No se pudo registrar el pago.": "The Payment Could Not Be Recorded.",
  "Factura enviada por correo con su PDF fiscal.": "Invoice Emailed With Its Fiscal PDF.",
  "Cliente:": "Customer:",
  "Selecciona una bodega en el mapa para configurar sus servicios. Esta sección permanecerá visible.":
    "Select a Storage Unit on the Map to Configure Its Services. This Section Will Remain Visible.",
};

const regexTranslations: Array<[RegExp, string]> = [
  [/^Factura (.+) creada por (.+)\.$/, "Invoice $1 successfully created for $2."],
  [/^Factura (.+) creada correctamente\.$/, "Invoice $1 created successfully."],
  [/^Factura (.+) enviada por correo con su PDF fiscal\.$/, "Invoice $1 emailed with its fiscal PDF."],
  [/^Proforma (.+) enviada con su PDF\.$/, "Proforma $1 sent with its PDF."],
  [/^Proforma (.+) convertida correctamente en factura fiscal\.$/, "Proforma $1 successfully converted into a fiscal invoice."],
  [/^Proforma (.+) actualizada a aceptada\.$/, "Proforma $1 updated to accepted."],
  [/^Proforma (.+) actualizada a rechazada\.$/, "Proforma $1 updated to rejected."],
  [/^Nota de crédito (.+) emitida correctamente\.$/, "Credit note $1 issued successfully."],
  [/^Nota (.+) anulada; el crédito fue retirado de la factura\.$/, "Note $1 was voided; the credit was removed from the invoice."],
  [/^Bodega (.+) seleccionada\. Se cargó su alquiler de 30 días\.$/, "Storage unit $1 selected. Its 30-day rental was loaded."],
  [/^Bodega (.+) seleccionada\. Escribe el precio del alquiler de 30 días\.$/, "Storage unit $1 selected. Enter the 30-day rental price."],
  [/^Bodega (.+) removida del documento\.$/, "Storage unit $1 removed from the document."],
  [/^Bodega (.+) · Libre$/, "Storage unit $1 · Available"],
  [/^Bodega (.+) · Ocupada por (.+)$/, "Storage unit $1 · Occupied by $2"],
  [/^Bodega (.+) · Asignada al cliente$/, "Storage unit $1 · Assigned to Customer"],
  [/^CAI (.+) registrado y activado correctamente\. Caja ya puede consumir sus correlativos\.$/, "CAI $1 successfully registered and activated. Cashier can now consume its correlatives."],
  [/^Rango actualizado a (.+)\. Las nuevas facturas usarán esta configuración\.$/, "Range updated to $1. New invoices will use this configuration."],
  [/^(\d+) factura\(s\) encontradas$/, "$1 invoice(s) found"],
  [/^(\d+) documento\(s\) encontrados$/, "$1 document(s) found"],
  [/^(\d+) documento\(s\) con los filtros actuales$/, "$1 document(s) with the current filters"],
  [/^(\d+) alerta\(s\) con los filtros actuales$/, "$1 alert(s) with the current filters"],
  [/^(\d+) correlativos disponibles$/, "$1 correlatives available"],
  [/^CAI tipo 03 vigente hasta (.+)$/, "Type 03 CAI valid through $1"],
  [/^El pago supera el saldo de (.+)\.$/, "The payment exceeds the balance of $1."],
  [/^Escribe el consumo kWh de la bodega (.+)\.$/, "Enter the kWh consumption for storage unit $1."],
  [/^Escribe la tarifa por kWh de la bodega (.+)\.$/, "Enter the kWh rate for storage unit $1."],
  [/^Escribe el costo de la bodega (.+)\.$/, "Enter the cost for storage unit $1."],
  [/^La bodega (.+) ya está ocupada por (.+)\. No puedes asignarla nuevamente\.$/, "Storage unit $1 is already occupied by $2. It cannot be assigned again."],
  [/^Próxima factura: (.+) · Fecha límite: (.+)$/, "Next invoice: $1 · Deadline: $2"],
  [/^Actualizada: (.+)$/, "Updated: $1"],
  [/^CAI de (.+) vencido$/, "$1 CAI Expired"],
  [/^CAI de (.+) próximo a vencer$/, "$1 CAI Expiring Soon"],
  [/^El CAI venció hace (\d+) día\(s\) y debe darse de baja\.$/, "The CAI expired $1 day(s) ago and must be deactivated."],
  [/^Fecha límite (.+); quedan (\d+) día\(s\)\.$/, "Deadline $1; $2 day(s) remaining."],
  [/^Correlativos bajos para (.+)$/, "Low Correlatives for $1"],
  [/^Solamente quedan (\d+) correlativos disponibles\.$/, "Only $1 correlatives remain available."],
  [/^(.+) mantiene un saldo de (.+) desde hace (\d+) día\(s\)\.$/, "$1 has maintained a balance of $2 for $3 day(s)."],
  [/^Factura (.+) anulada y retirada de los módulos operativos\. Las bodegas relacionadas quedaron liberadas\.$/, "Invoice $1 was voided and removed from operational modules. Related storage units were released."],
  [/^(\d+) factura\(s\) y (\d+) proforma\(s\) de prueba eliminadas\. Todas las bodegas quedaron libres\. Próximo correlativo: (.+)\.$/, "$1 test invoice(s) and $2 proforma(s) deleted. All storage units were released. Next correlative: $3."],
  [/^Factura emitida a (.+) por (.+)\.$/, "Invoice issued to $1 for $2."],
  [/^¿Dar de baja el CAI (.+)\? Caja dejará de utilizar este rango\.$/, "Deactivate CAI $1? Cashier will stop using this range."],
  [/^¿Convertir (.+) en factura fiscal\? Esta acción consumirá un correlativo de factura\.$/, "Convert $1 into a fiscal invoice? This action will consume one invoice correlative."],
  [/^Cliente (.+): (.+)\. Datos fiscales listos para auditoría\.$/, "Customer $1: $2. Fiscal data ready for audit."],
  [/^Cliente: (.+)$/, "Customer: $1"],
  [/^Cantidad (.+) · Costo (.+) · Margen (.+)%$/, "Quantity $1 · Cost $2 · Margin $3%"],
  [/^Evento (.+) marcado para reintento\. Estado interno: RETRYING\.$/, "Event $1 marked for retry. Internal status: RETRYING."],
  [/^(\d+) factura\(s\)$/, "$1 invoice(s)"],
  [/^(\d+) día\(s\) vencida$/, "$1 day(s) overdue"],
  [/^(\d+) día\(s\)$/, "$1 day(s)"],
  [/^(\d+) documento\(s\) · un correlativo por factura$/, "$1 document(s) · one correlative per invoice"],
  [/^Cliente: (.+)$/, "Customer: $1"],
  [/^Zona (.+)$/, "Zone $1"],
  [/^Transferencia bancaria de (.+) registrado para conciliación\.$/, "Bank transfer of $1 recorded for reconciliation."],
  [/^Pago por POS de (.+) registrado para conciliación\.$/, "POS payment of $1 recorded for reconciliation."],
  [/^Factura global (.+) creada con un solo correlativo\. Disponible en USD\/inglés y HNL\/español\.$/, "Global invoice $1 created with one correlative. Available in USD/English and HNL/Spanish."],
  [/^Bodega (.+)$/, "Storage Unit $1"],
  [/^Cargos para bodega (.+)$/, "Charges for Storage Unit $1"],
  [/^Total global · (USD|HNL)$/, "Global Total · $1"],
  [/^Total bodega en vivo · (USD|HNL)$/, "Live Storage Unit Total · $1"],
  [/^Precio automático · (USD|HNL)$/, "Automatic Price · $1"],
  [/^(\d+) servicio\(s\)$/, "$1 service(s)"],
  [/^(\d+) documento\(s\)$/, "$1 document(s)"],
  [/^Cantidad (.+)$/, "Quantity $1"],
  [/^Costo (.+)$/, "Cost $1"],
  [/^Margen (.+)%$/, "Margin $1%"],
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

  const exact = textTranslations[trimmed] ?? additionalTextTranslations[trimmed];

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

  if (parent.closest("script, style, svg, code, pre")) {
    return true;
  }

  // Los importes son contenido dinámico controlado por React. El traductor no
  // debe guardar ni restaurar sus textos porque podría devolver un total nuevo
  // al valor inicial ($0.00 / L 0.00) después de cada renderizado.
  const value = node.nodeValue ?? "";
  return /^\s*(?:(?:USD|HNL|L)\s*)?\$?\s*[\d.,]+\s*$|^\s*[\d.,]+\s*(?:USD|HNL)\s*$/i.test(value);
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
      const current = textNode.nodeValue ?? "";
      let original = textNodeOriginals.get(textNode);

      if (original === undefined) {
        original = current;
        const translated = translateText(original);
        if (translated !== original) {
          textNodeOriginals.set(textNode, original);
        }
      } else {
        const previousTranslation = translateText(original);
        if (current !== original && current !== previousTranslation) {
          original = current;
          textNodeOriginals.set(textNode, original);
        }
      }

      const nextValue = language === "en" ? translateText(original) : original;
      if (textNode.nodeValue !== nextValue) {
        textNode.nodeValue = nextValue;
      }
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

    // Los cambios de texto también se observan para traducir mensajes dinámicos
    // con clientes, fechas y correlativos. Los importes se excluyen arriba para
    // no interferir con los totales controlados por React.
    observer.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });

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
