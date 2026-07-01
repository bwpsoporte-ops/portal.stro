export type DashboardUser = {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: "Administrador" | "Usuario";
  status: "ACTIVO";
  createdAt: string;
  lastAccess: string;
  invitedById?: string;
  invitedByName?: string;
  invitedByEmail?: string;
};

const USERS_KEY = "rss-dashboard-users";
const SESSION_KEY = "rss-dashboard-session";
const ROOT_SESSION_KEY = "rss-dashboard-root-session";
const ROOT_USER_ID = "USR-ROOT";
const LEGACY_ROOT_ID = "USR-001";

function canUseStorage() {
  return typeof window !== "undefined";
}

export function getUsers(): DashboardUser[] {
  if (!canUseStorage()) return [];

  const savedUsers = window.localStorage.getItem(USERS_KEY);
  if (!savedUsers) {
    window.localStorage.setItem(USERS_KEY, JSON.stringify([]));
    return [];
  }

  try {
    const users = JSON.parse(savedUsers) as DashboardUser[];
    const nextUsers = users.filter((user) => user.id !== ROOT_USER_ID && user.id !== LEGACY_ROOT_ID);

    window.localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
    return nextUsers;
  } catch {
    window.localStorage.setItem(USERS_KEY, JSON.stringify([]));
    return [];
  }
}

function saveUsers(users: DashboardUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function login(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const users = getUsers();
  const user = users.find((item) => item.email.toLowerCase() === normalizedEmail && item.password === password);

  if (!user) return null;

  const updatedUser = { ...user, lastAccess: new Date().toISOString() };
  saveUsers(users.map((item) => (item.id === user.id ? updatedUser : item)));
  window.localStorage.setItem(SESSION_KEY, updatedUser.id);
  return updatedUser;
}

export function startRootSession(user: Omit<DashboardUser, "password">) {
  const rootUser: DashboardUser = {
    ...user,
    id: ROOT_USER_ID,
    role: "Administrador",
    status: "ACTIVO",
  };

  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.setItem(ROOT_SESSION_KEY, JSON.stringify(rootUser));
  return rootUser;
}

export function startUserSession(user: Omit<DashboardUser, "password">) {
  const users = getUsers();
  const sessionUser: DashboardUser = { ...user };
  const nextUsers = users.some((item) => item.id === sessionUser.id)
    ? users.map((item) => (item.id === sessionUser.id ? { ...item, ...sessionUser } : item))
    : [...users, sessionUser];

  saveUsers(nextUsers);
  window.localStorage.removeItem(ROOT_SESSION_KEY);
  window.localStorage.setItem(SESSION_KEY, sessionUser.id);
  return sessionUser;
}

export function logout() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(ROOT_SESSION_KEY);
}

export function getCurrentUser() {
  if (!canUseStorage()) return null;
  const rootSession = window.localStorage.getItem(ROOT_SESSION_KEY);

  if (rootSession) {
    try {
      return JSON.parse(rootSession) as DashboardUser;
    } catch {
      window.localStorage.removeItem(ROOT_SESSION_KEY);
    }
  }

  const sessionId = window.localStorage.getItem(SESSION_KEY);
  return getUsers().find((user) => user.id === sessionId) ?? null;
}

export function isRootUser(user: DashboardUser | null | undefined) {
  return user?.id === ROOT_USER_ID;
}

export function findPasswordResetUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = getUsers().find((item) => item.email.toLowerCase() === normalizedEmail) ?? null;

  if (!user || isRootUser(user)) {
    return null;
  }

  return user;
}

export function inviteUser(
  name: string,
  email: string,
  password: string,
  invitedBy?: Pick<DashboardUser, "id" | "name" | "email"> | null,
) {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();

  if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    return { ok: false, message: "Ya existe un usuario registrado con ese correo." };
  }

  const user: DashboardUser = {
    id: `USR-${String(users.length + 1).padStart(3, "0")}`,
    name: name.trim(),
    email: normalizedEmail,
    password,
    role: "Usuario",
    status: "ACTIVO",
    createdAt: new Date().toISOString(),
    lastAccess: "Pendiente de primer acceso",
    invitedById: invitedBy?.id,
    invitedByName: invitedBy?.name,
    invitedByEmail: invitedBy?.email,
  };

  saveUsers([...users, user]);
  return { ok: true, message: `Usuario ${normalizedEmail} invitado correctamente.`, user };
}

export function activateInvitedUser(
  name: string,
  email: string,
  temporaryPassword: string,
  nextPassword: string,
  invitedBy?: Pick<DashboardUser, "id" | "name" | "email"> | null,
) {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);

  if (user && user.password !== temporaryPassword && user.lastAccess !== "Pendiente de primer acceso") {
    return { ok: false, message: "Esta cuenta ya fue activada. Inicia sesión con tu contraseña actual." };
  }

  const activatedUser: DashboardUser = user
    ? {
        ...user,
        name: name.trim(),
        password: nextPassword,
        status: "ACTIVO",
        invitedById: user.invitedById ?? invitedBy?.id,
        invitedByName: user.invitedByName ?? invitedBy?.name,
        invitedByEmail: user.invitedByEmail ?? invitedBy?.email,
      }
    : {
        id: `USR-${String(users.length + 1).padStart(3, "0")}`,
        name: name.trim(),
        email: normalizedEmail,
        password: nextPassword,
        role: "Usuario",
        status: "ACTIVO",
        createdAt: new Date().toISOString(),
        lastAccess: "Pendiente de primer acceso",
        invitedById: invitedBy?.id,
        invitedByName: invitedBy?.name,
        invitedByEmail: invitedBy?.email,
      };

  saveUsers(user ? users.map((item) => (item.email.toLowerCase() === normalizedEmail ? activatedUser : item)) : [...users, activatedUser]);
  return { ok: true, message: "Cuenta activada correctamente. Ya puedes iniciar sesión.", user: activatedUser };
}

export function changePassword(userId: string, currentPassword: string, nextPassword: string) {
  const users = getUsers();
  const user = users.find((item) => item.id === userId);

  if (!user || user.password !== currentPassword) {
    return { ok: false, message: "La contraseña actual no es correcta." };
  }

  if (isRootUser(user)) {
    return { ok: false, message: "La contraseña del usuario root se administra desde .env.local." };
  }

  saveUsers(users.map((item) => (item.id === userId ? { ...item, password: nextPassword } : item)));
  return { ok: true, message: "Contraseña actualizada correctamente." };
}

export function resetPasswordByEmail(email: string, nextPassword: string) {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);

  if (!user) {
    return { ok: false, message: "No se encontró una cuenta activa con ese correo." };
  }

  if (isRootUser(user)) {
    return { ok: false, message: "La contraseña del usuario root se administra desde .env.local." };
  }

  if (nextPassword.length < 8) {
    return { ok: false, message: "La nueva contraseña debe tener al menos 8 caracteres." };
  }

  saveUsers(users.map((item) => (item.id === user.id ? { ...item, password: nextPassword } : item)));
  logout();
  return { ok: true, message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." };
}
