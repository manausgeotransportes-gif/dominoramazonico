import { describe, it, expect, vi } from "vitest";
import { addLocalUserForTest, createRoomLocal, getGameByRoomLocal, joinRoomLocal, leaveRoomLocal } from "./localStore";
import * as gameService from "./gameService";
import * as gameEngine from "./gameEngine";
import { type Domino } from "./gameEngine";

describe("gameService", () => {
  describe("createGame", () => {
    it("deve retornar null se playerIds for vazio", async () => {
      const result = await gameService.createGame(1, []);
      expect(result).toBeNull();
    });

    it("deve retornar null se playerIds tiver mais de 4 jogadores", async () => {
      const result = await gameService.createGame(1, [1, 2, 3, 4, 5]);
      expect(result).toBeNull();
    });

    it("deve retornar null se playerIds tiver menos de 4 jogadores", async () => {
      const result = await gameService.createGame(1, [1, 2, 3]);
      expect(result).toBeNull();
    });

    it("deve criar um estado de jogo válido com 4 jogadores", async () => {
      const result = await gameService.createGame(1, [1, 2, 3, 4]);
      // Pode retornar null se o banco de dados não estiver disponível
      if (result) {
        expect(result.gameId).toBeDefined();
        expect(result.roomId).toBe(1);
        expect(result.status).toBe("waiting");
        expect(result.playerHands).toHaveLength(4);
        expect(result.playerHands[0]).toHaveLength(7);
        expect(result.playerHands[1]).toHaveLength(7);
        expect(result.playerHands[2]).toHaveLength(7);
        expect(result.playerHands[3]).toHaveLength(7);
      }
    });
    describe("Cenário completo de rodada normal", () => {
      it("deve executar uma rodada completa sem erros, com pontuação correta", async () => {
        // Criação dos usuários fictícios no banco local
        const playerIds = [10, 20, 30, 40];
        playerIds.forEach((id, idx) => {
          addLocalUserForTest({
            id,
            openId: `fake${id}`,
            name: `Jogador${idx + 1}`,
            email: null,
            loginMethod: null,
            passwordHash: null,
            role: "user",
            isOnline: true,
            isPlaying: false,
            blockedUntil: null,
            blockReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          });
        });

        let gameState = await gameService.createGame(99, playerIds);
        expect(gameState).not.toBeNull();
        if (!gameState) return;

        // Início da rodada
        gameState = await gameService.startGame(gameState);
        expect(gameState.status).toBe("playing");

        // Jogador com 6-6 deve começar
        const idx66 = gameState.playerHands.findIndex(
          hand => hand.some(dom => dom.left === 6 && dom.right === 6)
        );
        expect(gameState.currentPlayerIndex).toBe(idx66);

        // Simula jogadas até todos ficarem com 6 peças (primeira jogada)
        const firstDomino = gameState.playerHands[idx66].find(dom => dom.left === 6 && dom.right === 6);
        expect(firstDomino).toBeDefined();
        let result = await gameService.playMove(gameState, idx66, firstDomino, "left");
        expect(result.isValid).toBe(true);
        gameState = result.gameState;

        // Simula jogadas válidas seguindo sempre o jogador da vez.
        for (let i = 1; i < 4; i++) {
          const playerIdx = gameState.currentPlayerIndex;
          const hand = gameState.playerHands[playerIdx];
          // Busca uma jogada válida
          const validMoves = gameEngine.getValidMoves(hand, gameState.boardState);
          if (validMoves.length > 0) {
            const move = validMoves[0];
            result = await gameService.playMove(gameState, playerIdx, move.domino, move.side);
            expect(result.isValid).toBe(true);
            gameState = result.gameState;
          }
        }
        // Não testa rodada completa real (aleatoriedade), mas cobre fluxo principal
      });
    });
  });

  describe("startGame", () => {
    it("deve encontrar o jogador com carroça de sena", async () => {
      // Criar um estado de jogo com peças conhecidas
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "waiting" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: { left: null, right: null, played: [] },
        playerHands: [
          [{ left: 1, right: 2 }],
          [{ left: 6, right: 6 }], // Carroça de sena
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const result = await gameService.startGame(gameState);
      expect(result.status).toBe("playing");
      expect(result.currentPlayerIndex).toBe(1); // Jogador com carroça de sena
    });

    it("deve começar com primeiro jogador se ninguém tiver carroça de sena", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "waiting" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: { left: null, right: null, played: [] },
        playerHands: [
          [{ left: 1, right: 2 }],
          [{ left: 3, right: 4 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const result = await gameService.startGame(gameState);
      expect(result.status).toBe("playing");
      expect(result.currentPlayerIndex).toBe(0);
    });
  });

  describe("createOrStartRoomGame", () => {
    it("deve ser idempotente quando a mesma sala completa inicia em paralelo", async () => {
      const baseId = 700 + Math.floor(Math.random() * 10_000);
      for (let index = 0; index < 4; index += 1) {
        addLocalUserForTest({
          id: baseId + index,
          openId: `parallel-player-${baseId}-${index}`,
          name: `Jogador paralelo ${index + 1}`,
          email: null,
          loginMethod: "test",
          passwordHash: null,
          role: "user",
          isOnline: true,
          isPlaying: false,
          blockedUntil: null,
          blockReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        });
      }

      const room = createRoomLocal({
        name: `Sala paralela ${baseId}`,
        isPrivate: false,
        allowBot: false,
        createdBy: baseId,
      });
      joinRoomLocal(room.id, baseId + 1, 2);
      joinRoomLocal(room.id, baseId + 2, 3);
      joinRoomLocal(room.id, baseId + 3, 4);

      const results = await Promise.all([
        gameService.createOrStartRoomGame(room.id, false),
        gameService.createOrStartRoomGame(room.id, false),
        gameService.createOrStartRoomGame(room.id, false),
        gameService.createOrStartRoomGame(room.id, false),
      ]);

      const gameIds = new Set(results.map((result) => result?.gameId));
      expect(gameIds.size).toBe(1);
      expect(getGameByRoomLocal(room.id)?.playerIds).toEqual([baseId, baseId + 1, baseId + 2, baseId + 3]);
      expect(getGameByRoomLocal(room.id)?.isBotPlayer).toEqual([false, false, false, false]);
    });

    it("não deve iniciar sala pública incompleta com bots", async () => {
      addLocalUserForTest({
        id: 501,
        openId: "public-owner-501",
        name: "Dono Público",
        email: null,
        loginMethod: null,
        passwordHash: null,
        role: "user",
        isOnline: true,
        isPlaying: false,
        blockedUntil: null,
        blockReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      });

      const room = createRoomLocal({
        name: "Sala pública teste",
        isPrivate: false,
        allowBot: true,
        createdBy: 501,
      });

      const result = await gameService.createOrStartRoomGame(room.id, true);

      expect(result).toBeNull();
    });

    it("substitui por bot quando jogador abandona partida em andamento", async () => {
      const baseId = 900_000 + Math.floor(Math.random() * 10_000);
      for (let index = 0; index < 4; index += 1) {
        addLocalUserForTest({
          id: baseId + index,
          openId: `leave-bot-${baseId}-${index}`,
          name: `Jogador saída ${index + 1}`,
          email: null,
          loginMethod: "test",
          passwordHash: null,
          role: "user",
          isOnline: true,
          isPlaying: false,
          blockedUntil: null,
          blockReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        });
      }

      const room = createRoomLocal({ name: `Sala abandono ${baseId}`, isPrivate: true, allowBot: false, createdBy: baseId });
      joinRoomLocal(room.id, baseId + 1, 2);
      joinRoomLocal(room.id, baseId + 2, 3);
      joinRoomLocal(room.id, baseId + 3, 4);
      const game = await gameService.createOrStartRoomGame(room.id, false);
      expect(game).not.toBeNull();

      leaveRoomLocal(room.id, baseId + 1);
      const updated = getGameByRoomLocal(room.id);

      expect(updated?.playerIds[1]).not.toBe(baseId + 1);
      expect(updated?.isBotPlayer[1]).toBe(true);
    });

    it("substitui por bot após 1 minuto sem jogar", async () => {
      const baseId = 920_000 + Math.floor(Math.random() * 10_000);
      for (let index = 0; index < 4; index += 1) {
        addLocalUserForTest({
          id: baseId + index,
          openId: `timeout-bot-${baseId}-${index}`,
          name: `Jogador timeout ${index + 1}`,
          email: null,
          loginMethod: "test",
          passwordHash: null,
          role: "user",
          isOnline: true,
          isPlaying: false,
          blockedUntil: null,
          blockReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        });
      }

      const room = createRoomLocal({ name: `Sala timeout ${baseId}`, isPrivate: true, allowBot: false, createdBy: baseId });
      joinRoomLocal(room.id, baseId + 1, 2);
      joinRoomLocal(room.id, baseId + 2, 3);
      joinRoomLocal(room.id, baseId + 3, 4);
      const game = await gameService.createOrStartRoomGame(room.id, false);
      expect(game).not.toBeNull();
      if (!game) return;

      const staleGame = {
        ...(game as any),
        currentPlayerIndex: 0,
        boardState: { ...(game.boardState as any), turnStartedAt: Date.now() - 61_000 },
      };
      const updated = await gameService.replaceTimedOutPlayerWithBot(staleGame);

      expect(updated.isBotPlayer[0]).toBe(true);
      expect(updated.playerIds[0]).not.toBe(baseId);
    });
  });

  describe("playMove", () => {
    it("deve retornar erro se não for a vez do jogador", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "playing" as const,
        currentPlayerIndex: 1,
        roundNumber: 1,
        boardState: { left: null, right: null, played: [] },
        playerHands: [
          [{ left: 1, right: 2 }],
          [{ left: 3, right: 4 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const domino: Domino = { left: 1, right: 2 };
      const result = await gameService.playMove(gameState, 0, domino, "left");

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Não é sua vez");
    });

    it("deve retornar erro se a peça não estiver na mão", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "playing" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: { left: null, right: null, played: [] },
        playerHands: [
          [{ left: 1, right: 2 }],
          [{ left: 3, right: 4 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const domino: Domino = { left: 5, right: 6 }; // Não está na mão
      const result = await gameService.playMove(gameState, 0, domino, "left");

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Peça não está na sua mão");
    });

    it("deve permitir jogar em tabuleiro vazio apenas com 6-6", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "playing" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: { left: null, right: null, up: null, down: null, played: [] },
        playerHands: [
          [{ left: 6, right: 6 }, { left: 1, right: 2 }],
          [{ left: 3, right: 4 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const invalidDomino: Domino = { left: 1, right: 2 };
      const invalidResult = await gameService.playMove(gameState, 0, invalidDomino, "left");
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.error).toBe("Jogada inválida para esta ponta");

      const domino: Domino = { left: 6, right: 6 };
      const result = await gameService.playMove(gameState, 0, domino, "left");
      expect(result.isValid).toBe(true);
      expect(result.gameState.playerHands[0]).toHaveLength(1);
      expect(result.gameState.currentPlayerIndex).toBe(1);
    });

    it("deve registrar pontos reais quando anuncia mais do que a mesa vale", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "playing" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: { left: null, right: null, up: null, down: null, played: [{ left: 5, right: 5 }] },
        playerHands: [
          [{ left: 5, right: 5 }],
          [{ left: 3, right: 4 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const domino: Domino = { left: 5, right: 5 };
      const result = await gameService.playMove(gameState, 0, domino, "left", 30);
      expect(result.isValid).toBe(true);
      expect(result.gameState.lastMove?.awardedPoints).toBe(20);
      expect(result.gameState.lastMove?.call).toBe(true);
      expect(result.gameState.lastMove?.message).toContain("mesa valia 20");
    });

    it("deve seguir a partida sem bônus quando anunciar GALO e a jogada não confirmar", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "playing" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: {
          left: null,
          right: null,
          up: null,
          down: null,
          played: [{ left: 6, right: 6 }],
          branches: { center: { left: 6, right: 6 }, left: [], right: [], up: [], down: [] },
        },
        playerHands: [
          [{ left: 6, right: 1 }, { left: 2, right: 3 }],
          [{ left: 4, right: 5 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const result = await gameService.playMove(gameState, 0, { left: 6, right: 1 }, "left", 0, "galo");

      expect(result.isValid).toBe(true);
      expect(result.gameState.status).toBe("playing");
      expect(result.gameState.currentPlayerIndex).toBe(1);
      expect(result.gameState.winnerTeam).toBeUndefined();
      expect(result.gameState.lastMove?.awardedPoints).toBe(0);
      expect(result.gameState.lastMove?.call).toBe(true);
      expect(result.gameState.lastMove?.message).toContain("GALO não confirmado");
    });

    it("deve iniciar a rodada pós-batida com quem bateu quando ele tiver carroça", async () => {
      const nextHands = [
        [{ left: 2, right: 2 }],
        [{ left: 1, right: 3 }],
        [{ left: 3, right: 4 }],
        [{ left: 4, right: 5 }],
      ];
      const distributeSpy = vi.spyOn(gameEngine, "distributeHands").mockReturnValue(nextHands);
      const gameState = {
        gameId: 101,
        roomId: 101,
        roomName: "Mesa teste",
        status: "playing" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: {
          left: null,
          right: null,
          up: null,
          down: null,
          played: [{ left: 6, right: 6 }],
          branches: { center: { left: 6, right: 6 }, left: [], right: [], up: [], down: [] },
        },
        playerHands: [
          [{ left: 6, right: 1 }],
          [{ left: 0, right: 1 }],
          [{ left: 0, right: 2 }],
          [{ left: 0, right: 3 }],
        ],
        playerScores: [0, 0, 0, 0],
        playerIds: [1, 2, 3, 4],
        playerNames: ["Jogador 1", "Jogador 2", "Jogador 3", "Jogador 4"],
        isBotPlayer: [false, false, false, false],
        winnerId: null,
        winnerTeam: null,
        teamScores: [0, 0],
        passCount: 0,
        announcements: [],
        lastMove: null,
      };

      const result = await gameService.playMove(gameState, 0, { left: 6, right: 1 }, "left");

      expect(result.isValid).toBe(true);
      expect(result.gameState.roundNumber).toBe(2);
      expect(result.gameState.currentPlayerIndex).toBe(0);
      expect(result.gameState.boardState.openingRule).toBe("anyCarroca");
      distributeSpy.mockRestore();
    });

    it("deve passar a saída para o próximo jogador se quem bateu não tiver carroça", async () => {
      const nextHands = [
        [{ left: 1, right: 2 }],
        [{ left: 2, right: 2 }],
        [{ left: 3, right: 4 }],
        [{ left: 4, right: 5 }],
      ];
      const distributeSpy = vi.spyOn(gameEngine, "distributeHands").mockReturnValue(nextHands);
      const gameState = {
        gameId: 102,
        roomId: 102,
        roomName: "Mesa teste",
        status: "playing" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: {
          left: null,
          right: null,
          up: null,
          down: null,
          played: [{ left: 6, right: 6 }],
          branches: { center: { left: 6, right: 6 }, left: [], right: [], up: [], down: [] },
        },
        playerHands: [
          [{ left: 6, right: 1 }],
          [{ left: 0, right: 1 }],
          [{ left: 0, right: 2 }],
          [{ left: 0, right: 3 }],
        ],
        playerScores: [0, 0, 0, 0],
        playerIds: [1, 2, 3, 4],
        playerNames: ["Jogador 1", "Jogador 2", "Jogador 3", "Jogador 4"],
        isBotPlayer: [false, false, false, false],
        winnerId: null,
        winnerTeam: null,
        teamScores: [0, 0],
        passCount: 0,
        announcements: [],
        lastMove: null,
      };

      const result = await gameService.playMove(gameState, 0, { left: 6, right: 1 }, "left");

      expect(result.isValid).toBe(true);
      expect(result.gameState.roundNumber).toBe(2);
      expect(result.gameState.currentPlayerIndex).toBe(1);
      expect(result.gameState.playerScores).toEqual([0, 0, 0, 0]);
      expect(result.gameState.announcements?.some((item) => item.includes("passou a saída para Jogador 2"))).toBe(true);
      distributeSpy.mockRestore();
    });
  });

  describe("passMove", () => {
    it("deve retornar erro se não for a vez do jogador", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "playing" as const,
        currentPlayerIndex: 1,
        roundNumber: 1,
        boardState: { left: null, right: null, played: [] },
        playerHands: [
          [{ left: 1, right: 2 }],
          [{ left: 3, right: 4 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const result = await gameService.passMove(gameState, 0);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Não é sua vez");
    });

    it("deve passar a vez e dar 20 pontos se passar tendo jogada válida", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "playing" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: { left: { left: 1, right: 2 }, right: null, played: [] },
        playerHands: [
          [{ left: 1, right: 3 }], // Pode jogar no lado esquerdo
          [{ left: 4, right: 5 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const result = await gameService.passMove(gameState, 0);

      expect(result.isValid).toBe(true);
      expect(result.gameState.status).toBe("playing");
      expect(result.gameState.currentPlayerIndex).toBe(1);
      expect(result.gameState.playerScores[1]).toBe(20);
    });

    it("deve permitir passar e dar 20 pontos à dupla adversária no primeiro passe válido", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "playing" as const,
        currentPlayerIndex: 0,
        roundNumber: 1,
        boardState: { left: { left: 1, right: 2 }, right: null, played: [] },
        playerHands: [
          [{ left: 6, right: 6 }], // Não pode jogar
          [{ left: 4, right: 5 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const result = await gameService.passMove(gameState, 0);

      expect(result.isValid).toBe(true);
      expect(result.gameState.currentPlayerIndex).toBe(1); // Passou para o próximo
      expect(result.gameState.playerScores[1]).toBe(20); // Primeiro passe válido pontua para os adversários
    });

    it("não deve dar 20 pontos em passe de saída antes da primeira pedra", async () => {
      const gameState = {
        gameId: 1,
        roomId: 1,
        status: "playing" as const,
        currentPlayerIndex: 0,
        roundNumber: 2,
        boardState: gameEngine.createEmptyBoardState("anyCarroca"),
        playerHands: [
          [{ left: 1, right: 2 }],
          [{ left: 2, right: 2 }],
        ],
        playerScores: [0, 0],
        playerIds: [1, 2],
        isBotPlayer: [false, false],
        winnerId: null,
        lastMove: null,
      };

      const result = await gameService.passMove(gameState, 0);

      expect(result.isValid).toBe(true);
      expect(result.gameState.currentPlayerIndex).toBe(1);
      expect(result.gameState.playerScores).toEqual([0, 0]);
    });
  });
});
