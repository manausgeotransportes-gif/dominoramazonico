import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { games, gamePlayers, rooms, roomPlayers, users } from "../drizzle/schema";
import { desc, eq, and, lt } from "drizzle-orm";
import {
  cleanupExpiredPrivateRoomsLocal,
  createRoomLocal,
  getRoomByIdLocal,
  getRoomPlayersLocal,
  joinRoomLocal,
  leaveWaitingRoomsForUserLocal,
  leaveRoomLocal,
  listOpenRoomsLocal,
  persistLocalStoreNow,
  searchPrivateRoomsLocal,
} from "./localStore";

const joinRoomInput = z.union([
  z.number(),
  z.object({
    roomId: z.number(),
    position: z.number().min(1).max(4).optional().nullable(),
  }),
]);

function normalizeJoinInput(input: z.infer<typeof joinRoomInput>) {
  return typeof input === "number" ? { roomId: input, position: null } : input;
}

function getFirstOpenPosition(players: Array<{ seatPosition?: number | null }>, maxPlayers: number) {
  const occupied = new Set(players.map((player) => player.seatPosition).filter((position): position is number => typeof position === "number"));
  for (let position = 1; position <= maxPlayers; position += 1) {
    if (!occupied.has(position)) return position;
  }
  return null;
}

async function cleanupDbWaitingRoomsForUser(userId: number, exceptRoomId?: number) {
  const drizzle = await db.getDb();
  if (!drizzle) return;

  const memberships = await drizzle.select().from(roomPlayers).where(eq(roomPlayers.userId, userId));
  for (const membership of memberships) {
    if (membership.roomId === exceptRoomId) continue;

    const room = await db.getRoomById(membership.roomId);
    if (!room || room.status !== "waiting") continue;

    await drizzle.delete(roomPlayers).where(and(eq(roomPlayers.roomId, membership.roomId), eq(roomPlayers.userId, userId)));
    const remainingPlayers = await drizzle.select().from(roomPlayers).where(eq(roomPlayers.roomId, membership.roomId));
    const nextCount = remainingPlayers.length;
    await drizzle
      .update(rooms)
      .set({
        currentPlayers: nextCount,
        status: nextCount === 0 && room.isPrivate ? "closed" : room.status,
      })
      .where(eq(rooms.id, membership.roomId));
  }
}

export async function cleanupWaitingRoomsForUser(userId: number, exceptRoomId?: number) {
  const drizzle = await db.getDb();
  if (!drizzle) {
    leaveWaitingRoomsForUserLocal(userId, exceptRoomId);
    return;
  }
  await cleanupDbWaitingRoomsForUser(userId, exceptRoomId);
}

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

let autoRoomCursor = 0;

function nextAutoRoomName() {
  const name = AUTO_ROOM_NAMES[autoRoomCursor % AUTO_ROOM_NAMES.length];
  autoRoomCursor += 1;
  return name;
}

async function ensureDbAutoRoomsAvailable(minAvailable = 4) {
  const drizzle = await db.getDb();
  if (!drizzle) return;

  await drizzle.update(rooms).set({ allowBot: false }).where(eq(rooms.isPrivate, false));

  const openRooms = await db.listOpenRooms(100);
  const publicWaitingRooms = openRooms.filter((room) => !room.isPrivate && room.status === "waiting" && room.currentPlayers < room.maxPlayers);
  const missing = Math.max(0, minAvailable - publicWaitingRooms.length);

  for (let index = 0; index < missing; index += 1) {
    await drizzle.insert(rooms).values({
      name: nextAutoRoomName(),
      isPrivate: false,
      createdBy: 1,
      maxPlayers: 4,
      currentPlayers: 0,
      status: "waiting",
      allowBot: false,
    });
  }
}

