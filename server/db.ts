import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, rooms, games, playerStats, InsertRoom, InsertGame } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (process.env.DATABASE_URL?.startsWith("mongodb")) {
    return null;
  }

  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Room queries
export async function createRoom(data: InsertRoom) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(rooms).values(data);
  return result;
}

export async function getRoomById(roomId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listOpenRooms(limit: number = 20) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(rooms).where(eq(rooms.status, "waiting")).limit(limit);
}

export async function updateRoomStatus(roomId: number, status: "waiting" | "playing" | "finished" | "closed") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(rooms).set({ status }).where(eq(rooms.id, roomId));
}

// Game queries
export async function createGame(data: InsertGame) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(games).values(data);
  return result;
}

export async function getGameById(gameId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Player stats queries
export async function getOrCreatePlayerStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { playerStats } = await import("../drizzle/schema");
  const existing = await db.select().from(playerStats).where(eq(playerStats.userId, userId)).limit(1);
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  const newStats = { userId, totalGames: 0, totalWins: 0, totalPoints: 0, level: 1, winRate: "0.00" };
  await db.insert(playerStats).values([newStats]);
  return newStats;
}

export async function updateUserProfile(openId: string, profile: {
  displayName?: string;
  avatarType?: "preset" | "upload";
  avatarPresetId?: string;
  avatarImage?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user profile: database not available");
    return;
  }

  try {
    const updateSet: Record<string, unknown> = {};

    if (profile.displayName !== undefined) {
      updateSet.displayName = profile.displayName;
    }
    if (profile.avatarType !== undefined) {
      updateSet.avatarType = profile.avatarType;
    }
    if (profile.avatarPresetId !== undefined) {
      updateSet.avatarPresetId = profile.avatarPresetId;
    }
    if (profile.avatarImage !== undefined) {
      updateSet.avatarImage = profile.avatarImage;
    }

    if (Object.keys(updateSet).length > 0) {
      updateSet.updatedAt = new Date();
      await db.update(users).set(updateSet).where(eq(users.openId, openId));
    }
  } catch (error) {
    console.error("[Database] Failed to update user profile:", error);
    throw error;
  }
}
