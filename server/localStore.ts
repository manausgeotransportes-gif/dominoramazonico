import fs from "node:fs";
import path from "node:path";
import { calculateLevel, calculateWinRate, createDominoes, shuffle, findCarrocaSena, placeDominoOnBoard, createEmptyBoardState, type BoardState, type Domino } from "./gameEngine";
import { getMongoDb, isMongoConfigured } from "./_core/mongodb";

export type LocalUser = {
  id: number;
  openId: string;
  name: string;
  email: string | null;
  loginMethod: string | null;
  passwordHash: string | null;
  role: "user" | "admin";
  isOnline: boolean;
  isPlaying: boolean;
  blockedUntil: Date | null;
  blockReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
  // Profile fields
  displayName?: string;
  avatarType?: "preset" | "upload";
  avatarPresetId?: string;
  avatarImage?: string;
};

export type LocalRoom = {
  id: number;
  name: string;
  isPrivate: boolean;
  createdBy: number;
  maxPlayers: number;
  currentPlayers: number;
  status: "waiting" | "playing" | "finished" | "closed";
  allowBot: boolean;
  isAutoRoom?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LocalInfraction = {
  id: number;
  userId: number;
  infractionCount: number;
  blockDuration: "24h" | "30d" | "permanent";
  blockedAt: Date;
  unblockAt: Date | null;
  reason: string | null;
};

export type LocalMessage = {
  id: number;
  gameId: number;
  userId: number;
  userName: string;
  message: string;
  isOffensive: boolean;
  createdAt: Date;
};

export type LocalFriendInvite = {
  id: number;
  fromUserId: number;
  toUserId: number;
  gameId: number | null;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: Date;
  expiresAt: Date;
};

export type LocalPlayerStats = {
  userId: number;
  totalGames: number;
  totalWins: number;
  totalPoints: number;
  level: number;
  winRate: string;
};

export type LocalCalendarEvent = {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  dueDate: Date;
  eventType: "vencimento" | "fatura" | "documento" | "lembretes" | "outro";
  priority: "baixa" | "media" | "alta";
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LocalLastMove = {
  playerIndex: number;
  playerName: string;
  domino: Domino;
  side: "left" | "right" | "up" | "down";
  pointsEarned?: number;
  announcedPoints: number;
  tablePoints: number;
  awardedPoints: number;
  isBonus50: boolean;
  call: boolean;
  message: string;
};

export type LocalGameState = {
  gameId: number;
  roomId: number;
  roomName: string;
  status: "waiting" | "playing" | "finished" | "abandoned";
  currentPlayerIndex: number;
  roundNumber: number;
  boardState: BoardState;
  playerHands: Domino[][];
  playerScores: number[];
  playerIds: number[];
  playerNames: string[];
  isBotPlayer: boolean[];
  winnerId: number | null;
  winnerTeam: number | null;
  teamScores: number[];
  passCount: number;
  announcements: string[];
  pendingGaloPlayerId?: number | null;
  lastMove: LocalLastMove | null;
};

type PendingCode = {
  email: string;
  code: string;
  expiresAt: Date;
};

type PersistedLocalStore = {
  version: 1;
  counters: {
    nextUserId: number;
    nextRoomId: number;
    nextGameId: number;
    nextMessageId: number;
    nextInfractionId: number;
    nextFriendInviteId: number;
    nextCalendarEventId: number;
    autoRoomCursor: number;
  };
  users: LocalUser[];
  rooms: LocalRoom[];
  roomPlayers: Array<[number, Array<number | null>]>;
  games: LocalGameState[];
  messages: Array<[number, LocalMessage[]]>;
  infractions: LocalInfraction[];
  friendInvites: LocalFriendInvite[];
  playerStats: LocalPlayerStats[];
  pendingCodes: Array<[string, PendingCode]>;
  calendarEvents: LocalCalendarEvent[];
};

type MongoLocalStoreDocument = {
  _id: string;
  snapshot?: PersistedLocalStore;
  createdAt?: Date;
  updatedAt?: Date;
};

const users = new Map<number, LocalUser>();
const rooms = new Map<number, LocalRoom>();
const roomPlayers = new Map<number, Array<number | null>>();
const games = new Map<number, LocalGameState>();
const messages = new Map<number, LocalMessage[]>();
const infractions: LocalInfraction[] = [];
const friendInvites: LocalFriendInvite[] = [];
const playerStats = new Map<number, LocalPlayerStats>();
const pendingCodes = new Map<string, PendingCode>();
const calendarEvents = new Map<number, LocalCalendarEvent>();

let nextUserId = 1;
let nextRoomId = 1;
let nextGameId = 1;
let nextMessageId = 1;
let nextInfractionId = 1;
let nextFriendInviteId = 1;
let nextCalendarEventId = 1;

const AUTO_ROOM_NAMES = [
  "Mesa Pública Rio Negro",
  "Mesa Pública Encontro das Águas",
  "Mesa Pública Ilha do Marajó",
  "Mesa Pública Tucumã",
  "Mesa Pública Solimões",
  "Mesa Pública Vitória-Régia",
  "Mesa Pública Serra da Lua",
  "Mesa Pública Negro & Branco",
];
const STANDARD_BOTS = [
  { name: "Bot Norte", email: "bot-norte@domino.local" },
  { name: "Bot Centro", email: "bot-centro@domino.local" },
  { name: "Bot Sul", email: "bot-sul@domino.local" },
  { name: "Bot Oeste", email: "bot-oeste@domino.local" },
];
let autoRoomCursor = 0;

const LOCAL_STORE_DIR = path.resolve(process.cwd(), "data");
const LOCAL_STORE_FILE = path.join(LOCAL_STORE_DIR, process.env.NODE_ENV === "test" ? "local-store.test.json" : "local-store.json");
const MONGO_STORE_COLLECTION = "app_state";
const MONGO_STORE_ID = "local-store";
let isPersistingSuspended = false;
let isMongoPersistenceReady = false;
let mongoPersistTimer: NodeJS.Timeout | null = null;
let mongoPersistInFlight: Promise<void> | null = null;

function now() {
  return new Date();
}

function reviveDate(value: unknown) {
  return value ? new Date(String(value)) : null;
}

function reviveUser(user: LocalUser): LocalUser {
  return {
    ...user,
    blockedUntil: reviveDate(user.blockedUntil),
    createdAt: reviveDate(user.createdAt) ?? now(),
    updatedAt: reviveDate(user.updatedAt) ?? now(),
    lastSignedIn: reviveDate(user.lastSignedIn) ?? now(),
  };
}

function reviveRoom(room: LocalRoom): LocalRoom {
  return {
    ...room,
    createdAt: reviveDate(room.createdAt) ?? now(),
    updatedAt: reviveDate(room.updatedAt) ?? now(),
  };
}

function reviveMessage(message: LocalMessage): LocalMessage {
  return {
    ...message,
    createdAt: reviveDate(message.createdAt) ?? now(),
  };
}

function reviveInfraction(infraction: LocalInfraction): LocalInfraction {
  return {
    ...infraction,
    blockedAt: reviveDate(infraction.blockedAt) ?? now(),
    unblockAt: reviveDate(infraction.unblockAt),
  };
}

function reviveFriendInvite(invite: LocalFriendInvite): LocalFriendInvite {
  return {
    ...invite,
    createdAt: reviveDate(invite.createdAt) ?? now(),
    expiresAt: reviveDate(invite.expiresAt) ?? now(),
  };
}

function reviveCalendarEvent(event: LocalCalendarEvent): LocalCalendarEvent {
  return {
    ...event,
    dueDate: reviveDate(event.dueDate) ?? now(),
    createdAt: reviveDate(event.createdAt) ?? now(),
    updatedAt: reviveDate(event.updatedAt) ?? now(),
  };
}

function revivePendingCode(code: PendingCode): PendingCode {
  return {
    ...code,
    expiresAt: reviveDate(code.expiresAt) ?? now(),
  };
}

function createSnapshot(): PersistedLocalStore {
  return {
    version: 1,
    counters: {
      nextUserId,
      nextRoomId,
      nextGameId,
      nextMessageId,
      nextInfractionId,
      nextFriendInviteId,
      nextCalendarEventId,
      autoRoomCursor,
    },
    users: Array.from(users.values()),
    rooms: Array.from(rooms.values()),
    roomPlayers: Array.from(roomPlayers.entries()),
    games: Array.from(games.values()),
    messages: Array.from(messages.entries()),
    infractions: [...infractions],
    friendInvites: [...friendInvites],
    playerStats: Array.from(playerStats.values()),
    pendingCodes: Array.from(pendingCodes.entries()),
    calendarEvents: Array.from(calendarEvents.values()),
  };
}

async function persistLocalStoreToMongo(snapshot: PersistedLocalStore) {
  const db = await getMongoDb();
  if (!db) return;

  await db.collection<MongoLocalStoreDocument>(MONGO_STORE_COLLECTION).updateOne(
    { _id: MONGO_STORE_ID },
    {
      $set: {
        snapshot,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

function scheduleMongoPersist(snapshot: PersistedLocalStore) {
  if (!isMongoPersistenceReady) return;

  if (mongoPersistTimer) {
    clearTimeout(mongoPersistTimer);
  }

  mongoPersistTimer = setTimeout(() => {
    mongoPersistTimer = null;
    mongoPersistInFlight = persistLocalStoreToMongo(snapshot).catch((error) => {
      console.error("[LocalStore] Falha ao salvar dados no MongoDB:", error);
    });
  }, 100);
  mongoPersistTimer.unref?.();
}

function persistLocalStore() {
  if (isPersistingSuspended) return;
  if (process.env.NODE_ENV === "test") return;

  const snapshot = createSnapshot();

  if (isMongoConfigured()) {
    scheduleMongoPersist(snapshot);
    return;
  }

  fs.mkdirSync(LOCAL_STORE_DIR, { recursive: true });
  const tmpFile = `${LOCAL_STORE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(snapshot, null, 2), "utf8");
  fs.renameSync(tmpFile, LOCAL_STORE_FILE);
}

function loadPersistedLocalStore() {
  if (process.env.NODE_ENV === "test") return;
  if (!fs.existsSync(LOCAL_STORE_FILE)) return;

  try {
    isPersistingSuspended = true;
    const snapshot = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, "utf8")) as PersistedLocalStore;
    hydratePersistedLocalStore(snapshot);
  } catch (error) {
    console.error("[LocalStore] Falha ao carregar dados persistidos:", error);
  } finally {
    isPersistingSuspended = false;
  }
}

function hydratePersistedLocalStore(snapshot: PersistedLocalStore) {
  if (snapshot.version !== 1) return;

  users.clear();
  rooms.clear();
  roomPlayers.clear();
  games.clear();
  messages.clear();
  infractions.length = 0;
  friendInvites.length = 0;
  playerStats.clear();
  pendingCodes.clear();
  calendarEvents.clear();

  snapshot.users.forEach((user) => users.set(user.id, reviveUser(user)));
  snapshot.rooms.forEach((room) => rooms.set(room.id, reviveRoom(room)));
  snapshot.roomPlayers.forEach(([roomId, ids]) => roomPlayers.set(Number(roomId), ids));
  snapshot.games.forEach((game) => games.set(game.roomId, game));
  snapshot.messages.forEach(([gameId, gameMessages]) => messages.set(Number(gameId), gameMessages.map(reviveMessage)));
  snapshot.infractions.forEach((infraction) => infractions.push(reviveInfraction(infraction)));
  snapshot.friendInvites.forEach((invite) => friendInvites.push(reviveFriendInvite(invite)));
  snapshot.playerStats.forEach((stats) => playerStats.set(stats.userId, stats));
  snapshot.pendingCodes.forEach(([email, code]) => pendingCodes.set(email, revivePendingCode(code)));
  (snapshot.calendarEvents ?? []).forEach((event) => calendarEvents.set(event.id, reviveCalendarEvent(event)));

  nextUserId = snapshot.counters.nextUserId;
  nextRoomId = snapshot.counters.nextRoomId;
  nextGameId = snapshot.counters.nextGameId;
  nextMessageId = snapshot.counters.nextMessageId;
  nextInfractionId = snapshot.counters.nextInfractionId;
  nextFriendInviteId = snapshot.counters.nextFriendInviteId;
  nextCalendarEventId = snapshot.counters.nextCalendarEventId ?? 1;
  autoRoomCursor = snapshot.counters.autoRoomCursor;
}

function closeRestoredBotGames() {
  let changed = false;

  for (const game of Array.from(games.values())) {
    const room = rooms.get(game.roomId);
    const hasBot = game.isBotPlayer.some(Boolean) || Boolean(room?.allowBot);
    if (!hasBot || (game.status !== "playing" && game.status !== "waiting")) continue;

    game.status = "abandoned";
    game.announcements = [...(game.announcements ?? []), "Partida com bot encerrada após reinício do servidor."];
    game.playerIds.forEach((userId: number) => {
      const user = users.get(userId);
      if (user) {
        user.isPlaying = false;
        user.updatedAt = now();
      }
    });

    if (room) {
      room.status = "closed";
      room.currentPlayers = 0;
      room.updatedAt = now();
    }
    roomPlayers.delete(game.roomId);
    changed = true;
  }

  if (changed) {
    ensureAutoRoomsAvailable(4);
  }
  return changed;
}

export async function initializeLocalStorePersistence() {
  if (!isMongoConfigured()) return;

  const dbName = process.env.MONGODB_DB_NAME || "domino";

  try {
    isPersistingSuspended = true;
    const db = await getMongoDb();
    const document = await db?.collection<MongoLocalStoreDocument>(MONGO_STORE_COLLECTION).findOne({ _id: MONGO_STORE_ID });

    if (document?.snapshot) {
      hydratePersistedLocalStore(document.snapshot);
      console.log(`[LocalStore] Dados carregados do MongoDB (${dbName}.${MONGO_STORE_COLLECTION}).`);
    } else {
      console.log(`[LocalStore] MongoDB conectado; criando estado inicial em ${dbName}.${MONGO_STORE_COLLECTION}.`);
    }
  } catch (error) {
    console.error("[LocalStore] Falha ao carregar dados do MongoDB:", error);
  } finally {
    isPersistingSuspended = false;
    isMongoPersistenceReady = true;
    ensureSeedData();
    const closedBotGames = closeRestoredBotGames();
    if (closedBotGames) {
      console.log("[LocalStore] Partidas com bot antigas foram encerradas após reinício.");
    }
    try {
      await persistLocalStoreToMongo(createSnapshot());
      console.log(`[LocalStore] Estado salvo no MongoDB (${dbName}.${MONGO_STORE_COLLECTION}).`);
    } catch (error) {
      console.error("[LocalStore] Falha ao criar estado inicial no MongoDB:", error);
    }
  }
}

export async function flushLocalStorePersistence() {
  if (mongoPersistTimer) {
    clearTimeout(mongoPersistTimer);
    mongoPersistTimer = null;
    mongoPersistInFlight = persistLocalStoreToMongo(createSnapshot()).catch((error) => {
      console.error("[LocalStore] Falha ao salvar dados no MongoDB:", error);
    });
  }
  await mongoPersistInFlight;
}

export async function persistLocalStoreNow() {
  if (isPersistingSuspended) return;
  const snapshot = createSnapshot();

  if (isMongoConfigured()) {
    await persistLocalStoreToMongo(snapshot);
    return;
  }

  persistLocalStore();
}

// Função utilitária para testes
export function addLocalUserForTest(user: LocalUser) {
  users.set(user.id, user);
  if (user.id >= nextUserId) nextUserId = user.id + 1;
  persistLocalStore();
}

function hashPassword(password: string) {
  return Buffer.from(`domino-local:${password}`).toString("base64");
}

function ensureSeedData() {
  if (users.size === 0) {
    createLocalUser({ name: "Administrador", email: "admin@domino.local", role: "admin", loginMethod: "password", password: "admin123" });
  }
  ensureStandardBotsLocal();

  if (rooms.size === 0) {
    ensureAutoRoomsAvailable(4);
  }
}

export function ensureStandardBotsLocal() {
  for (const bot of STANDARD_BOTS) {
    const existing = Array.from(users.values()).find((user) => user.email?.toLowerCase() === bot.email);
    if (existing) {
      existing.name = bot.name;
      existing.loginMethod = "bot";
      existing.role = "user";
      existing.isOnline = true;
      existing.updatedAt = now();
      playerStats.delete(existing.id);
      continue;
    }
    const created = createLocalUser({ name: bot.name, email: bot.email, loginMethod: "bot" });
    created.isOnline = true;
    playerStats.delete(created.id);
  }
  persistLocalStore();
}

function getNextAutoRoomName() {
  const name = AUTO_ROOM_NAMES[autoRoomCursor % AUTO_ROOM_NAMES.length];
  autoRoomCursor += 1;
  return name;
}

function createAutoRoomLocal() {
  const room: LocalRoom = {
    id: nextRoomId++,
    name: getNextAutoRoomName(),
    isPrivate: false,
    allowBot: false,
    createdBy: 1,
    maxPlayers: 4,
    currentPlayers: 0,
    status: "waiting",
    isAutoRoom: true,
    createdAt: now(),
    updatedAt: now(),
  };
  rooms.set(room.id, room);
  roomPlayers.set(room.id, []);
  return room;
}

function compactLegacySeats(ids: Array<number | null>) {
  return ids.filter((id): id is number => typeof id === "number" && id > 0);
}

function normalizeRoomSeats(roomId: number) {
  const room = rooms.get(roomId);
  const maxPlayers = room?.maxPlayers ?? 4;
  const seats = [...(roomPlayers.get(roomId) ?? [])].slice(0, maxPlayers);
  while (seats.length < maxPlayers) seats.push(null);
  roomPlayers.set(roomId, seats);
  return seats;
}

function countOccupiedSeats(ids: Array<number | null>) {
  return ids.filter((id) => typeof id === "number" && id > 0).length;
}

function ensureAutoRoomsAvailable(minAvailable = 4) {
  let changed = false;
  Array.from(rooms.values()).forEach((room) => {
    if (!room.isPrivate && room.isAutoRoom && room.allowBot) {
      room.allowBot = false;
      room.updatedAt = now();
      changed = true;
    }
  });
  const openAutoRooms = Array.from(rooms.values()).filter(
    (room) => room.status === "waiting" && !room.isPrivate && room.currentPlayers < room.maxPlayers
  );
  const missing = Math.max(0, minAvailable - openAutoRooms.length);
  for (let index = 0; index < missing; index += 1) {
    createAutoRoomLocal();
    changed = true;
  }
  if (changed) persistLocalStore();
}

export function cleanupExpiredPrivateRoomsLocal(maxAgeHours = 24) {
  const expiresBefore = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let changed = false;

  for (const [roomId, room] of Array.from(rooms.entries())) {
    if (!room.isPrivate || room.createdAt.getTime() >= expiresBefore) continue;

    const playerIds = compactLegacySeats(normalizeRoomSeats(roomId));
    playerIds.forEach((userId) => {
      const user = users.get(userId);
      if (user) {
        user.isPlaying = false;
        user.updatedAt = now();
      }
    });
    rooms.delete(roomId);
    roomPlayers.delete(roomId);
    games.delete(roomId);
    changed = true;
  }

  if (changed) {
    ensureAutoRoomsAvailable(4);
    persistLocalStore();
  }
  return changed;
}

export function getAllLocalUsers() {
  ensureSeedData();
  return Array.from(users.values());
}

export function getStandardBotsLocal() {
  ensureSeedData();
  const standardBotEmails = new Set(STANDARD_BOTS.map((bot) => bot.email));
  return Array.from(users.values()).filter((user) => user.email && standardBotEmails.has(user.email));
}

export function blockLocalUserByAdmin(userId: number, durationMinutes = 60, reason = "Bloqueio administrativo") {
  ensureSeedData();
  const user = users.get(userId);
  if (!user) throw new Error("Usuário não encontrado");
  if (user.role === "admin") throw new Error("Não é permitido bloquear outro administrador por aqui");
  if ((user.loginMethod ?? "") === "bot") throw new Error("Bots padrão não podem ser bloqueados");
  user.blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  user.blockReason = reason;
  user.isOnline = false;
  user.isPlaying = false;
  user.updatedAt = now();
  persistLocalStore();
  return user;
}

export function unblockLocalUserByAdmin(userId: number) {
  ensureSeedData();
  const user = users.get(userId);
  if (!user) throw new Error("Usuário não encontrado");
  user.blockedUntil = null;
  user.blockReason = null;
  user.updatedAt = now();
  persistLocalStore();
  return user;
}

export function resetLocalUserPasswordByAdmin(userId: number) {
  ensureSeedData();
  const user = users.get(userId);
  if (!user) throw new Error("Usuário não encontrado");
  if ((user.loginMethod ?? "") === "bot") throw new Error("Bots padrão não usam senha");
  const temporaryPassword = `Domino${Math.floor(100000 + Math.random() * 900000)}`;
  user.passwordHash = hashPassword(temporaryPassword);
  user.loginMethod = "password";
  user.updatedAt = now();
  persistLocalStore();
  return { userId: user.id, email: user.email, temporaryPassword };
}

export function createLocalUser(input: { name: string; email?: string | null; password?: string | null; role?: "user" | "admin"; loginMethod?: string | null; }): LocalUser {
  const created = now();
  const user: LocalUser = {
    id: nextUserId++,
    openId: `local-${Math.random().toString(36).slice(2, 10)}`,
    name: input.name,
    email: input.email ?? null,
    loginMethod: input.loginMethod ?? "local",
    passwordHash: input.password ? hashPassword(input.password) : null,
    role: input.role ?? "user",
    isOnline: true,
    isPlaying: false,
    blockedUntil: null,
    blockReason: null,
    createdAt: created,
    updatedAt: created,
    lastSignedIn: created,
  };
  users.set(user.id, user);
  if (!playerStats.has(user.id)) {
    playerStats.set(user.id, {
      userId: user.id,
      totalGames: 0,
      totalWins: 0,
      totalPoints: 0,
      level: 1,
      winRate: "0.00",
    });
  }
  persistLocalStore();
  return user;
}

export function loginLocalUser(name: string, email?: string | null) {
  ensureSeedData();
  const existing = Array.from(users.values()).find((u) => {
    if (email) return u.email?.toLowerCase() === email.toLowerCase();
    return u.name.toLowerCase() === name.toLowerCase();
  });

  if (existing) {
    existing.isOnline = true;
    existing.lastSignedIn = now();
    existing.updatedAt = now();
    persistLocalStore();
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
  persistLocalStore();
  return user;
}

export function requestEmailCode(email: string) {
  ensureSeedData();
  const code = "123456";
  pendingCodes.set(email.toLowerCase(), {
    email: email.toLowerCase(),
    code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  persistLocalStore();
  return { success: true, code, expiresInMinutes: 10 };
}

export function verifyEmailCode(email: string, code: string, name?: string) {
  const pending = pendingCodes.get(email.toLowerCase());
  if (!pending) throw new Error("Código não solicitado");
  if (pending.expiresAt < now()) throw new Error("Código expirado");
  if (pending.code !== code) throw new Error("Código inválido");
  pendingCodes.delete(email.toLowerCase());
  const user = loginLocalUser(name?.trim() || email.split("@")[0], email);
  persistLocalStore();
  return user;
}

export function getLocalUserById(userId: number | null | undefined) {
  if (!userId) return null;
  ensureSeedData();
  return users.get(userId) ?? null;
}

export function logoutLocalUser(userId: number) {
  const user = users.get(userId);

  for (const [roomId, room] of Array.from(rooms.entries())) {
    if (room.status !== "playing") continue;
    const seats = normalizeRoomSeats(roomId);
    if (!seats.includes(userId)) continue;
    leaveRoomLocal(roomId, userId);
  }

  leaveWaitingRoomsForUserLocal(userId);
  if (user) {
    user.isOnline = false;
    user.isPlaying = false;
    user.updatedAt = now();
  }
  persistLocalStore();
}

export function getOrCreatePlayerStats(userId: number): LocalPlayerStats {
  let stats = playerStats.get(userId);
  if (!stats) {
    stats = { userId, totalGames: 0, totalWins: 0, totalPoints: 0, level: 1, winRate: "0.00" };
    playerStats.set(userId, stats);
    persistLocalStore();
  }
  return stats;
}

export function updatePlayerStatsLocal(userId: number, updates: Partial<LocalPlayerStats>) {
  const stats = getOrCreatePlayerStats(userId);
  Object.assign(stats, updates);
  stats.level = calculateLevel(stats.totalGames, stats.totalWins);
  stats.winRate = calculateWinRate(stats.totalWins, stats.totalGames);
  persistLocalStore();
  return stats;
}

export function createRoomLocal(params: { name: string; isPrivate: boolean; allowBot: boolean; createdBy: number; }) {
  // ensureSeedData(); // Removido para evitar recursão infinita
  leaveWaitingRoomsForUserLocal(params.createdBy);
  const room: LocalRoom = {
    id: nextRoomId++,
    name: params.name,
    isPrivate: params.isPrivate,
    allowBot: params.allowBot,
    createdBy: params.createdBy,
    maxPlayers: 4,
    currentPlayers: 1,
    status: "waiting",
    isAutoRoom: false,
    createdAt: now(),
    updatedAt: now(),
  };
  rooms.set(room.id, room);
  roomPlayers.set(room.id, [params.createdBy, null, null, null]);
  persistLocalStore();
  return room;
}

export function listOpenRoomsLocal(limit = 20) {
  ensureSeedData();
  cleanupExpiredPrivateRoomsLocal();
  ensureAutoRoomsAvailable(4);
  return Array.from(rooms.values())
    .filter((room) => room.status === "waiting" && room.currentPlayers < room.maxPlayers)
    .sort((a, b) => Number(Boolean(b.isAutoRoom)) - Number(Boolean(a.isAutoRoom)) || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);
}

export function searchPrivateRoomsLocal(query: string) {
  cleanupExpiredPrivateRoomsLocal();
  return listOpenRoomsLocal(100).filter((room) => room.isPrivate && room.name.toLowerCase().includes(query.toLowerCase()));
}

export function getRoomByIdLocal(roomId: number) {
  return rooms.get(roomId) ?? null;
}

export function getRoomPlayersLocal(roomId: number) {
  const ids = normalizeRoomSeats(roomId);
  return ids.flatMap((userId, index) => {
    if (typeof userId !== "number" || userId <= 0) return [];
    const user = users.get(userId)!;
    return [{
      id: index + 1,
      roomId,
      userId,
      seatPosition: index + 1,
      joinedAt: user.createdAt,
      leftAt: null,
      name: user.name,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      isBot: (user.loginMethod ?? "") === "bot",
      isOnline: user.isOnline,
      isPlaying: user.isPlaying,
      role: user.role,
    }];
  });
}

export function getWaitingRoomForUserLocal(userId: number) {
  for (const [roomId, room] of Array.from(rooms.entries())) {
    if (room.status !== "waiting") continue;
    const seats = normalizeRoomSeats(roomId);
    const seatIndex = seats.indexOf(userId);
    if (seatIndex < 0) continue;
    return { ...room, position: seatIndex + 1 };
  }
  return null;
}

export function cleanupOfflinePlayersLocal(roomId: number) {
  const room = rooms.get(roomId);
  if (!room) return;

  const current = normalizeRoomSeats(roomId);
  let hasChanges = false;

  for (let i = 0; i < current.length; i++) {
    const userId = current[i];
    if (typeof userId !== "number" || userId <= 0) continue;

    const user = users.get(userId);
    if (user && !user.isOnline && user.loginMethod !== "bot") {
      current[i] = null;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    roomPlayers.set(roomId, current);
    room.currentPlayers = countOccupiedSeats(current);
    room.updatedAt = now();
    if (room.currentPlayers === 0 && room.isPrivate) {
      room.status = "closed";
    }
    persistLocalStore();
  }
}

export function joinRoomLocal(roomId: number, userId: number, requestedPosition?: number | null) {
  const room = rooms.get(roomId);
  if (!room) throw new Error("Sala não encontrada");
  if (room.status !== "waiting") throw new Error("Esta sala já iniciou");
  
  // Limpar usuários offline antes de processar
  cleanupOfflinePlayersLocal(roomId);
  
  leaveWaitingRoomsForUserLocal(userId, roomId);
  const current = normalizeRoomSeats(roomId);
  const existingIndex = current.indexOf(userId);
  if (existingIndex >= 0) {
    const nextIndex = requestedPosition ? requestedPosition - 1 : existingIndex;
    if (nextIndex < 0 || nextIndex >= room.maxPlayers) throw new Error("Posição inválida");
    if (nextIndex === existingIndex) {
      current[existingIndex] = null;
      roomPlayers.set(roomId, current);
      room.currentPlayers = countOccupiedSeats(current);
      room.updatedAt = now();
      const user = users.get(userId);
      if (user) {
        user.isPlaying = false;
        user.updatedAt = now();
      }
      if (room.currentPlayers === 0 && room.isPrivate) {
        room.status = "closed";
      }
      ensureAutoRoomsAvailable(4);
      persistLocalStore();
      return room;
    }
    if (nextIndex !== existingIndex) {
      if (current[nextIndex]) throw new Error("Esta posição já está ocupada");
      current[existingIndex] = null;
      current[nextIndex] = userId;
      roomPlayers.set(roomId, current);
      room.currentPlayers = countOccupiedSeats(current);
      room.updatedAt = now();
      persistLocalStore();
    }
    return room;
  }
  if (countOccupiedSeats(current) >= room.maxPlayers) throw new Error("Sala está cheia");
  const positionIndex = requestedPosition ? requestedPosition - 1 : current.findIndex((id) => !id);
  if (positionIndex < 0 || positionIndex >= room.maxPlayers) throw new Error("Posição inválida");
  if (current[positionIndex]) throw new Error("Esta posição já está ocupada");
  current[positionIndex] = userId;
  roomPlayers.set(roomId, current);
  room.currentPlayers = countOccupiedSeats(current);
  room.updatedAt = now();
  const user = users.get(userId);
  if (user) {
    user.isPlaying = true;
    user.updatedAt = now();
  }
  if (room.currentPlayers >= room.maxPlayers || room.isAutoRoom) {
    if (room.currentPlayers >= room.maxPlayers) {
      room.status = "playing";
      room.updatedAt = now();
    }
    ensureAutoRoomsAvailable(4);
  }
  persistLocalStore();
  return room;
}

export function leaveWaitingRoomsForUserLocal(userId: number, exceptRoomId?: number) {
  let changed = false;

  for (const [roomId, room] of Array.from(rooms.entries())) {
    if (roomId === exceptRoomId || room.status !== "waiting") continue;

    const seats = normalizeRoomSeats(roomId);
    if (!seats.includes(userId)) continue;

    const nextSeats = seats.map((id) => (id === userId ? null : id));
    roomPlayers.set(roomId, nextSeats);
    room.currentPlayers = countOccupiedSeats(nextSeats);
    room.updatedAt = now();
    if (room.currentPlayers === 0 && room.isPrivate) {
      room.status = "closed";
    }
    changed = true;
  }

  if (changed) {
    ensureAutoRoomsAvailable(4);
    persistLocalStore();
  }
}

export function leaveRoomLocal(roomId: number, userId: number) {
  const room = rooms.get(roomId);
  if (!room) return;
  const existingPlayers = normalizeRoomSeats(roomId);
  const userIndex = existingPlayers.indexOf(userId);
  const user = users.get(userId);
  if (user) {
    user.isPlaying = false;
    user.updatedAt = now();
  }

  if (room.status === "playing" && userIndex >= 0) {
    const replacementBot = getStandardBotUser(userIndex);
    const replacedPlayers = [...existingPlayers];
    replacedPlayers[userIndex] = replacementBot.id;

    const game = games.get(roomId);
    if (game) {
      game.playerIds[userIndex] = replacementBot.id;
      game.playerNames[userIndex] = replacementBot.name;
      game.isBotPlayer[userIndex] = true;
      game.announcements = [
        ...(game.announcements ?? []),
        `${user?.name ?? "Um jogador"} saiu da partida. ${replacementBot.name} assumiu automaticamente.`,
      ];
      games.set(roomId, game);
    }

    roomPlayers.set(roomId, replacedPlayers);
    room.currentPlayers = replacedPlayers.length;
    room.updatedAt = now();
    ensureAutoRoomsAvailable(4);
    persistLocalStore();
    return;
  }

  const current = existingPlayers.map((id) => (id === userId ? null : id));
  roomPlayers.set(roomId, current);
  room.currentPlayers = countOccupiedSeats(current);
  room.updatedAt = now();
  if (room.currentPlayers === 0) {
    room.status = "closed";
  }
  persistLocalStore();
}

function getStandardBotUser(index: number) {
  ensureStandardBotsLocal();
  const spec = STANDARD_BOTS[index % STANDARD_BOTS.length];
  const bot = Array.from(users.values()).find((user) => user.email?.toLowerCase() === spec.email);
  if (!bot) throw new Error("Bot padrão não encontrado");
  bot.isOnline = true;
  bot.updatedAt = now();
  return bot;
}

export function ensureRoomReadyWithBots(roomId: number) {
  const room = rooms.get(roomId);
  if (!room) throw new Error("Sala não encontrada");
  if (!room.allowBot) return getRoomPlayersLocal(roomId);
  const current = normalizeRoomSeats(roomId);
  for (let index = 0; index < room.maxPlayers; index += 1) {
    if (current[index]) continue;
    const bot = getStandardBotUser(index);
    current[index] = bot.id;
  }
  roomPlayers.set(roomId, current);
  room.currentPlayers = countOccupiedSeats(current);
  room.status = "playing";
  room.updatedAt = now();
  persistLocalStore();
  return getRoomPlayersLocal(roomId);
}

function cloneDomino(domino: Domino): Domino {
  return { left: domino.left, right: domino.right };
}

function orientForLeft(domino: Domino, openValue: number | null): Domino {
  if (openValue === null) return cloneDomino(domino);
  if (domino.right === openValue) return cloneDomino(domino);
  return { left: domino.right, right: domino.left };
}

function orientForRight(domino: Domino, openValue: number | null): Domino {
  if (openValue === null) return cloneDomino(domino);
  if (domino.left === openValue) return cloneDomino(domino);
  return { left: domino.right, right: domino.left };
}

export function createGameLocal(roomId: number, options?: { playerIds?: number[]; status?: LocalGameState["status"] }) {
  ensureAutoRoomsAvailable(4);
  const room = rooms.get(roomId);
  if (!room) throw new Error("Sala não encontrada");

  if (room.allowBot) {
    ensureRoomReadyWithBots(roomId);
  }

  const playerIds = options?.playerIds ?? compactLegacySeats(normalizeRoomSeats(roomId));
  if (playerIds.length !== 4) {
    throw new Error("A partida de dominó deve iniciar sempre com 4 jogadores");
  }

  const hands = shuffle(createDominoes());
  const dealt = playerIds.map((_, index) => hands.slice(index * 7, (index + 1) * 7));
  const playerNames = playerIds.map((id) => users.get(id)?.name ?? `Jogador ${id}`);
  const isBotPlayer = playerIds.map((id) => (users.get(id)?.loginMethod ?? "") === "bot");
  let currentPlayerIndex = 0;
  const carrocaIndex = dealt.findIndex((hand) => Boolean(findCarrocaSena(hand)));
  if (carrocaIndex >= 0) currentPlayerIndex = carrocaIndex;

  const game: LocalGameState = {
    gameId: nextGameId++,
    roomId,
    roomName: room.name,
    status: options?.status ?? "waiting",
    currentPlayerIndex,
    roundNumber: 1,
    boardState: { ...createEmptyBoardState(), turnStartedAt: Date.now() } as BoardState,
    playerHands: dealt,
    playerScores: new Array(playerIds.length).fill(0),
    playerIds,
    playerNames,
    isBotPlayer,
    winnerId: null,
    winnerTeam: null,
    teamScores: [0, 0],
    passCount: 0,
    announcements: [
      `Primeira saída: ${playerNames[currentPlayerIndex]} com a carroça de sena (6-6).`,
      `Pontuação apenas em múltiplos de 5 e com anúncio correto do jogador.`,
    ],
    lastMove: null,
  };

  room.status = options?.status === "abandoned" ? "finished" : (options?.status ?? "playing");
  room.updatedAt = now();
  ensureAutoRoomsAvailable(4);
  playerIds.forEach((id) => {
    const user = users.get(id);
    if (user) user.isPlaying = true;
  });

  games.set(roomId, game);
  messages.set(game.gameId, []);
  persistLocalStore();
  return game;
}

export function getGameByRoomLocal(roomId: number) {
  return games.get(roomId) ?? null;
}

export function getGameByIdLocal(gameIdOrRoomId: number) {
  return games.get(gameIdOrRoomId) ?? Array.from(games.values()).find((game) => game.gameId === gameIdOrRoomId) ?? null;
}

export function setGameLocal(game: LocalGameState) {
  games.set(game.roomId, game);
  const room = rooms.get(game.roomId);
  if (room && game.status === "playing") room.updatedAt = now();
  persistLocalStore();
  return game;
}

export function markLocalUserPresence(userId: number, isOnline = true) {
  const user = users.get(userId);
  if (!user || (user.loginMethod ?? "") === "bot") return null;
  user.isOnline = isOnline;
  user.updatedAt = now();
  if (!isOnline) {
    user.isPlaying = false;
    leaveWaitingRoomsForUserLocal(userId);
  }
  persistLocalStore();
  return user;
}

export function cleanupStaleLocalUsers(maxAgeMs = 20_000) {
  const cutoff = Date.now() - maxAgeMs;
  let changed = false;
  for (const user of Array.from(users.values())) {
    if ((user.loginMethod ?? "") === "bot" || !user.isOnline) continue;
    if (user.updatedAt.getTime() >= cutoff) continue;
    user.isOnline = false;
    user.isPlaying = false;
    user.updatedAt = now();
    leaveWaitingRoomsForUserLocal(user.id);
    changed = true;
  }
  if (changed) persistLocalStore();
}

export function closeInactiveGamesLocal() {
  ensureSeedData();
  const currentTime = Date.now();
  const closed: LocalGameState[] = [];
  const warned: LocalGameState[] = [];

  for (const game of Array.from(games.values())) {
    if (game.status !== "playing") continue;
    const room = rooms.get(game.roomId);
    const lastActivity = room?.updatedAt?.getTime() ?? currentTime;
    const inactiveMs = currentTime - lastActivity;

    if (inactiveMs >= 60_000) {
      game.status = "abandoned";
      game.announcements = [...(game.announcements ?? []), "Partida encerrada automaticamente por 1 minuto sem movimentação."];
      game.playerIds.forEach((userId: number) => {
        const user = users.get(userId);
        if (user) user.isPlaying = false;
      });
      if (room) {
        room.status = "closed";
        room.updatedAt = now();
      }
      closed.push(game);
      continue;
    }

    if (inactiveMs >= 45_000 && !game.announcements.some((item: string) => item.includes("sem movimentação"))) {
      game.announcements = [...(game.announcements ?? []), "Aviso: esta partida será fechada se ficar 1 minuto sem movimentação."];
      warned.push(game);
    }
  }

  if (closed.length || warned.length) {
    ensureAutoRoomsAvailable(4);
    persistLocalStore();
  }
  return { closedCount: closed.length, warnedCount: warned.length };
}

export function getTeamIndex(playerIndex: number, playerCount: number) {
  if (playerCount === 2) return playerIndex;
  return playerIndex % 2;
}

export function recomputeTeamScores(game: LocalGameState) {
  const teamScores = [0, 0];
  for (let i = 0; i < game.playerScores.length; i++) {
    const team = getTeamIndex(i, game.playerScores.length);
    teamScores[team] += game.playerScores[i];
  }
  game.teamScores = teamScores;
  return game;
}

export function appendMessage(gameId: number, userId: number, message: string, isOffensive: boolean) {
  const user = users.get(userId);
  const msg: LocalMessage = {
    id: nextMessageId++,
    gameId,
    userId,
    userName: user?.name ?? `Jogador ${userId}`,
    message,
    isOffensive,
    createdAt: now(),
  };
  const current = messages.get(gameId) ?? [];
  current.push(msg);
  messages.set(gameId, current);
  persistLocalStore();
  return msg;
}

export function getMessagesLocal(gameId: number) {
  return messages.get(gameId) ?? [];
}

export function isBlockedLocal(userId: number) {
  const user = users.get(userId);
  if (!user?.blockedUntil) return false;
  return user.blockedUntil.getTime() > Date.now();
}

export function addInfractionLocal(userId: number, reason: string) {
  const count = infractions.filter((item) => item.userId === userId).length + 1;
  let blockDuration: "24h" | "30d" | "permanent" = "24h";
  let unblockAt: Date | null = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (count === 2) {
    blockDuration = "30d";
    unblockAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  if (count >= 3) {
    blockDuration = "permanent";
    unblockAt = new Date("2099-12-31T23:59:59.000Z");
  }

  infractions.push({
    id: nextInfractionId++,
    userId,
    infractionCount: count,
    blockDuration,
    blockedAt: now(),
    unblockAt,
    reason,
  });

  const user = users.get(userId);
  if (user) {
    user.blockedUntil = unblockAt;
    user.blockReason = reason;
    user.updatedAt = now();
  }

  persistLocalStore();
  return { count, blockDuration, unblockAt };
}

export function listInfractionsLocal() {
  return [...infractions].sort((a, b) => b.blockedAt.getTime() - a.blockedAt.getTime());
}

function normalizeInviteState(invite: LocalFriendInvite) {
  if (invite.status === "pending" && invite.expiresAt.getTime() < Date.now()) {
    invite.status = "expired";
  }
  return invite;
}

function areFriendsLocal(userA: number, userB: number) {
  return friendInvites.some((invite) => {
    normalizeInviteState(invite);
    const samePair = (invite.fromUserId === userA && invite.toUserId === userB) || (invite.fromUserId === userB && invite.toUserId === userA);
    return samePair && invite.status === "accepted";
  });
}

export function listAvailableUsersLocal(currentUserId: number) {
  ensureSeedData();
  return Array.from(users.values())
    .filter((user) => (user.loginMethod ?? "") !== "bot")
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isOnline: user.isOnline,
      isPlaying: user.isPlaying,
      isSelf: user.id === currentUserId,
      isBlocked: isBlockedLocal(user.id),
      isFriend: areFriendsLocal(currentUserId, user.id),
    }))
    .sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.name.localeCompare(b.name));
}

export function sendFriendInviteLocal(fromUserId: number, toUserId: number, gameId?: number | null) {
  ensureSeedData();
  if (fromUserId === toUserId) throw new Error("Você não pode convidar a si mesmo");
  if (!users.has(fromUserId) || !users.has(toUserId)) throw new Error("Usuário não encontrado");
  if (areFriendsLocal(fromUserId, toUserId)) throw new Error("Este usuário já é seu amigo");

  const duplicated = friendInvites.find((invite) => {
    normalizeInviteState(invite);
    const samePair = (invite.fromUserId === fromUserId && invite.toUserId === toUserId) || (invite.fromUserId === toUserId && invite.toUserId === fromUserId);
    return samePair && invite.status === "pending";
  });

  if (duplicated) throw new Error("Já existe um convite pendente entre vocês");

  const invite: LocalFriendInvite = {
    id: nextFriendInviteId++,
    fromUserId,
    toUserId,
    gameId: gameId ?? null,
    status: "pending",
    createdAt: now(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
  friendInvites.push(invite);
  persistLocalStore();
  return invite;
}

export function respondFriendInviteLocal(inviteId: number, currentUserId: number, action: "accepted" | "declined") {
  const invite = friendInvites.find((item) => item.id === inviteId);
  if (!invite) throw new Error("Convite não encontrado");
  normalizeInviteState(invite);
  if (invite.toUserId !== currentUserId) throw new Error("Você não pode responder este convite");
  if (invite.status !== "pending") throw new Error("Este convite já foi respondido");
  invite.status = action;
  persistLocalStore();
  return invite;
}

export function listFriendInvitesLocal(currentUserId: number) {
  ensureSeedData();
  return friendInvites
    .map((invite) => normalizeInviteState(invite))
    .filter((invite) => invite.fromUserId === currentUserId || invite.toUserId === currentUserId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((invite) => ({
      ...invite,
      fromUserName: users.get(invite.fromUserId)?.name ?? `Jogador ${invite.fromUserId}`,
      toUserName: users.get(invite.toUserId)?.name ?? `Jogador ${invite.toUserId}`,
    }));
}

export function listFriendsLocal(currentUserId: number) {
  ensureSeedData();
  const friendIds = new Set<number>();
  for (const invite of friendInvites) {
    normalizeInviteState(invite);
    if (invite.status !== "accepted") continue;
    if (invite.fromUserId === currentUserId) friendIds.add(invite.toUserId);
    if (invite.toUserId === currentUserId) friendIds.add(invite.fromUserId);
  }

  return Array.from(friendIds)
    .map((friendId) => users.get(friendId))
    .filter((user): user is LocalUser => Boolean(user))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isOnline: user.isOnline,
      isPlaying: user.isPlaying,
      isBlocked: isBlockedLocal(user.id),
      statusLabel: user.isPlaying ? "Jogando" : user.isOnline ? "Disponível" : "Offline",
    }))
    .sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.name.localeCompare(b.name));
}

export function getAdminStatsLocal() {
  ensureSeedData();
  cleanupExpiredPrivateRoomsLocal();
  const allUsers = Array.from(users.values());
  const allRooms = Array.from(rooms.values());
  const allGames = Array.from(games.values());
  const humanUsers = allUsers.filter((user) => (user.loginMethod ?? "") !== "bot");
  const standardBotEmails = new Set(STANDARD_BOTS.map((bot) => bot.email));
  const botUsers = allUsers.filter((user) => user.email && standardBotEmails.has(user.email));
  return {
    totalUsers: humanUsers.length,
    totalBotPlayers: botUsers.length,
    totalGames: allGames.length,
    playingGames: allGames.filter((game) => game.status === "playing").length,
    completedGames: allGames.filter((game) => game.status === "finished").length,
    abandonedGames: allGames.filter((game) => game.status === "abandoned").length,
    activeRooms: allRooms.filter((room) => room.status === "waiting").length,
    playingRooms: allRooms.filter((room) => room.status === "playing").length,
    privateRooms: allRooms.filter((room) => room.isPrivate && room.status !== "closed").length,
    publicRooms: allRooms.filter((room) => !room.isPrivate && room.status === "waiting").length,
    totalInfractions: infractions.length,
    blockedUsers: humanUsers.filter((user) => isBlockedLocal(user.id)).length,
    totalFriendInvites: friendInvites.length,
  };
}

export function listRoomsLocalAll() {
  cleanupExpiredPrivateRoomsLocal();
  return Array.from(rooms.values())
    .map((room) => ({
      ...room,
      players: getRoomPlayersLocal(room.id),
    }))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function listGamesLocalAll() {
  return Array.from(games.values()).sort((a, b) => b.gameId - a.gameId);
}

export function getRankingLocal(limit = 100, offset = 0) {
  const stats = Array.from(playerStats.values())
    .filter((stat) => (users.get(stat.userId)?.loginMethod ?? "") !== "bot")
    .sort((a, b) => b.totalPoints - a.totalPoints || b.totalWins - a.totalWins || b.level - a.level)
    .slice(offset, offset + limit);

  return stats.map((stat, index) => ({
    rank: offset + index + 1,
    userId: stat.userId,
    userName: users.get(stat.userId)?.name ?? `Jogador ${stat.userId}`,
    totalGames: stat.totalGames,
    totalWins: stat.totalWins,
    winRate: parseFloat(stat.winRate),
    level: stat.level,
    totalPoints: stat.totalPoints,
  }));
}

export function getPlayerRankingLocal(userId: number) {
  const ranking = getRankingLocal(1000, 0);
  const found = ranking.find((item) => item.userId === userId);
  const stats = getOrCreatePlayerStats(userId);
  return {
    rank: found?.rank ?? null,
    totalGames: stats.totalGames,
    totalWins: stats.totalWins,
    winRate: parseFloat(stats.winRate),
    level: stats.level,
    totalPoints: stats.totalPoints,
  };
}

export function getPlayerStatsLocal(userId: number) {
  const stats = getOrCreatePlayerStats(userId);
  const experience = stats.totalGames + stats.totalWins * 2;
  const currentLevelBase = (stats.level - 1) * 10;
  const nextLevelProgress = Math.min(100, Math.max(0, Math.floor(((experience - currentLevelBase) / 10) * 100)));
  return {
    totalGames: stats.totalGames,
    totalWins: stats.totalWins,
    winRate: parseFloat(stats.winRate),
    level: stats.level,
    totalPoints: stats.totalPoints,
    nextLevelProgress,
  };
}

export function getTopPlayersLocal() {
  return getRankingLocal(10, 0).map((item, index) => ({
    rank: index + 1,
    userId: item.userId,
    userName: item.userName,
    level: item.level,
    totalWins: item.totalWins,
    winRate: item.winRate,
  }));
}

export function recordFinishedGame(game: LocalGameState) {
  const teamWinner = game.winnerTeam;
  game.playerIds.forEach((userId, playerIndex) => {
    if ((users.get(userId)?.loginMethod ?? "") === "bot") return;
    const stats = getOrCreatePlayerStats(userId);
    const isWinner = teamWinner !== null && getTeamIndex(playerIndex, game.playerIds.length) === teamWinner;
    stats.totalGames += 1;
    stats.totalPoints += isWinner ? 1 : -1;
    if (stats.totalPoints < 0) stats.totalPoints = 0;
    if (isWinner) {
      stats.totalWins += 1;
    }
    stats.level = calculateLevel(stats.totalGames, stats.totalWins);
    stats.winRate = calculateWinRate(stats.totalWins, stats.totalGames);
  });

  game.playerIds.forEach((userId) => {
    const user = users.get(userId);
    if (user) user.isPlaying = false;
  });

  const room = rooms.get(game.roomId);
  if (room) room.status = "finished";
  ensureAutoRoomsAvailable(4);
  persistLocalStore();
}

export function recordRoomMatchResultLocal(roomId: number, winnerPlayerIndex: number) {
  const ids = compactLegacySeats(normalizeRoomSeats(roomId));
  if (ids.length === 0) return;

  const winnerTeam = getTeamIndex(winnerPlayerIndex, ids.length);
  ids.forEach((userId, playerIndex) => {
    if ((users.get(userId)?.loginMethod ?? "") === "bot") {
      const bot = users.get(userId);
      if (bot) bot.isPlaying = false;
      return;
    }
    const stats = getOrCreatePlayerStats(userId);
    const isWinner = getTeamIndex(playerIndex, ids.length) === winnerTeam;
    stats.totalGames += 1;
    if (isWinner) {
      stats.totalWins += 1;
      stats.totalPoints += 1;
    } else {
      stats.totalPoints = Math.max(0, stats.totalPoints - 1);
    }
    stats.level = calculateLevel(stats.totalGames, stats.totalWins);
    stats.winRate = calculateWinRate(stats.totalWins, stats.totalGames);

    const user = users.get(userId);
    if (user) user.isPlaying = false;
  });

  const room = rooms.get(roomId);
  if (room) {
    room.status = "finished";
    room.updatedAt = now();
  }
  ensureAutoRoomsAvailable(4);
  persistLocalStore();
}

export function createCalendarEventLocal(input: {
  userId: number;
  title: string;
  description?: string | null;
  dueDate: Date;
  eventType: LocalCalendarEvent["eventType"];
  priority: LocalCalendarEvent["priority"];
}) {
  const created = now();
  const event: LocalCalendarEvent = {
    id: nextCalendarEventId++,
    userId: input.userId,
    title: input.title,
    description: input.description ?? null,
    dueDate: input.dueDate,
    eventType: input.eventType,
    priority: input.priority,
    completed: false,
    createdAt: created,
    updatedAt: created,
  };
  calendarEvents.set(event.id, event);
  persistLocalStore();
  return event;
}

export function listCalendarEventsLocal(userId: number, startDate: Date, endDate: Date) {
  return Array.from(calendarEvents.values())
    .filter((event) => event.userId === userId && event.dueDate >= startDate && event.dueDate <= endDate)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function listUpcomingCalendarEventsLocal(userId: number, days: number) {
  const startDate = now();
  const endDate = now();
  endDate.setDate(endDate.getDate() + days);
  return Array.from(calendarEvents.values())
    .filter((event) => event.userId === userId && !event.completed && event.dueDate >= startDate && event.dueDate <= endDate)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function updateCalendarEventLocal(userId: number, eventId: number, updates: Partial<Omit<LocalCalendarEvent, "id" | "userId" | "createdAt" | "updatedAt">>) {
  const event = calendarEvents.get(eventId);
  if (!event || event.userId !== userId) return false;
  Object.assign(event, updates, { updatedAt: now() });
  persistLocalStore();
  return true;
}

export function deleteCalendarEventLocal(userId: number, eventId: number) {
  const event = calendarEvents.get(eventId);
  if (!event || event.userId !== userId) return false;
  calendarEvents.delete(eventId);
  persistLocalStore();
  return true;
}

export function updateLocalUserProfile(userId: number, profile: {
  displayName?: string;
  avatarType?: "preset" | "upload";
  avatarPresetId?: string;
  avatarImage?: string;
}) {
  const user = users.get(userId);
  if (!user) return;

  if (profile.displayName !== undefined) {
    user.displayName = profile.displayName;
  }
  if (profile.avatarType !== undefined) {
    user.avatarType = profile.avatarType;
  }
  if (profile.avatarPresetId !== undefined) {
    user.avatarPresetId = profile.avatarPresetId;
  }
  if (profile.avatarImage !== undefined) {
    user.avatarImage = profile.avatarImage;
  }
  user.updatedAt = now();
  persistLocalStore();
}

loadPersistedLocalStore();
ensureSeedData();
