import { playMove, passMove } from "./gameService";
import {
  calculateScore,
  getValidMoves,
  hasValidMoves,
  isDouble,
  placeDominoOnBoard,
  type BoardState,
  type Domino,
  type BoardSide,
} from "./gameEngine";
import type { GameState } from "./gameService";

/**
 * Serviço de Bot de IA para jogar Dominó Amazônico
 */
export class BotService {
  /**
   * Executa uma jogada do bot
   */
  static async makeBotMove(gameState: GameState, playerIndex: number): Promise<GameState> {
    if (gameState.currentPlayerIndex !== playerIndex) {
      throw new Error("Not bot's turn");
    }

    const botHand = gameState.playerHands[playerIndex] ?? [];
    if (botHand.length === 0) {
      throw new Error("Bot has no dominoes");
    }

    const validMoves = getValidMoves(botHand, gameState.boardState);
    if (validMoves.length === 0) {
      const passResult = await passMove(gameState, playerIndex);
      if (!passResult.isValid) {
        throw new Error(passResult.error || "Bot pass failed");
      }
      return passResult.gameState;
    }

    await this.sleep(300 + Math.random() * 600);

    const bestMove = this.selectBestMove(gameState, validMoves, playerIndex);
    const result = await playMove(gameState, playerIndex, bestMove.domino, bestMove.side, bestMove.announcedPoints);
    if (!result.isValid) {
      throw new Error(result.error || "Bot move failed");
    }
    return result.gameState;
  }

  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static selectBestMove(
    gameState: GameState,
    moves: Array<{ domino: Domino; side: BoardSide }>,
    playerIndex: number
  ) {
    let bestMove: { domino: Domino; side: BoardSide; announcedPoints?: number } = { ...moves[0] };
    let bestScore = -Infinity;

    for (const move of moves) {
      const preview = placeDominoOnBoard(gameState.boardState, move.domino, move.side);
      const tablePoints = calculateScore(preview);
      const remainingHand = [...gameState.playerHands[playerIndex]];
      const removeIndex = remainingHand.findIndex(
        (piece) => piece.left === move.domino.left && piece.right === move.domino.right
      );
      if (removeIndex >= 0) {
        remainingHand.splice(removeIndex, 1);
      }

      const otherHands = gameState.playerHands.filter((_, index) => index !== playerIndex);
      const actualGalo = this.hasExclusiveNextPlay(remainingHand, otherHands, preview);
      const moveValue = tablePoints * 10 + move.domino.left + move.domino.right + (isDouble(move.domino) ? 20 : 0) + (actualGalo ? 300 : 0);

      if (moveValue > bestScore) {
        bestScore = moveValue;
        bestMove = { ...move, announcedPoints: actualGalo ? 50 : tablePoints || undefined };
      }
    }

    return bestMove as { domino: Domino; side: BoardSide; announcedPoints?: number };
  }

  private static hasExclusiveNextPlay(playerHand: Domino[], otherHands: Domino[][], boardState: BoardState) {
    if (playerHand.length === 0) return false;
    if (!hasValidMoves(playerHand, boardState)) return false;
    return otherHands.every((hand) => !hasValidMoves(hand, boardState));
  }
}
