// Tipos base para o motor autoritativo do Dominó Amazônico

export type MatchActionType = "play" | "pass" | "galo" | "resign";

export interface MatchAction {
  matchId: number;
  playerId: number;
  type: MatchActionType;
  domino?: Domino;
  side?: BoardSide;
  announcedPoints?: number | null;
}

export interface MatchState {
  id: number;
  roomId: number;
  status: "waiting" | "playing" | "finished";
  turnPlayerId: number;
  board: BoardState;
  hands: Record<number, Domino[]>;
  teamScores: [number, number];
  announcements: string[];
  spectators: number[];
  disconnectedPlayers: number[];
}

// Tipos auxiliares (ajuste conforme necessário)
export interface Domino {
  left: number;
  right: number;
}

export type BoardSide = "left" | "right" | "up" | "down";

export interface BoardState {
  // Estrutura a ser detalhada conforme regras do jogo
}
