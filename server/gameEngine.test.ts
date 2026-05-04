import { describe, it, expect } from "vitest";
import {
  createDominoes,
  createEmptyBoardState,
  shuffle,
  distributeHands,
  findCarrocaSena,
  canPlayDomino,
  playDomino,
  calculateScore,
  calculateOpenEndsSum,
  hasValidMoves,
  getValidMoves,
  calculateLevel,
  calculateWinRate,
  type BoardState,
  type Domino,
} from "./gameEngine";

describe("Game Engine - Dominó Amazônico", () => {
  describe("createDominoes", () => {
    it("deve criar 28 peças de dominó", () => {
      const dominoes = createDominoes();
      expect(dominoes).toHaveLength(28);
    });

    it("deve conter carroça de sena (6-6)", () => {
      const dominoes = createDominoes();
      const carrocaSena = dominoes.find(d => d.left === 6 && d.right === 6);
      expect(carrocaSena).toBeDefined();
    });
  });

  describe("shuffle", () => {
    it("deve embaralhar o array", () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffle(original);
      expect(shuffled).toHaveLength(original.length);
      expect(shuffled).toContain(1);
      expect(shuffled).toContain(5);
    });
  });

  describe("distributeHands", () => {
    it("deve distribuir 7 peças para cada jogador", () => {
      const hands = distributeHands(4);
      expect(hands).toHaveLength(4);
      hands.forEach(hand => {
        expect(hand).toHaveLength(7);
      });
    });

    it("deve distribuir todas as 28 peças", () => {
      const hands = distributeHands(4);
      const totalPieces = hands.reduce((sum, hand) => sum + hand.length, 0);
      expect(totalPieces).toBe(28);
    });
  });

  describe("findCarrocaSena", () => {
    it("deve encontrar carroça de sena na mão", () => {
      const hand: Domino[] = [
        { left: 1, right: 2 },
        { left: 6, right: 6 },
        { left: 3, right: 4 },
      ];
      const carrocaSena = findCarrocaSena(hand);
      expect(carrocaSena).toEqual({ left: 6, right: 6 });
    });

    it("deve retornar null se carroça de sena não estiver na mão", () => {
      const hand: Domino[] = [
        { left: 1, right: 2 },
        { left: 3, right: 4 },
      ];
      const carrocaSena = findCarrocaSena(hand);
      expect(carrocaSena).toBeNull();
    });
  });

  describe("canPlayDomino", () => {
    it("deve permitir jogar em tabuleiro vazio apenas com 6-6", () => {
      const boardState: BoardState = { left: null, right: null, played: [] };
      expect(canPlayDomino({ left: 1, right: 2 }, boardState, "left")).toBe(false);
      expect(canPlayDomino({ left: 6, right: 6 }, boardState, "left")).toBe(true);
      expect(canPlayDomino({ left: 6, right: 6 }, boardState, "right")).toBe(true);
    });

    it("deve permitir abrir rodada pós-batida com qualquer carroça", () => {
      const boardState = createEmptyBoardState("anyCarroca");
      expect(canPlayDomino({ left: 2, right: 2 }, boardState, "left")).toBe(true);
      expect(canPlayDomino({ left: 1, right: 2 }, boardState, "left")).toBe(false);
    });

    it("deve validar jogada no lado esquerdo", () => {
      const boardState: BoardState = {
        left: { left: 1, right: 3 },
        right: null,
        played: [],
      };
      const validDomino: Domino = { left: 1, right: 4 };
      const invalidDomino: Domino = { left: 5, right: 6 };
      
      expect(canPlayDomino(validDomino, boardState, "left")).toBe(true);
      expect(canPlayDomino(invalidDomino, boardState, "left")).toBe(false);
    });

    it("deve validar jogada no lado direito", () => {
      const boardState: BoardState = {
        left: null,
        right: { left: 5, right: 6 },
        played: [],
      };
      const validDomino: Domino = { left: 5, right: 6 };
      const invalidDomino: Domino = { left: 1, right: 3 };
      
      expect(canPlayDomino(validDomino, boardState, "right")).toBe(true);
      expect(canPlayDomino(invalidDomino, boardState, "right")).toBe(false);
    });
  });

  describe("playDomino", () => {
    it("deve adicionar peça ao tabuleiro vazio", () => {
      const boardState: BoardState = { left: null, right: null, played: [] };
      const domino: Domino = { left: 1, right: 2 };
      
      const newState = playDomino(domino, boardState, "left");
      expect(newState.left).toEqual(domino);
      expect(newState.played).toContain(domino);
    });

    it("deve adicionar peça ao lado esquerdo", () => {
      const boardState: BoardState = {
        left: { left: 3, right: 1 },
        right: null,
        played: [{ left: 3, right: 1 }],
      };
      const domino: Domino = { left: 3, right: 4 };
      
      const newState = playDomino(domino, boardState, "left");
      expect(newState.left).toEqual({ left: 4, right: 3 });
      expect(newState.played).toHaveLength(2);
    });
  });

  describe("calculateScore", () => {
    it("deve calcular pontuação múltipla de 5", () => {
      const boardState: BoardState = {
        left: null,
        right: null,
        up: null,
        down: null,
        played: [{ left: 5, right: 5 }],
      };
      const score = calculateScore(boardState);
      expect(score).toBe(10); // 5 + 5 = 10
    });

    it("deve retornar 0 quando pontuação não é múltiplo de 5", () => {
      const boardState: BoardState = {
        left: null,
        right: null,
        up: null,
        down: null,
        played: [{ left: 2, right: 6 }],
      };
      const score = calculateScore(boardState);
      expect(score).toBe(0); // 2 + 6 = 8
    });

    it("deve retornar pontuação quando é múltiplo de 5", () => {
      const boardState: BoardState = {
        left: null,
        right: null,
        up: null,
        down: null,
        played: [{ left: 5, right: 5 }],
      };
      const score = calculateScore(boardState);
      expect(score).toBe(10);
    });

    it("deve contar apenas as pontas realmente abertas quando houver uma pedra lateral", () => {
      const boardState: BoardState = {
        left: null,
        right: { left: 6, right: 2 },
        up: null,
        down: null,
        played: [{ left: 6, right: 6 }],
      };
      const score = calculateScore(boardState);
      expect(score).toBe(0); // 6 + 2 = 8
    });

    it("deve pontuar pela ponta livre do centro e a ponta externa da lateral", () => {
      const boardState: BoardState = {
        left: null,
        right: { left: 2, right: 3 },
        up: null,
        down: null,
        played: [{ left: 6, right: 6 }],
      };
      const score = calculateScore(boardState);
      expect(score).toBe(15); // 3 + carroça inicial 6 + 6 = 15
    });

    it("deve contar a primeira carroça inteira enquanto apenas uma lateral estiver fechada", () => {
      const boardState: BoardState = {
        left: null,
        right: { left: 2, right: 6 },
        up: null,
        down: null,
        played: [{ left: 2, right: 2 }, { left: 2, right: 6 }],
      };
      const score = calculateScore(boardState);
      expect(score).toBe(10); // ponta 6 + carroça inicial 2 + 2 = 10
    });

    it("não deve contar a carroça inicial depois que esquerda e direita existirem", () => {
      const boardState: BoardState = {
        left: { left: 3, right: 6 },
        right: { left: 3, right: 2 },
        up: null,
        down: null,
        played: [{ left: 6, right: 6 }],
      };
      const score = calculateScore(boardState);
      expect(score).toBe(5); // 3 + 2 = 5; a carroça inicial não entra mais sozinha
    });

    it("deve incluir pedras de cima e baixo apenas quando existirem", () => {
      const boardState: BoardState = {
        left: { left: 3, right: 6 },
        right: { left: 3, right: 2 },
        up: { left: 4, right: 6 },
        down: null,
        played: [{ left: 6, right: 6 }],
      };
      const score = calculateScore(boardState);
      expect(score).toBe(0); // 3 + 2 + 4 = 9; baixo ainda não existe
    });

    it("deve somar os dois lados de uma carroça quando ela está em uma ponta aberta", () => {
      const boardState: BoardState = {
        left: null,
        right: null,
        up: null,
        down: null,
        played: [{ left: 6, right: 6 }, { left: 6, right: 5 }],
        branches: {
          center: { left: 6, right: 6 },
          left: [{ left: 3, right: 6 }],
          right: [{ left: 6, right: 5 }, { left: 5, right: 5 }],
          up: [],
          down: [],
        },
      };
      expect(calculateOpenEndsSum(boardState)).toBe(13); // 3 + 5 + 5
      expect(calculateScore(boardState)).toBe(0);
    });
  });

  describe("hasValidMoves", () => {
    it("deve retornar true quando há jogadas válidas", () => {
      const hand: Domino[] = [
        { left: 1, right: 2 },
        { left: 3, right: 4 },
      ];
      const boardState: BoardState = {
        left: { left: 2, right: 1 },
        right: null,
        played: [],
      };
      expect(hasValidMoves(hand, boardState)).toBe(true);
    });

    it("deve retornar false quando não há jogadas válidas", () => {
      const hand: Domino[] = [
        { left: 5, right: 6 },
        { left: 6, right: 6 },
      ];
      const boardState: BoardState = {
        left: { left: 1, right: 2 },
        right: { left: 3, right: 4 },
        played: [],
      };
      expect(hasValidMoves(hand, boardState)).toBe(false);
    });
  });

  describe("getValidMoves", () => {
    it("deve retornar todas as jogadas válidas", () => {
      const hand: Domino[] = [
        { left: 1, right: 2 },
        { left: 3, right: 4 },
        { left: 5, right: 6 },
      ];
      const boardState: BoardState = {
        left: { left: 1, right: 2 },
        right: { left: 3, right: 5 },
        played: [],
      };
      const validMoves = getValidMoves(hand, boardState);
      // Deve ter pelo menos 1 jogada válida
      expect(validMoves.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("calculateLevel", () => {
    it("deve calcular nível baseado em partidas jogadas", () => {
      expect(calculateLevel(0)).toBe(1);
      expect(calculateLevel(10)).toBe(2);
      expect(calculateLevel(20)).toBe(3);
      expect(calculateLevel(50)).toBe(6);
    });
  });

  describe("calculateWinRate", () => {
    it("deve calcular taxa de vitória corretamente", () => {
      expect(calculateWinRate(5, 10)).toBe("50.00");
      expect(calculateWinRate(10, 10)).toBe("100.00");
      expect(calculateWinRate(0, 10)).toBe("0.00");
    });

    it("deve retornar 0.00 quando não há partidas", () => {
      expect(calculateWinRate(0, 0)).toBe("0.00");
    });
  });
});
