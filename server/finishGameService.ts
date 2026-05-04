import { getDb } from "./db";
import { games, gamePlayers, playerStats, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Finaliza uma partida e atualiza as estatísticas dos jogadores
 */
export async function finishGame(gameId: number, winnerId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    // Obter informações da partida
    const gameList = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
    const game = gameList[0];

    if (!game) {
      throw new Error("Game not found");
    }

    // Obter todos os jogadores da partida
    const playersList = await db
      .select()
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, gameId));

    // Atualizar status da partida
    await db
      .update(games)
      .set({
        status: "finished",
        winnerId,
        finishedAt: new Date(),
      })
      .where(eq(games.id, gameId));

    const winnerPlayer = playersList.find((player) => player.userId === winnerId);
    const winnerTeam = winnerPlayer ? winnerPlayer.playerIndex % 2 : null;

    // Atualizar estatísticas de cada jogador. A vitória é da dupla, não só do usuário que bateu.
    for (const player of playersList) {
      // Obter ou criar stats do jogador
      const statsList = await db
        .select()
        .from(playerStats)
        .where(eq(playerStats.userId, player.userId))
        .limit(1);

      const isWinner = winnerTeam !== null ? player.playerIndex % 2 === winnerTeam : player.userId === winnerId;
      const newWins = (statsList[0]?.totalWins || 0) + (isWinner ? 1 : 0);
      const newGames = (statsList[0]?.totalGames || 0) + 1;
      const rawCompetitivePoints = (statsList[0]?.totalPoints || 0) + (isWinner ? 1 : -1);
      const newPoints = Math.max(0, rawCompetitivePoints);

      // Calcular novo nível com base em partidas + vitórias
      const newLevel = 1 + Math.floor((newGames + newWins * 2) / 10);

      // Calcular taxa de vitória
      const newWinRate = newGames > 0 ? ((newWins / newGames) * 100).toFixed(2) : "0.00";

      if (statsList.length === 0) {
        // Criar novo registro de stats
        await db.insert(playerStats).values({
          userId: player.userId,
          totalGames: newGames,
          totalWins: newWins,
          totalPoints: newPoints,
          level: newLevel,
          winRate: newWinRate,
        });
      } else {
        // Atualizar stats existentes
        await db
          .update(playerStats)
          .set({
            totalGames: newGames,
            totalWins: newWins,
            totalPoints: newPoints,
            level: newLevel,
            winRate: newWinRate,
          })
          .where(eq(playerStats.userId, player.userId));
      }
    }

    // Atualizar status online do vencedor
    await db
      .update(users)
      .set({
        isPlaying: false,
      })
      .where(eq(users.id, winnerId));

    // Atualizar status online de todos os jogadores
    for (const player of playersList) {
      await db
        .update(users)
        .set({
          isPlaying: false,
        })
        .where(eq(users.id, player.userId));
    }
  } catch (error) {
    console.error("Erro ao finalizar partida:", error);
    throw error;
  }
}

/**
 * Obtém as estatísticas atualizadas de um jogador
 */
export async function getPlayerStats(userId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const statsList = await db
    .select()
    .from(playerStats)
    .where(eq(playerStats.userId, userId))
    .limit(1);

  if (statsList.length === 0) {
    return {
      userId,
      totalGames: 0,
      totalWins: 0,
      totalPoints: 0,
      level: 1,
      winRate: "0.00",
    };
  }

  return statsList[0];
}

/**
 * Calcula o nível de um jogador baseado em vitórias
 */
export function calculateLevel(totalGames: number, totalWins: number = 0): number {
  return 1 + Math.floor((totalGames + totalWins * 2) / 10);
}

/**
 * Calcula a taxa de vitória
 */
export function calculateWinRate(wins: number, games: number): string {
  if (games === 0) return "0.00";
  return ((wins / games) * 100).toFixed(2);
}
