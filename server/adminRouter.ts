import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { users, games, rooms, roomPlayers, chatInfractions } from "../drizzle/schema";
import { and, eq, desc, inArray, lt } from "drizzle-orm";
import {
  blockLocalUserByAdmin,
  cleanupExpiredPrivateRoomsLocal,
  getAdminStatsLocal,
  getAllLocalUsers,
  getLocalUserById,
  getRankingLocal,
  getStandardBotsLocal,
  listGamesLocalAll,
  listInfractionsLocal,
  listRoomsLocalAll,
  resetLocalUserPasswordByAdmin,
  unblockLocalUserByAdmin,
} from "./localStore";

async function cleanupExpiredPrivateRoomsDb() {
  const db = await getDb();
  if (!db) {
    cleanupExpiredPrivateRoomsLocal();
    return;
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expired = await db.select().from(rooms).where(and(eq(rooms.isPrivate, true), lt(rooms.createdAt, cutoff)));
  for (const room of expired) {
    await db.delete(roomPlayers).where(eq(roomPlayers.roomId, room.id));
    await db.delete(games).where(eq(games.roomId, room.id));
    await db.delete(rooms).where(eq(rooms.id, room.id));
  }
}

async function attachRoomPlayers(roomList: any[]) {
  const db = await getDb();
  if (!db || roomList.length === 0) return roomList;
  const roomIds = roomList.map((room) => room.id);
  const memberships = await db.select().from(roomPlayers).where(inArray(roomPlayers.roomId, roomIds));
  const userIds = Array.from(new Set(memberships.map((membership) => membership.userId)));
  const userList = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const userMap = new Map(userList.map((user) => [user.id, user]));
  return roomList.map((room) => ({
    ...room,
    players: memberships
      .filter((membership) => membership.roomId === room.id)
      .sort((a, b) => (a.seatPosition ?? 0) - (b.seatPosition ?? 0))
      .map((membership) => {
        const user = userMap.get(membership.userId);
        return {
          id: membership.id,
          roomId: membership.roomId,
          userId: membership.userId,
          seatPosition: membership.seatPosition,
          name: user?.name || `Jogador ${membership.userId}`,
          email: user?.email,
          isOnline: user?.isOnline ?? false,
          isPlaying: user?.isPlaying ?? false,
          loginMethod: user?.loginMethod ?? null,
        };
      }),
  }));
}

const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado: apenas administradores podem acessar" });
  }
  return next({ ctx });
});

export const adminRouter = router({
  getStats: adminProcedure.query(async () => {
    await cleanupExpiredPrivateRoomsDb();
    const db = await getDb();
    if (!db) return getAdminStatsLocal();
    const userCount = await db.select().from(users);
    const gameCount = await db.select().from(games);
    const roomCount = await db.select().from(rooms);
    const infractionCount = await db.select().from(chatInfractions);
    return {
      totalUsers: userCount.filter((u) => (u.loginMethod ?? "") !== "bot").length,
      totalBotPlayers: userCount.filter((u) => ["bot-padrao-1", "bot-padrao-2", "bot-padrao-3"].includes(u.openId)).length,
      totalGames: gameCount.length,
      playingGames: gameCount.filter((g) => g.status === "playing").length,
      completedGames: gameCount.filter((g) => g.status === "finished").length,
      abandonedGames: gameCount.filter((g) => g.status === "abandoned").length,
      activeRooms: roomCount.filter((r) => r.status === "waiting").length,
      playingRooms: roomCount.filter((r) => r.status === "playing").length,
      privateRooms: roomCount.filter((r) => r.isPrivate && r.status !== "closed").length,
      publicRooms: roomCount.filter((r) => !r.isPrivate && r.status === "waiting").length,
      totalInfractions: infractionCount.length,
      blockedUsers: userCount.filter((u) => (u.loginMethod ?? "") !== "bot" && u.blockedUntil && new Date() < u.blockedUntil).length,
    };
  }),

  listUsers: adminProcedure.input(z.object({ limit: z.number().default(50), offset: z.number().default(0) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return getAllLocalUsers().slice(input.offset, input.offset + input.limit);
    }
    return db.select().from(users).orderBy(desc(users.createdAt)).limit(input.limit).offset(input.offset);
  }),

  listGames: adminProcedure.input(z.object({ limit: z.number().default(50), offset: z.number().default(0) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return listGamesLocalAll().slice(input.offset, input.offset + input.limit);
    return db.select().from(games).orderBy(desc(games.createdAt)).limit(input.limit).offset(input.offset);
  }),

  listRooms: adminProcedure.input(z.object({ limit: z.number().default(50), offset: z.number().default(0) })).query(async ({ input }) => {
    await cleanupExpiredPrivateRoomsDb();
    const db = await getDb();
    if (!db) return listRoomsLocalAll().slice(input.offset, input.offset + input.limit);
    const roomList = await db.select().from(rooms).orderBy(desc(rooms.createdAt)).limit(input.limit).offset(input.offset);
    return attachRoomPlayers(roomList);
  }),

  listInfractions: adminProcedure.input(z.object({ limit: z.number().default(50), offset: z.number().default(0) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return listInfractionsLocal().slice(input.offset, input.offset + input.limit).map((inf) => ({
        ...inf,
        userName: getLocalUserById(inf.userId)?.name || "Desconhecido",
      }));
    }

    const infractionList = await db.select().from(chatInfractions).orderBy(desc(chatInfractions.blockedAt)).limit(input.limit).offset(input.offset);
    const userIds = infractionList.map((i) => i.userId);
    const userList = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    const userMap = new Map(userList.map((u) => [u.id, u]));
    return infractionList.map((inf) => ({ ...inf, userName: userMap.get(inf.userId)?.name || "Desconhecido" }));
  }),

  getTopRanking: adminProcedure.query(async () => getRankingLocal(10, 0)),

  listBots: adminProcedure.query(async () => getStandardBotsLocal()),

  blockUser: adminProcedure
    .input(z.object({ userId: z.number(), durationMinutes: z.number().min(1).max(60 * 24 * 365).default(60), reason: z.string().max(255).default("Bloqueio administrativo") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const user = blockLocalUserByAdmin(input.userId, input.durationMinutes, input.reason);
        return { success: true, user };
      }
      const until = new Date(Date.now() + input.durationMinutes * 60 * 1000);
      await db.update(users).set({ blockedUntil: until, blockReason: input.reason, isOnline: false, isPlaying: false }).where(eq(users.id, input.userId));
      return { success: true, blockedUntil: until };
    }),

  resetUserPassword: adminProcedure.input(z.number()).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      return { success: true, ...(resetLocalUserPasswordByAdmin(input)) };
    }
    return { success: false, message: "Redefinição de senha no banco externo ainda precisa de provedor de hash configurado." };
  }),

  unblockUser: adminProcedure.input(z.number()).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      const user = unblockLocalUserByAdmin(input);
      return { success: true, user };
    }
    await db.update(users).set({ blockedUntil: null, blockReason: null }).where(eq(users.id, input));
    return { success: true };
  }),
  promoteToAdmin: adminProcedure.input(z.number()).mutation(async () => ({ success: true, message: "Promoção manual disponível apenas com banco de dados configurado." })),
  demoteToUser: adminProcedure.input(z.number()).mutation(async () => ({ success: true, message: "Rebaixamento manual disponível apenas com banco de dados configurado." })),
});
