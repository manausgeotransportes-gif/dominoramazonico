import { MatchState, MatchAction } from "../../../shared/game/types";

// Esqueleto do motor autoritativo do Dominó Amazônico
export class MatchEngine {
  applyAction(state: MatchState, action: MatchAction): MatchState {
    switch (action.type) {
      case "play":
        return this.applyPlay(state, action);
      case "galo":
        return this.applyGalo(state, action);
      case "pass":
        return this.applyPass(state, action);
      case "resign":
        return this.applyResign(state, action);
      default:
        return state;
    }
  }

  // Métodos a serem implementados
  applyPlay(state: MatchState, action: MatchAction): MatchState {
    // TODO: lógica de jogada
    return state;
  }

  applyGalo(state: MatchState, action: MatchAction): MatchState {
    // TODO: lógica de GALO
    return state;
  }

  applyPass(state: MatchState, action: MatchAction): MatchState {
    // TODO: lógica de passe
    return state;
  }

  applyResign(state: MatchState, action: MatchAction): MatchState {
    // TODO: lógica de desistência
    return state;
  }
}
