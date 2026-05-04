import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as gameService from "./gameService";
import { TRPCError } from "@trpc/server";

export const gamesRouter = router({
  createGame: protectedProcedure
    .input(
      z.object({
        roomId: z.number(),
        playerIds: z.array(z.number()).length(4),
        isBotPlayer: z.array(z.boolean()).length(4).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const gameState = await gameService.createGame(input.roomId, input.playerIds, input.isBotPlayer);
      if (!gameState) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Erro ao criar partida" });
      }
      return gameState;
    }),

  startRoomGame: protectedProcedure
    .input(z.object({ roomId: z.number(), fillBots: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const gameState = await gameService.createOrStartRoomGame(input.roomId, input.fillBots);
      if (!gameState) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível iniciar a partida" });
      }
      return gameState;
    }),

  startGame: protectedProcedure.input(z.number()).mutation(async ({ input: gameId }) => {
    const gameState = await gameService.getGameState(gameId);
    if (!gameState) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Partida não encontrada" });
    }
    return gameService.startGame(gameState);
  }),

  getGameState: publicProcedure.input(z.number()).query(async ({ input: gameId }) => {
    const gameState = await gameService.getGameState(gameId);
    if (!gameState) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Partida não encontrada" });
    }
    return gameState;
  }),

  playMove: protectedProcedure
    .input(
      z.object({
        gameId: z.number(),
        playerIndex: z.number(),
        domino: z.object({ left: z.number(), right: z.number() }),
        side: z.enum(["left", "right", "up", "down"]),
        action: z.enum(["normal", "galo"]).default("normal"),
        announcedPoints: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const gameState = await gameService.getGameState(input.gameId);
      if (!gameState) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Partida não encontrada" });
      }

      const result = await gameService.playMove(
        gameState,
        input.playerIndex,
        input.domino,
        input.side,
        input.announcedPoints,
        input.action
      );

      if (!result.isValid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Jogada inválida" });
      }
      return result.gameState;
    }),

  passMove: protectedProcedure
    .input(z.object({ gameId: z.number(), playerIndex: z.number() }))
    .mutation(async ({ input }) => {
      const gameState = await gameService.getGameState(input.gameId);
      if (!gameState) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Partida não encontrada" });
      }
      const result = await gameService.passMove(gameState, input.playerIndex);
      if (!result.isValid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Passada inválida" });
      }
      return result.gameState;
    }),

  finishRoomMatch: protectedProcedure
    .input(z.object({ roomId: z.number(), winnerPlayerIndex: z.number().min(0).max(3) }))
    .mutation(async ({ input }) => {
      const result = await gameService.finishRoomMatch(input.roomId, input.winnerPlayerIndex);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível registrar o fim da partida" });
      }
      return result;
    }),
});
