// Tipos de eventos de broadcast para avisos globais na mesa
export type GameBroadcastEvent =
  | { type: "score-warning"; playerName: string; informed: number; actual: number }
  | { type: "galo-confirmed"; playerName: string }
  | { type: "player-replaced-by-bot"; playerName: string };
