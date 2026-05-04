// Exemplo de função para mostrar ranking/tier abaixo do nome do jogador
export function getPlayerSecondaryLabel(player: any): string {
  if (player?.stats?.rank && player?.stats?.totalPoints !== undefined) {
    return `Rank #${player.stats.rank} • ${player.stats.totalPoints} pts`;
  }
  if (player?.stats?.level) {
    return `Nível ${player.stats.level}`;
  }
  return 'Sem ranking ainda';
}
