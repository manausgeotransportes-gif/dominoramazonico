import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getGameState, passMove, playMove, announceGalo } from "./gameService";
import { getDb } from "./db";
import { gamePlayers, games } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const scoreRouter = router({
  getScore: protectedProcedure.input(z.number()).query(async ({ input: roomId, ctx }) => {
    // Busca o score do jogador logado na sala
    const db = await getDb();
    if (!db || !ctx.user) return { points: 0 };
    
    // Primeiro encontra o game baseado no roomId
    const gameResult = await db.select().from(games).where(eq(games.roomId, roomId)).limit(1);
    if (gameResult.length === 0) return { points: 0 };
    
    const gamePlayer = await db.select().from(gamePlayers).where(
      and(eq(gamePlayers.gameId, gameResult[0].id), eq(gamePlayers.userId, ctx.user.id))
    ).limit(1);
    
    return { points: gamePlayer.length > 0 ? gamePlayer[0].score : 0 };
  }),
  updateScore: protectedProcedure.input(z.object({ roomId: z.number(), points: z.number() })).mutation(async ({ input, ctx }) => {
    // Atualiza o score do jogador logado na sala
    const db = await getDb();
    if (!db || !ctx.user) return { success: false };
    
    // Primeiro encontra o game baseado no roomId
    const gameResult = await db.select().from(games).where(eq(games.roomId, input.roomId)).limit(1);
    if (gameResult.length === 0) return { success: false };
    
    await db.update(gamePlayers).set({ score: input.points }).where(
      and(eq(gamePlayers.gameId, gameResult[0].id), eq(gamePlayers.userId, ctx.user.id))
    );
    return { success: true };
  }),
  sendAction: protectedProcedure.input(z.object({ roomId: z.number(), action: z.enum(["galo", "passei"]) })).mutation(async ({ input, ctx }) => {
    // Busca o gameId pela roomId
    const db = await getDb();
    if (!db) return { success: true };
    if (!ctx.user) return { success: false };
    const result = await db.select().from(games).where(eq(games.roomId, input.roomId)).limit(1);
    if (result.length === 0) return { success: false };
    const game = result[0];
    const gameState = await getGameState(game.id);
    if (!gameState) return { success: false };
    const playerIndex = gameState.playerIds.findIndex((id) => id === ctx.user.id);
    if (playerIndex === -1) return { success: false };
    if (input.action === "passei") {
      const result = await passMove(gameState, playerIndex);
      return { success: result.isValid };
    }
    if (input.action === "galo") {
      // Apenas marca que o jogador quer anunciar GALO
      // A validação acontece quando ele joga a pedra
      const result = await announceGalo(gameState, playerIndex);
      return { success: result.isValid };
    }
    return { success: false };
  }),
});
