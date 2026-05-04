import { describe, it, expect } from "vitest";
import { calculateLevel, calculateWinRate } from "./finishGameService";

describe("finishGameService", () => {
  describe("calculateLevel", () => {
    it("deve retornar nível 1 para 0-9 vitórias", () => {
      expect(calculateLevel(0)).toBe(1);
      expect(calculateLevel(5)).toBe(1);
      expect(calculateLevel(9)).toBe(1);
    });

    it("deve retornar nível 2 para 10-19 vitórias", () => {
      expect(calculateLevel(10)).toBe(2);
      expect(calculateLevel(15)).toBe(2);
      expect(calculateLevel(19)).toBe(2);
    });

    it("deve retornar nível 3 para 20-29 vitórias", () => {
      expect(calculateLevel(20)).toBe(3);
      expect(calculateLevel(25)).toBe(3);
      expect(calculateLevel(29)).toBe(3);
    });

    it("deve retornar nível 10 para 90-99 vitórias", () => {
      expect(calculateLevel(90)).toBe(10);
      expect(calculateLevel(95)).toBe(10);
      expect(calculateLevel(99)).toBe(10);
    });

    it("deve retornar nível 11 para 100+ vitórias", () => {
      expect(calculateLevel(100)).toBe(11);
      expect(calculateLevel(150)).toBe(16);
      expect(calculateLevel(200)).toBe(21);
    });
  });

  describe("calculateWinRate", () => {
    it("deve retornar 0.00 para 0 partidas", () => {
      expect(calculateWinRate(0, 0)).toBe("0.00");
    });

    it("deve retornar 100.00 para 100% de vitórias", () => {
      expect(calculateWinRate(1, 1)).toBe("100.00");
      expect(calculateWinRate(10, 10)).toBe("100.00");
    });

    it("deve retornar 50.00 para 50% de vitórias", () => {
      expect(calculateWinRate(1, 2)).toBe("50.00");
      expect(calculateWinRate(5, 10)).toBe("50.00");
    });

    it("deve retornar 33.33 para 1 vitória em 3 partidas", () => {
      expect(calculateWinRate(1, 3)).toBe("33.33");
    });

    it("deve retornar 0.00 para 0 vitórias", () => {
      expect(calculateWinRate(0, 10)).toBe("0.00");
    });

    it("deve calcular corretamente para valores altos", () => {
      expect(calculateWinRate(75, 100)).toBe("75.00");
      expect(calculateWinRate(333, 1000)).toBe("33.30");
    });
  });
});
