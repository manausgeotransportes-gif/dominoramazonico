import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { playerStats, users } from "../drizzle/schema";
import { eq, desc, gt, inArray } from "drizzle-orm";
import { getPlayerRankingLocal, getPlayerStatsLocal, getRankingLocal, getTopPlayersLocal } from "./localStore";

export const rankingRouter = router({
  getGlobalRanking: publicProcedure
    .input(z.object({ limit: z.number().default(100), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return getRankingLocal(input.limit, input.offset);

      const stats = await db.select().from(playerStats).orderBy(desc(playerStats.totalPoints), desc(playerStats.totalWins), desc(playerStats.level)).limit(input.limit).offset(input.offset);
      const userIds = stats.map((s) => s.userId);
      const userList = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
      const userMap = new Map(userList.map((u) => [u.id, u]));
      return stats
        .filter((stat) => (userMap.get(stat.userId)?.loginMethod ?? "") !== "bot")
        .map((stat, index) => ({
        rank: input.offset + index + 1,
        userId: stat.userId,
        userName: userMap.get(stat.userId)?.name || "Desconhecido",
        totalGames: stat.totalGames,
        totalWins: stat.totalWins,
        winRate: parseFloat(stat.winRate.toString()),
        level: stat.level,
        totalPoints: stat.totalPoints,
      }));
    }),

  getPlayerRanking: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return getPlayerRankingLocal(ctx.user.id);

    const stats = await db.select().from(playerStats).where(eq(playerStats.userId, ctx.user.id)).limit(1);
    if (stats.length === 0) {
      return { rank: null, totalGames: 0, totalWins: 0, winRate: 0, level: 1, totalPoints: 0 };
    }
    const stat = stats[0];
    const betterPlayers = await db.select().from(playerStats).where(gt(playerStats.totalPoints, stat.totalPoints));
    return {
      rank: betterPlayers.length + 1,
      totalGames: stat.totalGames,
      totalWins: stat.totalWins,
      winRate: parseFloat(stat.winRate.toString()),
      level: stat.level,
      totalPoints: stat.totalPoints,
    };
  }),

  getPlayerStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return getPlayerStatsLocal(ctx.user.id);

    const stats = await db.select().from(playerStats).where(eq(playerStats.userId, ctx.user.id)).limit(1);
    if (stats.length === 0) {
      return { totalGames: 0, totalWins: 0, winRate: 0, level: 1, totalPoints: 0, nextLevelProgress: 0 };
    }
    const stat = stats[0];
    const currentExperience = stat.totalGames + stat.totalWins * 2;
    const currentLevelBase = (stat.level - 1) * 10;
    const nextLevelProgress = Math.min(100, Math.max(0, Math.floor(((currentExperience - currentLevelBase) / 10) * 100)));
    return {
      totalGames: stat.totalGames,
      totalWins: stat.totalWins,
      winRate: parseFloat(stat.winRate.toString()),
      level: stat.level,
      totalPoints: stat.totalPoints,
      nextLevelProgress,
    };
  }),

  getTopPlayers: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return getTopPlayersLocal();

    const stats = await db.select().from(playerStats).orderBy(desc(playerStats.totalPoints), desc(playerStats.totalWins), desc(playerStats.level)).limit(10);
    const userIds = stats.map((s) => s.userId);
    const userList = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    const userMap = new Map(userList.map((u) => [u.id, u]));
    return stats
      .filter((stat) => (userMap.get(stat.userId)?.loginMethod ?? "") !== "bot")
      .map((stat, index) => ({
      rank: index + 1,
      userId: stat.userId,
      userName: userMap.get(stat.userId)?.name || "Desconhecido",
      level: stat.level,
      totalWins: stat.totalWins,
      winRate: parseFloat(stat.winRate.toString()),
    }));
  }),
});
