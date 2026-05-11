import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { addLocalUserForTest, getGameByRoomLocal, getRoomByIdLocal, getRoomPlayersLocal } from "./localStore";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): { ctx: TrpcContext; clearedCookies: any[] } {
  const clearedCookies: any[] = [];

  const user: AuthenticatedUser = {
    id: userId,
    openId: `sample-user-${userId}`,
    email: `sample${userId}@example.com`,
    name: `Sample User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function addRoomTestUser(id: number, prefix = "room-test") {
  const now = new Date();
  addLocalUserForTest({
    id,
    openId: `${prefix}-${id}`,
    email: `${prefix}-${id}@example.com`,
    name: `Jogador ${id}`,
    loginMethod: "test",
    passwordHash: null,
    role: "user",
    isOnline: true,
    isPlaying: false,
    blockedUntil: null,
    blockReason: null,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  });
}

describe("roomsRouter", () => {
  it("mantém o jogador em apenas uma sala aguardando por vez", async () => {
    const baseId = 20_000 + Math.floor(Math.random() * 10_000);
    const now = new Date();
    addLocalUserForTest({
      id: baseId,
      openId: `room-owner-${baseId}`,
      email: `owner-${baseId}@example.com`,
      name: `Owner ${baseId}`,
      loginMethod: "test",
      passwordHash: null,
      role: "user",
      isOnline: true,
      isPlaying: false,
      blockedUntil: null,
      blockReason: null,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    });
    addLocalUserForTest({
      id: baseId + 1,
      openId: `room-player-${baseId}`,
      email: `player-${baseId}@example.com`,
      name: `Player ${baseId}`,
      loginMethod: "test",
      passwordHash: null,
      role: "user",
      isOnline: true,
      isPlaying: false,
      blockedUntil: null,
      blockReason: null,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    });

    const owner = appRouter.createCaller(createAuthContext(baseId).ctx);
    const player = appRouter.createCaller(createAuthContext(baseId + 1).ctx);

    const firstRoom = await owner.rooms.createRoom({ name: `Sala teste ${baseId} A`, isPrivate: true, allowBot: false });
    await player.rooms.joinRoom({ roomId: firstRoom.roomId, position: 2 });
    expect(getRoomPlayersLocal(firstRoom.roomId).some((item) => item.userId === baseId + 1)).toBe(true);

    const secondRoom = await player.rooms.createRoom({ name: `Sala teste ${baseId} B`, isPrivate: true, allowBot: false });

    expect(getRoomPlayersLocal(firstRoom.roomId).some((item) => item.userId === baseId + 1)).toBe(false);
    expect(getRoomPlayersLocal(secondRoom.roomId).filter((item) => item.userId === baseId + 1)).toHaveLength(1);
  });

  it("remove o jogador das salas aguardando ao fazer logout", async () => {
    const baseId = 40_000 + Math.floor(Math.random() * 10_000);
    const now = new Date();
    addLocalUserForTest({
      id: baseId,
      openId: `logout-owner-${baseId}`,
      email: `logout-owner-${baseId}@example.com`,
      name: `Logout Owner ${baseId}`,
      loginMethod: "test",
      passwordHash: null,
      role: "user",
      isOnline: true,
      isPlaying: false,
      blockedUntil: null,
      blockReason: null,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    });

    const caller = appRouter.createCaller(createAuthContext(baseId).ctx);
    const room = await caller.rooms.createRoom({ name: `Sala logout ${baseId}`, isPrivate: true, allowBot: false });
    expect(getRoomPlayersLocal(room.roomId).some((item) => item.userId === baseId)).toBe(true);

    await caller.auth.logout();

    expect(getRoomPlayersLocal(room.roomId).some((item) => item.userId === baseId)).toBe(false);
  });

  it("exige selecionar uma posição para entrar na sala", async () => {
    const baseId = 60_000 + Math.floor(Math.random() * 10_000);
    const now = new Date();
    addLocalUserForTest({
      id: baseId,
      openId: `position-owner-${baseId}`,
      email: `position-owner-${baseId}@example.com`,
      name: `Position Owner ${baseId}`,
      loginMethod: "test",
      passwordHash: null,
      role: "user",
      isOnline: true,
      isPlaying: false,
      blockedUntil: null,
      blockReason: null,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    });
    addLocalUserForTest({
      id: baseId + 1,
      openId: `position-player-${baseId}`,
      email: `position-player-${baseId}@example.com`,
      name: `Position Player ${baseId}`,
      loginMethod: "test",
      passwordHash: null,
      role: "user",
      isOnline: true,
      isPlaying: false,
      blockedUntil: null,
      blockReason: null,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    });

    const owner = appRouter.createCaller(createAuthContext(baseId).ctx);
    const player = appRouter.createCaller(createAuthContext(baseId + 1).ctx);
    const room = await owner.rooms.createRoom({ name: `Sala posição ${baseId}`, isPrivate: true, allowBot: false });

    await expect(player.rooms.joinRoom({ roomId: room.roomId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Selecione uma posição para entrar na sala",
    });
  });

  it("permite trocar de posição na mesma sala sem duplicar o jogador", async () => {
    const baseId = 80_000 + Math.floor(Math.random() * 10_000);
    addRoomTestUser(baseId, "move-owner");

    const caller = appRouter.createCaller(createAuthContext(baseId).ctx);
    const room = await caller.rooms.createRoom({ name: `Sala troca ${baseId}`, isPrivate: true, allowBot: false });

    await caller.rooms.joinRoom({ roomId: room.roomId, position: 3 });

    const players = getRoomPlayersLocal(room.roomId).filter((item) => item.userId === baseId);
    expect(players).toHaveLength(1);
    expect(players[0].seatPosition).toBe(3);
  });

  it("desmarca a posição ao clicar novamente na própria posição", async () => {
    const baseId = 90_000 + Math.floor(Math.random() * 10_000);
    addRoomTestUser(baseId, "toggle-owner");

    const caller = appRouter.createCaller(createAuthContext(baseId).ctx);
    const room = await caller.rooms.createRoom({ name: `Sala toggle ${baseId}`, isPrivate: true, allowBot: false });

    const result = await caller.rooms.joinRoom({ roomId: room.roomId, position: 1 });

    expect((result as any).action).toBe("left");
    expect(getRoomPlayersLocal(room.roomId).some((item) => item.userId === baseId)).toBe(false);
  });

  it("mostra para outros jogadores a posição ocupada quase em tempo real", async () => {
    const baseId = 95_000 + Math.floor(Math.random() * 10_000);
    addRoomTestUser(baseId, "visibility-owner");
    addRoomTestUser(baseId + 1, "visibility-player");

    const owner = appRouter.createCaller(createAuthContext(baseId).ctx);
    const player = appRouter.createCaller(createAuthContext(baseId + 1).ctx);
    const room = await owner.rooms.createRoom({ name: `Sala visão ${baseId}`, isPrivate: true, allowBot: false });

    await player.rooms.joinRoom({ roomId: room.roomId, position: 2 });
    const players = await owner.rooms.getRoomPlayers(room.roomId);

    expect(players.some((item: any) => item.userId === baseId + 1 && item.seatPosition === 2)).toBe(true);
  });

  it("move o jogador para outra sala e libera a sala anterior automaticamente", async () => {
    const baseId = 100_000 + Math.floor(Math.random() * 10_000);
    addRoomTestUser(baseId, "switch-owner");
    addRoomTestUser(baseId + 1, "switch-player");
    addRoomTestUser(baseId + 2, "switch-owner-b");

    const owner = appRouter.createCaller(createAuthContext(baseId).ctx);
    const ownerB = appRouter.createCaller(createAuthContext(baseId + 2).ctx);
    const player = appRouter.createCaller(createAuthContext(baseId + 1).ctx);
    const firstRoom = await owner.rooms.createRoom({ name: `Sala origem ${baseId}`, isPrivate: true, allowBot: false });
    const secondRoom = await ownerB.rooms.createRoom({ name: `Sala destino ${baseId}`, isPrivate: true, allowBot: false });

    await player.rooms.joinRoom({ roomId: firstRoom.roomId, position: 2 });
    await player.rooms.joinRoom({ roomId: secondRoom.roomId, position: 3 });

    expect(getRoomPlayersLocal(firstRoom.roomId).some((item) => item.userId === baseId + 1)).toBe(false);
    const secondRoomPlayers = getRoomPlayersLocal(secondRoom.roomId).filter((item) => item.userId === baseId + 1);
    expect(secondRoomPlayers).toHaveLength(1);
    expect(secondRoomPlayers[0].seatPosition).toBe(3);
  });

  it("inicia a partida quando quatro jogadores entram na mesma sala", async () => {
    const baseId = 120_000 + Math.floor(Math.random() * 10_000);
    for (let index = 0; index < 4; index += 1) addRoomTestUser(baseId + index, "full-room");

    const owner = appRouter.createCaller(createAuthContext(baseId).ctx);
    const room = await owner.rooms.createRoom({ name: `Sala completa ${baseId}`, isPrivate: true, allowBot: false });

    for (let index = 1; index < 4; index += 1) {
      const player = appRouter.createCaller(createAuthContext(baseId + index).ctx);
      await player.rooms.joinRoom({ roomId: room.roomId, position: index + 1 });
    }

    expect(getRoomByIdLocal(room.roomId)?.status).toBe("playing");
    expect(getGameByRoomLocal(room.roomId)).not.toBeNull();
  });

  it("cria e inicia sala privada com bots", async () => {
    const baseId = 130_000 + Math.floor(Math.random() * 10_000);
    addRoomTestUser(baseId, "bot-room-owner");

    const caller = appRouter.createCaller(createAuthContext(baseId).ctx);
    const room = await caller.rooms.createRoom({ name: `Sala bot ${baseId}`, isPrivate: true, allowBot: true });
    const game = await caller.games.startRoomGame({ roomId: room.roomId, fillBots: true });

    expect(game.roomId).toBe(room.roomId);
    expect(game.isBotPlayer.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    expect(getRoomByIdLocal(room.roomId)?.status).toBe("playing");
  });

  describe("listOpenRooms", () => {
    it("deve retornar uma lista de salas abertas", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Não vai retornar nada porque o banco de dados está vazio
      // mas não deve lançar erro
      const result = await caller.rooms.listOpenRooms({ limit: 20, onlyPublic: true });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result.filter((room: any) => !room.isPrivate && room.status === "waiting")).toHaveLength(4);
    });

    it("deve filtrar salas privadas quando solicitado", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.rooms.listOpenRooms({ limit: 20, onlyPublic: true });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("searchPrivateRooms", () => {
    it("deve buscar salas privadas por nome", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.rooms.searchPrivateRooms("test");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getRoomById", () => {
    it("deve lançar erro quando sala não existe", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.rooms.getRoomById(99999);
        expect.fail("Deveria ter lançado erro");
      } catch (error: any) {
        expect(error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("getRoomPlayers", () => {
    it("deve retornar lista de jogadores de uma sala", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.rooms.getRoomPlayers(1);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
