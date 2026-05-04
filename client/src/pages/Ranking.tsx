import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Zap, TrendingUp, Swords, Medal, Target, Flame, Award, BarChart3, Users } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Ranking() {
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState("global");

  const { data: globalRanking, isLoading: loadingGlobal } = trpc.ranking.getGlobalRanking.useQuery({ limit: 100, offset: 0 });
  const { data: playerRanking } = trpc.ranking.getPlayerRanking.useQuery(undefined, { enabled: isAuthenticated });
  const { data: playerStats } = trpc.ranking.getPlayerStats.useQuery(undefined, { enabled: isAuthenticated });
  const { data: topPlayers } = trpc.ranking.getTopPlayers.useQuery();

  const getMedalEmoji = (rank: number) => {
    switch (rank) {
      case 1: return "🥇";
      case 2: return "🥈";
      case 3: return "🥉";
      default: return `#${rank}`;
    }
  };

  const getLevelColor = (level: number) => {
    if (level >= 12) return "text-fuchsia-400";
    if (level >= 9) return "text-sky-400";
    if (level >= 6) return "text-emerald-400";
    if (level >= 3) return "text-amber-400";
    return "text-slate-300";
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#111827_0%,#020617_46%,#000000_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 text-white shadow-2xl backdrop-blur md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
                <Trophy className="h-4 w-4" />
                Ranking competitivo com pontos, vitórias, nível e taxa de aproveitamento
              </div>
              <h1 className="mt-4 text-4xl font-black sm:text-5xl">Ranking</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                Cada vitória rende ponto competitivo, derrotas transferem pontuação para quem venceu e o nível considera quantidade de partidas jogadas e vencidas.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/lobby"><Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">Voltar ao lobby</Button></Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Card className="border-white/10 bg-slate-950/80 text-white"><CardContent className="p-5"><div className="flex items-center gap-3"><Trophy className="h-5 w-5 text-amber-300" /><div className="text-sm text-slate-400">Sua posição</div></div><div className="mt-3 text-3xl font-black">{playerRanking?.rank ? `#${playerRanking.rank}` : "--"}</div></CardContent></Card>
          <Card className="border-white/10 bg-slate-950/80 text-white"><CardContent className="p-5"><div className="flex items-center gap-3"><Target className="h-5 w-5 text-emerald-300" /><div className="text-sm text-slate-400">Pontos competitivos</div></div><div className="mt-3 text-3xl font-black">{playerStats?.totalPoints ?? 0}</div></CardContent></Card>
          <Card className="border-white/10 bg-slate-950/80 text-white"><CardContent className="p-5"><div className="flex items-center gap-3"><Swords className="h-5 w-5 text-sky-300" /><div className="text-sm text-slate-400">Partidas jogadas</div></div><div className="mt-3 text-3xl font-black">{playerStats?.totalGames ?? 0}</div></CardContent></Card>
          <Card className="border-white/10 bg-slate-950/80 text-white"><CardContent className="p-5"><div className="flex items-center gap-3"><Zap className="h-5 w-5 text-violet-300" /><div className="text-sm text-slate-400">Seu nível</div></div><div className={`mt-3 text-3xl font-black ${getLevelColor(playerStats?.level ?? 1)}`}>{playerStats?.level ?? 1}</div></CardContent></Card>
          <Card className="border-white/10 bg-slate-950/80 text-white"><CardContent className="p-5"><div className="flex items-center gap-3"><Flame className="h-5 w-5 text-red-300" /><div className="text-sm text-slate-400">Sequência atual</div></div><div className="mt-3 text-3xl font-black">{0}</div></CardContent></Card>
          <Card className="border-white/10 bg-slate-950/80 text-white"><CardContent className="p-5"><div className="flex items-center gap-3"><Award className="h-5 w-5 text-yellow-300" /><div className="text-sm text-slate-400">Melhor sequência</div></div><div className="mt-3 text-3xl font-black">{0}</div></CardContent></Card>
        </section>

        {playerRanking && playerStats && (
          <Card className="border-white/10 bg-gradient-to-r from-sky-950/90 via-slate-950 to-emerald-950/90 text-white shadow-2xl">
            <CardHeader>
              <CardTitle>Seu desempenho</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 md:grid-cols-5">
                <div><div className="text-sm text-slate-400">Posição</div><div className="mt-1 text-3xl font-black">{playerRanking.rank ? `#${playerRanking.rank}` : "N/A"}</div></div>
                <div><div className="text-sm text-slate-400">Nível</div><div className={`mt-1 text-3xl font-black ${getLevelColor(playerStats.level)}`}>{playerStats.level}</div></div>
                <div><div className="text-sm text-slate-400">Vitórias</div><div className="mt-1 text-3xl font-black">{playerStats.totalWins}</div></div>
                <div><div className="text-sm text-slate-400">Partidas</div><div className="mt-1 text-3xl font-black">{playerStats.totalGames}</div></div>
                <div><div className="text-sm text-slate-400">Taxa de vitória</div><div className="mt-1 text-3xl font-black">{playerStats.winRate}%</div></div>
              </div>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                  <span>Progresso para o nível {playerStats.level + 1}</span>
                  <span>{playerStats.nextLevelProgress}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-emerald-400 to-sky-400 transition-all" style={{ width: `${playerStats.nextLevelProgress}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-900/80">
            <TabsTrigger value="global" className="text-white">Ranking Global</TabsTrigger>
            <TabsTrigger value="top10" className="text-white">Top 10</TabsTrigger>
            <TabsTrigger value="stats" className="text-white">Estatísticas</TabsTrigger>
          </TabsList>

          <TabsContent value="global" className="mt-6">
            {loadingGlobal ? (
              <div className="text-center text-slate-300">Carregando ranking...</div>
            ) : globalRanking && globalRanking.length > 0 ? (
              <div className="space-y-3">
                {globalRanking.map((player) => (
                  <Card key={player.userId} className={`border-white/10 bg-slate-950/80 text-white ${player.userId === user?.id ? "ring-2 ring-sky-400/40" : ""}`}>
                    <CardContent className="p-4 md:p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-2xl font-black text-amber-300">{getMedalEmoji(player.rank)}</div>
                          <div>
                            <div className="text-lg font-bold">{player.userName}</div>
                            <div className="text-sm text-slate-400">Nível <span className={getLevelColor(player.level)}>{player.level}</span> · Win rate {player.winRate}%</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-6 md:gap-10">
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Pontos</div>
                            <div className="mt-1 text-xl font-black">{player.totalPoints}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Vitórias</div>
                            <div className="mt-1 text-xl font-black">{player.totalWins}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Partidas</div>
                            <div className="mt-1 text-xl font-black">{player.totalGames}</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-300">Nenhum jogador no ranking.</div>
            )}
          </TabsContent>

          <TabsContent value="top10" className="mt-6">
            {topPlayers && topPlayers.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {topPlayers.map((player) => (
                  <Card key={player.userId} className="border-white/10 bg-slate-950/80 text-white shadow-xl">
                    <CardContent className="flex items-center gap-5 p-5">
                      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400/15 to-white/5 text-4xl">{getMedalEmoji(player.rank)}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xl font-black"><Medal className="h-5 w-5 text-amber-300" /> {player.userName}</div>
                        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                          <div><div className="text-slate-500">Nível</div><div className={`text-lg font-bold ${getLevelColor(player.level)}`}>{player.level}</div></div>
                          <div><div className="text-slate-500">Vitórias</div><div className="text-lg font-bold">{player.totalWins}</div></div>
                          <div><div className="text-slate-500">Taxa</div><div className="text-lg font-bold">{player.winRate}%</div></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-300">Nenhum jogador no top 10.</div>
            )}
          </TabsContent>

          <TabsContent value="stats" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-white/10 bg-slate-950/80 text-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-emerald-300" />
                    Estatísticas Gerais
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm text-slate-400">Total de Jogadores</div>
                      <div className="mt-2 text-2xl font-black">{globalRanking?.length ?? 0}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm text-slate-400">Partidas Hoje</div>
                      <div className="mt-2 text-2xl font-black">--</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm text-slate-400">Média de Pontos</div>
                      <div className="mt-2 text-2xl font-black">
                        {globalRanking && globalRanking.length > 0
                          ? Math.round(globalRanking.reduce((sum, p) => sum + p.totalPoints, 0) / globalRanking.length)
                          : 0}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm text-slate-400">Taxa Média</div>
                      <div className="mt-2 text-2xl font-black">
                        {globalRanking && globalRanking.length > 0
                          ? Math.round(globalRanking.reduce((sum, p) => sum + p.winRate, 0) / globalRanking.length)
                          : 0}%
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-slate-950/80 text-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-sky-300" />
                    Distribuição por Níveis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((level) => {
                      const count = globalRanking?.filter(p => p.level === level).length ?? 0;
                      const percentage = globalRanking && globalRanking.length > 0 ? (count / globalRanking.length) * 100 : 0;
                      return (
                        <div key={level} className="flex items-center gap-3">
                          <div className="w-8 text-sm font-semibold">Lv.{level}</div>
                          <div className="flex-1">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                          <div className="w-12 text-right text-sm text-slate-400">{count}</div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