async function cleanupExpiredPrivateRoomsDb() {
  const drizzle = await db.getDb();
  if (!drizzle) {
    cleanupExpiredPrivateRoomsLocal();
    return;
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expired = await drizzle.select().from(rooms).where(and(eq(rooms.isPrivate, true), lt(rooms.createdAt, cutoff)));
  for (const room of expired) {
    await drizzle.delete(roomPlayers).where(eq(roomPlayers.roomId, room.id));
    await drizzle.delete(games).where(eq(games.roomId, room.id));
    await drizzle.delete(rooms).where(eq(rooms.id, room.id));
  }
}

async function createDbBotUser(index: number) {
  const drizzle = await db.getDb();
  if (!drizzle) throw new Error("Banco indisponível");
  const slot = ((index - 1) % 3) + 1;
  const openId = `bot-padrao-${slot}`;
  const name = ["Bot Norte", "Bot Centro", "Bot Sul"][slot - 1] ?? `Bot Padrão ${slot}`;
  const existing = await drizzle.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (existing[0]) {
    await drizzle.update(users).set({ name, loginMethod: "bot", isOnline: true, isPlaying: true }).where(eq(users.id, existing[0].id));
    return { ...existing[0], name, loginMethod: "bot", isOnline: true, isPlaying: true };
  }

  await drizzle.insert(users).values({
    openId,
    name,
    email: `bot-padrao-${slot}@domino.local`,
    loginMethod: "bot",
    role: "user",
    isOnline: true,
    isPlaying: true,
  });

  const created = await drizzle.select().from(users).where(eq(users.openId, openId)).limit(1);
  const bot = created[0];
  if (!bot) throw new Error("Não foi possível criar bot");
  return bot;
}

export const roomsRouter = router({
  createRoom: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        isPrivate: z.boolean().default(false),
        allowBot: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!input.isPrivate) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Salas públicas são abertas automaticamente pelo sistema" });
        }

        const drizzle = await db.getDb();
        if (!drizzle) {
          const room = createRoomLocal({
            name: input.name,
            isPrivate: input.isPrivate,
            allowBot: input.allowBot,
            createdBy: ctx.user.id,
          });
          await persistLocalStoreNow();
          return { roomId: room.id, message: "Sala criada com sucesso" };
        }

        await cleanupDbWaitingRoomsForUser(ctx.user.id);

        await drizzle.insert(rooms).values({
          name: input.name,
          isPrivate: input.isPrivate,
          createdBy: ctx.user.id,
          maxPlayers: 4,
          currentPlayers: 1,
          status: "waiting",
          allowBot: input.isPrivate ? input.allowBot : false,
        });

        const newRooms = await drizzle
          .select()
          .from(rooms)
          .where(eq(rooms.createdBy, ctx.user.id))
          .orderBy(desc(rooms.id))
          .limit(1);

        const roomId = newRooms[0]?.id;
        if (!roomId) throw new Error("Erro ao criar sala");

        await drizzle.insert(roomPlayers).values({ roomId, userId: ctx.user.id, seatPosition: 1 });
        return { roomId, message: "Sala criada com sucesso" };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Erro ao criar sala:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar sala" });
      }
    }),

  listOpenRooms: publicProcedure
    .input(z.object({ limit: z.number().default(20), onlyPublic: z.boolean().default(true) }))
    .query(async ({ input }) => {
      try {
        await cleanupExpiredPrivateRoomsDb();
        const drizzle = await db.getDb();
        if (!drizzle) {
          const openRooms = listOpenRoomsLocal(input.limit);
            return input.onlyPublic ? openRooms.filter((room) => !room.isPrivate) : openRooms;
        }
        await ensureDbAutoRoomsAvailable(4);
        const openRooms = (await db.listOpenRooms(input.limit * 2)).filter((room) => room.currentPlayers < room.maxPlayers);
        const filtered = input.onlyPublic ? openRooms.filter((room) => !room.isPrivate) : openRooms;
        return filtered.slice(0, input.limit);
      } catch (error) {
        console.error("Erro ao listar salas:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao listar salas" });
      }
    }),

  getRoomById: publicProcedure.input(z.number()).query(async ({ input }) => {
    try {
      const drizzle = await db.getDb();
      if (!drizzle) {
        const room = getRoomByIdLocal(input);
        if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Sala não encontrada" });
        return room;
      }
      const room = await db.getRoomById(input);
      if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Sala não encontrada" });
      return room;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error("Erro ao buscar sala:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao buscar sala" });
    }
  }),

  joinRoom: protectedProcedure.input(joinRoomInput).mutation(async ({ ctx, input }) => {
    try {
      const { roomId, position } = normalizeJoinInput(input);
      if (!position) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma posição para entrar na sala" });
      }
      const drizzle = await db.getDb();
      if (!drizzle) {
        const room = joinRoomLocal(roomId, ctx.user.id, position);
        return { message: "Aguardando na sala", roomId: room.id, position };
      }

      const room = await db.getRoomById(roomId);
      if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Sala não encontrada" });
      if (room.currentPlayers >= room.maxPlayers) throw new TRPCError({ code: "BAD_REQUEST", message: "Sala está cheia" });

      await cleanupDbWaitingRoomsForUser(ctx.user.id, roomId);

      const existing = await drizzle
        .select()
        .from(roomPlayers)
        .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, ctx.user.id)))
        .limit(1);

      if (existing.length > 0) {
        return { message: "Você já está nesta sala", roomId, position: existing[0].seatPosition };
      }

      const currentPlayers = await drizzle.select().from(roomPlayers).where(eq(roomPlayers.roomId, roomId));
      const desiredPosition = position ?? getFirstOpenPosition(currentPlayers, room.maxPlayers);
      if (!desiredPosition) throw new TRPCError({ code: "BAD_REQUEST", message: "Sala está cheia" });
      if (currentPlayers.some((player) => player.seatPosition === desiredPosition)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta posição já está ocupada" });
      }

      await drizzle.insert(roomPlayers).values({ roomId, userId: ctx.user.id, seatPosition: desiredPosition });
      const nextCount = room.currentPlayers + 1;
      await drizzle
        .update(rooms)
        .set({ currentPlayers: nextCount, status: nextCount >= room.maxPlayers ? "playing" : room.status })
        .where(eq(rooms.id, roomId));
      await ensureDbAutoRoomsAvailable(4);
      return { message: "Aguardando na sala", roomId, position: desiredPosition };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error("Erro ao entrar na sala:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Erro ao entrar na sala" });
    }
  }),

  leaveRoom: protectedProcedure.input(z.number()).mutation(async ({ ctx, input: roomId }) => {
    try {
      const drizzle = await db.getDb();
      if (!drizzle) {
        leaveRoomLocal(roomId, ctx.user.id);
        return { message: "Saiu da sala com sucesso" };
      }

      const room = await db.getRoomById(roomId);
      if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Sala não encontrada" });

      if (room.status === "playing") {
        const existing = await drizzle
          .select()
          .from(roomPlayers)
          .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, ctx.user.id)))
          .limit(1);

        if (existing.length > 0) {
          const activeGame = await drizzle.select().from(games).where(eq(games.roomId, roomId)).orderBy(desc(games.id)).limit(1);
          const game = activeGame[0];
          const bot = await createDbBotUser(existing[0].id);

          await drizzle.update(users).set({ isPlaying: false, isOnline: false }).where(eq(users.id, ctx.user.id));
          await drizzle.update(roomPlayers).set({ userId: bot.id }).where(eq(roomPlayers.id, existing[0].id));

          if (game) {
            await drizzle
              .update(gamePlayers)
              .set({ userId: bot.id, isBot: true })
              .where(and(eq(gamePlayers.gameId, game.id), eq(gamePlayers.userId, ctx.user.id)));
          }
        }

        await ensureDbAutoRoomsAvailable(4);
        return { message: "Jogador substituído por bot" };
      }

      await drizzle.delete(roomPlayers).where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.userId, ctx.user.id)));
      const newCount = Math.max(0, room.currentPlayers - 1);
      await drizzle.update(rooms).set({ currentPlayers: newCount }).where(eq(rooms.id, roomId));
      if (newCount === 0) await db.updateRoomStatus(roomId, "closed");
      return { message: "Saiu da sala com sucesso" };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error("Erro ao sair da sala:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao sair da sala" });
    }
  }),

  searchPrivateRooms: publicProcedure.input(z.string()).query(async ({ input }) => {
    try {
      await cleanupExpiredPrivateRoomsDb();
      const drizzle = await db.getDb();
      if (!drizzle) return searchPrivateRoomsLocal(input);

      const results = await drizzle
        .select()
        .from(rooms)
        .where(and(eq(rooms.isPrivate, true), eq(rooms.status, "waiting")))
        .limit(20);
      return results.filter((room) => room.name.toLowerCase().includes(input.toLowerCase()));
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error("Erro ao buscar salas privadas:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao buscar salas" });
    }
  }),

  quickMatch: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const drizzle = await db.getDb();
      if (!drizzle) {
        const candidate = listOpenRoomsLocal(100).find((room) => !room.isPrivate && room.currentPlayers < room.maxPlayers);
        if (candidate) {
          const room = joinRoomLocal(candidate.id, ctx.user.id);
          await persistLocalStoreNow();
          return { roomId: room.id, action: "joined" as const };
        }
        const created = createRoomLocal({
          name: `Partida rápida ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
          isPrivate: false,
          allowBot: false,
          createdBy: ctx.user.id,
        });
        await persistLocalStoreNow();
        return { roomId: created.id, action: "created" as const };
      }

      const openRooms = (await db.listOpenRooms(50)).filter((room) => room.currentPlayers < room.maxPlayers);
      const candidate = openRooms.find((room) => !room.isPrivate && room.currentPlayers < room.maxPlayers);
      if (candidate) {
        await cleanupDbWaitingRoomsForUser(ctx.user.id, candidate.id);

        const existing = await drizzle
          .select()
          .from(roomPlayers)
          .where(and(eq(roomPlayers.roomId, candidate.id), eq(roomPlayers.userId, ctx.user.id)))
          .limit(1);

        if (existing.length === 0) {
          const currentPlayers = await drizzle.select().from(roomPlayers).where(eq(roomPlayers.roomId, candidate.id));
          const desiredPosition = getFirstOpenPosition(currentPlayers, candidate.maxPlayers);
          if (!desiredPosition) throw new TRPCError({ code: "BAD_REQUEST", message: "Sala está cheia" });

          await drizzle.insert(roomPlayers).values({ roomId: candidate.id, userId: ctx.user.id, seatPosition: desiredPosition });
          const nextCount = candidate.currentPlayers + 1;
          await drizzle
            .update(rooms)
            .set({ currentPlayers: nextCount, status: nextCount >= candidate.maxPlayers ? "playing" : candidate.status })
            .where(eq(rooms.id, candidate.id));
        }
        await ensureDbAutoRoomsAvailable(4);
        return { roomId: candidate.id, action: "joined" as const };
      }

      await drizzle.insert(rooms).values({
        name: `Partida rápida ${new Date().toISOString().slice(11, 16)}`,
        isPrivate: false,
        createdBy: ctx.user.id,
        maxPlayers: 4,
        currentPlayers: 1,
        status: "waiting",
        allowBot: false,
      });
      const newRooms = await drizzle.select().from(rooms).where(eq(rooms.createdBy, ctx.user.id)).orderBy(desc(rooms.id)).limit(1);
      const roomId = newRooms[0]?.id;
      if (!roomId) throw new Error("Erro ao criar sala de matchmaking");
      await drizzle.insert(roomPlayers).values({ roomId, userId: ctx.user.id, seatPosition: 1 });
      await ensureDbAutoRoomsAvailable(4);
      return { roomId, action: "created" as const };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error("Erro no matchmaking:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Erro no matchmaking" });
    }
  }),

  getRoomPlayers: publicProcedure.input(z.number()).query(async ({ input: roomId }) => {
    try {
      const drizzle = await db.getDb();
      if (!drizzle) return getRoomPlayersLocal(roomId);

      const players = await drizzle.select().from(roomPlayers).where(eq(roomPlayers.roomId, roomId));
      return players;
    } catch (error) {
      console.error("Erro ao obter jogadores da sala:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao obter jogadores" });
    }
  }),
});
