import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isOnline: boolean("isOnline").default(false).notNull(),
  isPlaying: boolean("isPlaying").default(false).notNull(),
  blockedUntil: timestamp("blockedUntil"),
  blockReason: varchar("blockReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  // New profile fields
  displayName: varchar("displayName", { length: 100 }),
  avatarType: mysqlEnum("avatarType", ["preset", "upload"]).default("preset").notNull(),
  avatarPresetId: varchar("avatarPresetId", { length: 50 }),
  avatarImage: text("avatarImage"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Rooms (Salas de Jogo)
export const rooms = mysqlTable("rooms", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  isPrivate: boolean("isPrivate").default(false).notNull(),
  createdBy: int("createdBy").notNull(),
  maxPlayers: int("maxPlayers").default(4).notNull(),
  currentPlayers: int("currentPlayers").default(0).notNull(),
  status: mysqlEnum("status", ["waiting", "playing", "finished", "closed"]).default("waiting").notNull(),
  allowBot: boolean("allowBot").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = typeof rooms.$inferInsert;

// Room Players (Jogadores em uma Sala)
export const roomPlayers = mysqlTable("room_players", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  seatPosition: int("seatPosition").default(1).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  leftAt: timestamp("leftAt"),
});

export type RoomPlayer = typeof roomPlayers.$inferSelect;
export type InsertRoomPlayer = typeof roomPlayers.$inferInsert;

// Games (Partidas)
export const games = mysqlTable("games", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  status: mysqlEnum("status", ["waiting", "playing", "finished", "abandoned"]).default("waiting").notNull(),
  currentPlayerIndex: int("currentPlayerIndex").default(0).notNull(),
  roundNumber: int("roundNumber").default(1).notNull(),
  winnerId: int("winnerId"),
  boardState: json("boardState"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  finishedAt: timestamp("finishedAt"),
});

export type Game = typeof games.$inferSelect;
export type InsertGame = typeof games.$inferInsert;

// Game Players (Jogadores em uma Partida com Pontuação)
export const gamePlayers = mysqlTable("game_players", {
  id: int("id").autoincrement().primaryKey(),
  gameId: int("gameId").notNull(),
  userId: int("userId").notNull(),
  playerIndex: int("playerIndex").notNull(),
  hand: json("hand"),
  score: int("score").default(0).notNull(),
  isBot: boolean("isBot").default(false).notNull(),
});

export type GamePlayer = typeof gamePlayers.$inferSelect;
export type InsertGamePlayer = typeof gamePlayers.$inferInsert;

// Moves (Jogadas)
export const moves = mysqlTable("moves", {
  id: int("id").autoincrement().primaryKey(),
  gameId: int("gameId").notNull(),
  userId: int("userId").notNull(),
  moveNumber: int("moveNumber").notNull(),
  domino: json("domino"),
  side: mysqlEnum("side", ["left", "right", "up", "down"]).notNull(),
  pointsEarned: int("pointsEarned").default(0).notNull(),
  isBonus50: boolean("isBonus50").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Move = typeof moves.$inferSelect;
export type InsertMove = typeof moves.$inferInsert;

// Chat Messages (Mensagens de Chat)
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  gameId: int("gameId").notNull(),
  userId: int("userId").notNull(),
  message: text("message").notNull(),
  isOffensive: boolean("isOffensive").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// Chat Infractions (Infrações de Chat)
export const chatInfractions = mysqlTable("chat_infractions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  infractionCount: int("infractionCount").default(1).notNull(),
  blockDuration: mysqlEnum("blockDuration", ["24h", "30d", "permanent"]).notNull(),
  blockedAt: timestamp("blockedAt").defaultNow().notNull(),
  unblockAt: timestamp("unblockAt"),
  reason: text("reason"),
});

export type ChatInfraction = typeof chatInfractions.$inferSelect;
export type InsertChatInfraction = typeof chatInfractions.$inferInsert;

// Player Stats (Estatísticas de Jogador)
export const playerStats = mysqlTable("player_stats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  totalGames: int("totalGames").default(0).notNull(),
  totalWins: int("totalWins").default(0).notNull(),
  totalPoints: int("totalPoints").default(0).notNull(),
  level: int("level").default(1).notNull(),
  winRate: decimal("winRate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlayerStats = typeof playerStats.$inferSelect;
export type InsertPlayerStats = typeof playerStats.$inferInsert;

// Friend Invites (Convites de Amigos)
export const friendInvites = mysqlTable("friend_invites", {
  id: int("id").autoincrement().primaryKey(),
  fromUserId: int("fromUserId").notNull(),
  toUserId: int("toUserId").notNull(),
  gameId: int("gameId"),
  status: mysqlEnum("status", ["pending", "accepted", "declined", "expired"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
});

export type FriendInvite = typeof friendInvites.$inferSelect;
export type InsertFriendInvite = typeof friendInvites.$inferInsert;

// Calendar Events / Vencimentos (Eventos de Agenda)
export const calendarEvents = mysqlTable("calendar_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: timestamp("dueDate").notNull(),
  eventType: mysqlEnum("eventType", ["vencimento", "fatura", "documento", "lembretes", "outro"]).default("outro").notNull(),
  priority: mysqlEnum("priority", ["baixa", "media", "alta"]).default("media").notNull(),
  completed: boolean("completed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = typeof calendarEvents.$inferInsert;
