// Função para determinar o tier do jogador baseado em pontos
export function getPlayerTier(points: number): string {
  if (points >= 5000) return "Lendário";
  if (points >= 2500) return "Mestre";
  if (points >= 1200) return "Ouro";
  if (points >= 600) return "Prata";
  return "Bronze";
}
