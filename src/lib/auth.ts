export type DashboardUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "Administrador" | "Usuario";
  status: "ACTIVO";
  createdAt: string;
  lastAccess: string;
};

const USERS_KEY = "rss-dashboard-users";
const SESSION_KEY = "rss-dashboard-session";

const rootUsername = process.env.NEXT_PUBLIC_ROOT_USERNAME ?? "ROOT.BWP";
const rootPassword = process.env.NEXT_PUBLIC_ROOT_PASSWORD ?? "19959501";

const defaultAdmin: DashboardUser = {
  id: "USR-001",
  name: "Root BWP",
  email: rootUsername,
  password: rootPassword,
  role: "Administrador",
  status: "ACTIVO",
  createdAt: "2026-05-01T08:00:00-06:00",
  lastAccess: "2026-06-02T08:00:00-06:00",
};

function canUseStorage() {
  return typeof window !== "undefined";
}

export function getUsers(): DashboardUser[] {
  if (!canUseStorage()) return [defaultAdmin];

  window.localStorage.setItem(USERS_KEY, JSON.stringify([defaultAdmin]));
  return [defaultAdmin];
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

export function logout() {
  if (canUseStorage()) window.localStorage.removeItem(SESSION_KEY);
}

export function getCurrentUser() {
  if (!canUseStorage()) return null;
  const sessionId = window.localStorage.getItem(SESSION_KEY);
  return getUsers().find((user) => user.id === sessionId) ?? null;
}

export function isRootUser(user: DashboardUser | null | undefined) {
  return user?.email.trim().toLowerCase() === rootUsername.trim().toLowerCase();
}

export function inviteUser(name: string, email: string, password: string) {
  void name;
  void email;
  void password;
  return { ok: false, message: "La plataforma solo permite el usuario ROOT.BWP definido en .env.local." };
}

export function activateInvitedUser(name: string, email: string, temporaryPassword: string, nextPassword: string) {
  void name;
  void email;
  void temporaryPassword;
  void nextPassword;
  return { ok: false, message: "La activación de usuarios está deshabilitada. Solo existe el usuario root." };
}

export function changePassword(userId: string, currentPassword: string, nextPassword: string) {
  void nextPassword;
  const user = defaultAdmin.id === userId ? defaultAdmin : null;

  if (!user || user.password !== currentPassword) {
    return { ok: false, message: "La contraseña actual no es correcta." };
  }

  return { ok: false, message: "La contraseña del usuario root se administra desde .env.local." };
}
