from pathlib import Path

root = Path('/home/user/work/domino')
local_store = root / 'server' / 'localStore.ts'
routers = root / 'server' / 'routers.ts'

text = local_store.read_text()
text = text.replace('''export type LocalUser = {
  id: number;
  openId: string;
  name: string;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
''', '''export type LocalUser = {
  id: number;
  openId: string;
  name: string;
  email: string | null;
  loginMethod: string | null;
  passwordHash: string | null;
  role: "user" | "admin";
''')

text = text.replace('''function ensureSeedData() {
  if (users.size === 0) {
    createLocalUser({ name: "Administrador", email: "admin@domino.local", role: "admin", loginMethod: "local" });
    createLocalUser({ name: "Jogador Demo", email: "demo@domino.local", role: "user", loginMethod: "local" });
  }
''', '''function ensureSeedData() {
  if (users.size === 0) {
    createLocalUser({ name: "Administrador", email: "admin@domino.local", role: "admin", loginMethod: "password", password: "admin123" });
    createLocalUser({ name: "Jogador Demo", email: "demo@domino.local", role: "user", loginMethod: "password", password: "demo123" });
  }
''')

text = text.replace('''function now() {
  return new Date();
}
''', '''function now() {
  return new Date();
}

function hashPassword(password: string) {
  return Buffer.from(`domino-local:${password}`).toString("base64");
}
''')

text = text.replace('''export function createLocalUser(input: { name: string; email?: string | null; role?: "user" | "admin"; loginMethod?: string | null; }): LocalUser {
''', '''export function createLocalUser(input: { name: string; email?: string | null; password?: string | null; role?: "user" | "admin"; loginMethod?: string | null; }): LocalUser {
''')

text = text.replace('''    email: input.email ?? null,
    loginMethod: input.loginMethod ?? "local",
    role: input.role ?? "user",
''', '''    email: input.email ?? null,
    loginMethod: input.loginMethod ?? "local",
    passwordHash: input.password ? hashPassword(input.password) : null,
    role: input.role ?? "user",
''')

marker = '''export function loginLocalUser(name: string, email?: string | null) {
  ensureSeedData();
  const existing = Array.from(users.values()).find((u) => {
    if (email) return u.email?.toLowerCase() === email.toLowerCase();
    return u.name.toLowerCase() === name.toLowerCase();
  });

  if (existing) {
    existing.isOnline = true;
    existing.lastSignedIn = now();
    existing.updatedAt = now();
    return existing;
  }

  return createLocalUser({ name, email, loginMethod: email ? "email" : "local" });
}
'''
insert = '''export function loginLocalUser(name: string, email?: string | null) {
  ensureSeedData();
  const existing = Array.from(users.values()).find((u) => {
    if (email) return u.email?.toLowerCase() === email.toLowerCase();
    return u.name.toLowerCase() === name.toLowerCase();
  });

  if (existing) {
    existing.isOnline = true;
    existing.lastSignedIn = now();
    existing.updatedAt = now();
    return existing;
  }

  return createLocalUser({ name, email, loginMethod: email ? "email" : "local" });
}

export function registerCredentialUser(name: string, email: string, password: string) {
  ensureSeedData();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();

  const duplicateEmail = Array.from(users.values()).find((user) => user.email?.toLowerCase() === normalizedEmail);
  if (duplicateEmail) throw new Error("Já existe uma conta com este e-mail");

  const duplicateName = Array.from(users.values()).find((user) => user.name.toLowerCase() === normalizedName.toLowerCase());
  if (duplicateName) throw new Error("Já existe um jogador com este nome");

  return createLocalUser({
    name: normalizedName,
    email: normalizedEmail,
    password,
    loginMethod: "password",
  });
}

export function loginPasswordUser(email: string, password: string) {
  ensureSeedData();
  const normalizedEmail = email.trim().toLowerCase();
  const user = Array.from(users.values()).find((entry) => entry.email?.toLowerCase() === normalizedEmail);

  if (!user || !user.passwordHash) {
    throw new Error("Conta com senha não encontrada");
  }

  if (user.passwordHash !== hashPassword(password)) {
    throw new Error("Senha inválida");
  }

  user.isOnline = true;
  user.isPlaying = false;
  user.lastSignedIn = now();
  user.updatedAt = now();
  return user;
}
'''
if marker not in text:
    raise SystemExit('loginLocalUser marker not found')
text = text.replace(marker, insert)
local_store.write_text(text)

text = routers.read_text()
text = text.replace('''import { getLocalUserById, loginLocalUser, logoutLocalUser, requestEmailCode, verifyEmailCode } from "./localStore";
''', '''import { getLocalUserById, loginLocalUser, loginPasswordUser, logoutLocalUser, registerCredentialUser, requestEmailCode, verifyEmailCode } from "./localStore";
''')

marker = '''    localLogin: publicProcedure
      .input(z.object({ name: z.string().min(2).max(50), email: z.string().email().optional() }))
      .mutation(({ input }) => {
        const user = loginLocalUser(input.name, input.email ?? null);
        return { user };
      }),
'''
insert = '''    localLogin: publicProcedure
      .input(z.object({ name: z.string().min(2).max(50), email: z.string().email().optional() }))
      .mutation(({ input }) => {
        const user = loginLocalUser(input.name, input.email ?? null);
        return { user };
      }),
    registerPassword: publicProcedure
      .input(z.object({
        name: z.string().min(2).max(50),
        email: z.string().email(),
        password: z.string().min(4).max(100),
      }))
      .mutation(({ input }) => {
        const user = registerCredentialUser(input.name, input.email, input.password);
        return { user };
      }),
    loginPassword: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(4).max(100),
      }))
      .mutation(({ input }) => {
        const user = loginPasswordUser(input.email, input.password);
        return { user };
      }),
'''
if marker not in text:
    raise SystemExit('routers marker not found')
text = text.replace(marker, insert)
routers.write_text(text)
print('patched auth files')
