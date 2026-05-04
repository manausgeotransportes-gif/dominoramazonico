import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Gamepad2, AlertCircle, BarChart3, Shield, Trophy, House, Settings, Server, Lock, Database, Bot, RefreshCw, UserCog } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type AdminSection = "usuarios" | "salas" | "partidas" | "moderacao" | "ranking" | "sistema" | "seguranca";

const ADMIN_MENU: Array<{ id: AdminSection; label: string; description: string; icon: typeof Users; subitems: string[] }> = [
  { id: "usuarios", label: "Usuários", description: "Contas, perfis e status", icon: Users, subitems: ["Cadastrados", "Online", "Bloqueados", "Permissões"] },
  { id: "salas", label: "Salas", description: "Mesas públicas e privadas", icon: House, subitems: ["Disponíveis", "Ativas", "Privadas", "Capacidade"] },
  { id: "partidas", label: "Partidas", description: "Jogos e histórico", icon: Gamepad2, subitems: ["Em andamento", "Finalizadas", "Rodadas", "Jogadores"] },
  { id: "moderacao", label: "Moderação", description: "Chat e infrações", icon: Shield, subitems: ["Infrações", "Bloqueios", "Denúncias", "Filtros"] },
  { id: "ranking", label: "Ranking", description: "Pontuação e relatórios", icon: Trophy, subitems: ["Top jogadores", "Vitórias", "Aproveitamento", "Níveis"] },
  { id: "sistema", label: "Sistema", description: "Configurações gerais", icon: Settings, subitems: ["Lobby", "Bots", "Banco de dados", "Serviços"] },
  { id: "seguranca", label: "Segurança", description: "Acesso administrativo", icon: Lock, subitems: ["Administradores", "Sessões", "Credenciais", "Auditoria"] },
];

export default function AdminPanel() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [activeSection, setActiveSection] = useState<AdminSection>("usuarios");
  const isAdmin = Boolean(user && user.role === "admin");

  const stats = trpc.admin.getStats.useQuery(undefined, { enabled: isAdmin, refetchInterval: 5000 });
  const usersQuery = trpc.admin.listUsers.useQuery({ limit: 200, offset: 0 }, { enabled: isAdmin });
  const gamesQuery = trpc.admin.listGames.useQuery({ limit: 100, offset: 0 }, { enabled: isAdmin });
  const roomsQuery = trpc.admin.listRooms.useQuery({ limit: 100, offset: 0 }, { enabled: isAdmin });
  const infractionsQuery = trpc.admin.listInfractions.useQuery({ limit: 100, offset: 0 }, { enabled: isAdmin });
  const rankingQuery = trpc.admin.getTopRanking.useQuery(undefined, { enabled: isAdmin });
  const botsQuery = trpc.admin.listBots.useQuery(undefined, { enabled: isAdmin });
  const blockUserMutation = trpc.admin.blockUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário bloqueado.");
      refreshAll();
    },
    onError: (error) => toast.error(error.message || "Não foi possível bloquear"),
  });
  const unblockUserMutation = trpc.admin.unblockUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário desbloqueado.");
      refreshAll();
    },
    onError: (error) => toast.error(error.message || "Não foi possível desbloquear"),
  });
  const resetPasswordMutation = trpc.admin.resetUserPassword.useMutation({
    onSuccess: (data: any) => {
      if (data.temporaryPassword) {
        toast.success(`Senha temporária: ${data.temporaryPassword}`);
      } else {
        toast.info(data.message || "Solicitação processada.");
      }
      usersQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível redefinir senha"),
  });

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) navigate("/");
  }, [user, loading, navigate]);

  const refreshAll = () => {
    stats.refetch();
    usersQuery.refetch();
    gamesQuery.refetch();
    roomsQuery.refetch();
    infractionsQuery.refetch();
    rankingQuery.refetch();
    botsQuery.refetch();
  };

  const users = usersQuery.data ?? [];
  const rooms = roomsQuery.data ?? [];
  const games = gamesQuery.data ?? [];
  const infractions = infractionsQuery.data ?? [];
  const ranking = rankingQuery.data ?? [];
  const bots = botsQuery.data ?? [];
  const humanUsers = users.filter((item: any) => item.loginMethod !== "bot");

  const systemCards = useMemo(
    () => [
      { label: "Autenticação", value: "Local + sessão", icon: Lock, hint: "Login por senha e usuário local" },
      { label: "Salas públicas", value: "Automáticas", icon: House, hint: "O sistema mantém mesas abertas no lobby" },
      { label: "Bots padrão", value: `${bots.length}/3`, icon: Bot, hint: "Jogadores automáticos fora do ranking" },
      { label: "Persistência", value: "Local store", icon: Database, hint: "Dados salvos em data/local-store.json quando sem banco" },
    ],
    [bots.length],
  );

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Carregando...</div>;
  if (!isAdmin) return null;

  const statCards = [
    { label: "Contas", value: stats.data?.totalUsers ?? 0, hint: "Usuários humanos cadastrados", icon: Users, section: "usuarios" as const },
    { label: "Partidas", value: stats.data?.totalGames ?? 0, hint: "Histórico de jogos", icon: Gamepad2, section: "partidas" as const },
    { label: "Salas no lobby", value: stats.data?.activeRooms ?? 0, hint: "Aguardando jogadores agora", icon: House, section: "salas" as const },
    { label: "Salas em partida", value: stats.data?.playingRooms ?? 0, hint: "Mesas jogando agora", icon: Gamepad2, section: "salas" as const },
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-white/10 bg-slate-900 p-4 shadow-2xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-black">
              <UserCog className="h-8 w-8 text-red-400" />
              Painel Administrativo
            </h1>
            <p className="mt-1 text-sm text-slate-300">Configurações, usuários, salas, partidas, moderação e relatórios do sistema.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => navigate("/lobby")}>Lobby</Button>
            <Button variant="outline" className="border-emerald-300/20 bg-emerald-500/10 text-emerald-50 hover:bg-emerald-500/20" onClick={refreshAll}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {statCards.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" onClick={() => setActiveSection(item.section)} className="text-left">
                <Card className="border-slate-700 bg-slate-900 text-white transition hover:border-emerald-300/60 hover:bg-slate-800">
                  <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                    {item.label}
                    <Icon className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="text-3xl font-black">{item.value}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.hint}</div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </section>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-xl border border-white/10 bg-slate-900 p-3">
            <div className="mb-3 flex items-center gap-2 px-2 text-sm font-black text-slate-200">
              <Settings className="h-4 w-4 text-emerald-300" />
              Configurações
            </div>
            <div className="space-y-2">
              {ADMIN_MENU.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${active ? "border-emerald-300 bg-emerald-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`mt-0.5 h-5 w-5 ${active ? "text-emerald-200" : "text-slate-300"}`} />
                      <div className="min-w-0">
                        <div className="font-black">{item.label}</div>
                        <div className="text-xs text-slate-400">{item.description}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.subitems.map((subitem) => (
                            <span key={subitem} className="rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-slate-300">
                              {subitem}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="space-y-4">
            {activeSection === "usuarios" && (
              <UsersSection
                users={humanUsers}
                onBlock={(userId) => blockUserMutation.mutate({ userId, durationMinutes: 60, reason: "Bloqueio administrativo" })}
                onUnblock={(userId) => unblockUserMutation.mutate(userId)}
                onResetPassword={(userId) => resetPasswordMutation.mutate(userId)}
              />
            )}
            {activeSection === "salas" && <RoomsSection rooms={rooms} stats={stats.data} />}
            {activeSection === "partidas" && <GamesSection games={games} stats={stats.data} />}
            {activeSection === "moderacao" && <ModerationSection infractions={infractions} stats={stats.data} />}
            {activeSection === "ranking" && <RankingSection ranking={ranking} stats={stats.data} />}
            {activeSection === "sistema" && <SystemSection cards={systemCards} rooms={rooms} bots={bots} />}
            {activeSection === "seguranca" && <SecuritySection users={humanUsers} />}
          </main>
        </div>
      </div>
    </div>
  );
}

function PanelCard({ title, icon: Icon, children }: { title: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <Card className="border-slate-700 bg-slate-900 text-white">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Icon className="h-5 w-5 text-emerald-300" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">{children}</CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-400">{text}</div>;
}

function UsersSection({
  users,
  onBlock,
  onUnblock,
  onResetPassword,
}: {
  users: any[];
  onBlock: (userId: number) => void;
  onUnblock: (userId: number) => void;
  onResetPassword: (userId: number) => void;
}) {
  return (
    <PanelCard title="Contas cadastradas" icon={Users}>
      {users.length === 0 ? <EmptyState text="Nenhum usuário cadastrado." /> : users.map((item) => (
        <div key={item.id} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <div className="font-black">{item.name || `Usuário ${item.id}`}</div>
            <div className="text-sm text-slate-400">Login: {item.email || "Sem e-mail"} | método {item.loginMethod || "n/d"}</div>
            <div className="mt-1 text-xs text-slate-500">Senha: protegida. Use redefinir para gerar senha temporária.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-md bg-sky-500/15 px-2 py-1 text-sky-100">Permissão: {item.role}</span>
            <span className={`rounded-md px-2 py-1 ${item.isOnline ? "bg-emerald-500/15 text-emerald-100" : "bg-slate-500/15 text-slate-200"}`}>{item.isOnline ? "Online" : "Offline"}</span>
            <span className={`rounded-md px-2 py-1 ${item.isPlaying ? "bg-amber-500/15 text-amber-100" : "bg-emerald-500/15 text-emerald-100"}`}>{item.isPlaying ? "Jogando" : "Disponível"}</span>
            <span className={`rounded-md px-2 py-1 ${item.blockedUntil && new Date(item.blockedUntil) > new Date() ? "bg-red-500/15 text-red-100" : "bg-slate-500/15 text-slate-200"}`}>
              {item.blockedUntil && new Date(item.blockedUntil) > new Date() ? "Bloqueado" : "Liberado"}
            </span>
            <Button size="sm" variant="outline" className="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => onResetPassword(item.id)}>
              Reenviar senha
            </Button>
            {item.blockedUntil && new Date(item.blockedUntil) > new Date() ? (
              <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-500" onClick={() => onUnblock(item.id)}>
                Desbloquear
              </Button>
            ) : (
              <Button size="sm" className="h-8 bg-red-600 hover:bg-red-500" disabled={item.role === "admin"} onClick={() => onBlock(item.id)}>
                Bloquear
              </Button>
            )}
          </div>
        </div>
      ))}
    </PanelCard>
  );
}

function RoomsSection({ rooms, stats }: { rooms: any[]; stats: any }) {
  const currentRooms = rooms.filter((room) => room.status === "waiting" || room.status === "playing");
  const lobbyRooms = currentRooms.filter((room) => room.status === "waiting");
  const playingRooms = currentRooms.filter((room) => room.status === "playing");
  const privateRooms = currentRooms.filter((room) => room.isPrivate);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MiniMetric label="No lobby" value={stats?.activeRooms ?? lobbyRooms.length} icon={House} hint="Salas aguardando jogadores" />
        <MiniMetric label="Em partida" value={stats?.playingRooms ?? playingRooms.length} icon={Gamepad2} hint="Salas com jogo iniciado" />
        <MiniMetric label="Privadas" value={stats?.privateRooms ?? privateRooms.length} icon={Lock} hint="Criadas por jogadores/admin" />
        <MiniMetric label="Públicas" value={stats?.publicRooms ?? lobbyRooms.filter((room) => !room.isPrivate).length} icon={Server} hint="Reposição automática" />
      </div>
      <PanelCard title="Salas ativas no momento atual" icon={House}>
      {currentRooms.length === 0 ? <EmptyState text="Nenhuma sala ativa agora." /> : currentRooms.map((room) => (
        <div key={room.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="font-black">{room.name}</div>
              <div className="text-sm text-slate-400">Sala #{room.id} | criada por usuário #{room.createdBy ?? "n/d"}</div>
              {room.isPrivate && room.createdAt && (
                <div className="mt-1 text-xs text-amber-100">Sala privada expira 24h após criação.</div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-emerald-100">{room.currentPlayers}/{room.maxPlayers} jogadores</span>
              <span className="rounded-md bg-sky-500/15 px-2 py-1 text-sky-100">{room.isPrivate ? "Privada" : "Pública"}</span>
              <span className="rounded-md bg-amber-500/15 px-2 py-1 text-amber-100">Status: {room.status}</span>
              <span className="rounded-md bg-purple-500/15 px-2 py-1 text-purple-100">Bot: {room.allowBot ? "sim" : "não"}</span>
            </div>
          </div>
          {room.status === "playing" && (
            <div className="mt-3 rounded-lg border border-emerald-300/15 bg-emerald-500/10 p-3">
              <div className="mb-2 text-xs font-black uppercase text-emerald-100">Jogadores nesta partida</div>
              <div className="grid gap-2 md:grid-cols-2">
                {(room.players ?? []).length === 0 ? (
                  <div className="text-sm text-slate-300">Sem jogadores carregados para esta sala.</div>
                ) : (
                  room.players.map((player: any) => (
                    <div key={`${room.id}-${player.userId}-${player.seatPosition}`} className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm">
                      <div className="font-semibold">{player.seatPosition} - {player.name || `Jogador ${player.userId}`}</div>
                      <div className="text-xs text-slate-400">
                        {player.email || "Sem e-mail"} | {player.loginMethod === "bot" ? "Bot padrão" : player.isOnline ? "Online" : "Offline"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      </PanelCard>
    </div>
  );
}

function GamesSection({ games, stats }: { games: any[]; stats: any }) {
  const playingGames = games.filter((game) => game.status === "playing");
  const completedGames = games.filter((game) => game.status === "finished");
  const abandonedGames = games.filter((game) => game.status === "abandoned");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MiniMetric label="Realizadas" value={stats?.totalGames ?? games.length} icon={BarChart3} hint="Total registrado" />
        <MiniMetric label="Em andamento" value={stats?.playingGames ?? playingGames.length} icon={Gamepad2} hint="Jogando agora" />
        <MiniMetric label="Completadas" value={stats?.completedGames ?? completedGames.length} icon={Trophy} hint="Finalizadas normalmente" />
        <MiniMetric label="Encerradas" value={stats?.abandonedGames ?? abandonedGames.length} icon={AlertCircle} hint="Fechadas ou abandonadas" />
      </div>

      <PanelCard title="Partidas e histórico" icon={Gamepad2}>
        {games.length === 0 ? <EmptyState text="Nenhuma partida registrada." /> : games.map((game) => (
          <div key={game.gameId ?? game.id} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="font-black">Partida #{game.gameId ?? game.id}</div>
              <div className="text-sm text-slate-400">Sala {game.roomName || game.roomId || "n/d"}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-md bg-amber-500/15 px-2 py-1 text-amber-100">Status: {game.status}</span>
              <span className="rounded-md bg-sky-500/15 px-2 py-1 text-sky-100">Rodada: {game.roundNumber ?? 1}</span>
              <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-emerald-100">Jogador atual: {(game.currentPlayerIndex ?? 0) + 1}</span>
            </div>
          </div>
        ))}
      </PanelCard>
    </div>
  );
}

function ModerationSection({ infractions, stats }: { infractions: any[]; stats: any }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <MiniMetric label="Usuários bloqueados" value={stats?.blockedUsers ?? 0} icon={Lock} />
        <MiniMetric label="Infrações totais" value={stats?.totalInfractions ?? 0} icon={AlertCircle} />
      </div>
      <PanelCard title="Histórico de infrações" icon={Shield}>
        {infractions.length === 0 ? <EmptyState text="Nenhuma infração registrada." /> : infractions.map((item) => (
          <div key={item.id} className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <div className="font-black">{item.userName || `Usuário ${item.userId}`}</div>
            <div className="text-sm text-red-100">{item.reason || "Linguagem ofensiva no chat"}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-red-100">
              <span>Penalidade: {item.blockDuration}</span>
              <span>Ocorrência: {item.infractionCount}</span>
            </div>
          </div>
        ))}
      </PanelCard>
    </div>
  );
}

function RankingSection({ ranking, stats }: { ranking: any[]; stats: any }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MiniMetric label="Partidas" value={stats?.totalGames ?? 0} icon={Gamepad2} />
        <MiniMetric label="Usuários" value={stats?.totalUsers ?? 0} icon={Users} />
        <MiniMetric label="Salas ativas" value={stats?.activeRooms ?? 0} icon={House} />
      </div>
      <PanelCard title="Top jogadores" icon={Trophy}>
        {ranking.length === 0 ? <EmptyState text="Ranking ainda sem dados." /> : ranking.map((player) => (
          <div key={player.userId} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="font-black">#{player.rank} | {player.userName}</div>
              <div className="text-sm text-slate-400">Nível {player.level} | {player.totalGames} partidas</div>
            </div>
            <div className="text-sm text-slate-300 md:text-right">
              <div>{player.totalWins} vitórias</div>
              <div>{player.winRate}% de aproveitamento</div>
            </div>
          </div>
        ))}
      </PanelCard>
    </div>
  );
}

function SystemSection({ cards, rooms, bots }: { cards: Array<{ label: string; value: string; icon: typeof Users; hint: string }>; rooms: any[]; bots: any[] }) {
  const publicRooms = rooms.filter((room) => !room.isPrivate).length;
  const privateRooms = rooms.filter((room) => room.isPrivate).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => <MiniMetric key={card.label} label={card.label} value={card.value} icon={card.icon} hint={card.hint} />)}
      </div>
      <PanelCard title="Configurações gerais do sistema" icon={Server}>
        <ConfigRow label="Lobby" value="Painel único de salas, com acesso administrativo restrito por perfil." />
        <ConfigRow label="Salas públicas" value={`${publicRooms} públicas cadastradas, criadas automaticamente quando necessário.`} />
        <ConfigRow label="Salas privadas" value={`${privateRooms} privadas cadastradas, visíveis por busca/convite.`} />
        <ConfigRow label="Partidas com bot" value="Três bots padrão entram como jogadores automáticos e não pontuam no ranking." />
        <ConfigRow label="Partida parada" value="Aos 45 segundos sem movimento a partida recebe aviso; com 1 minuto sem movimento a sala e o jogo são encerrados." />
        <ConfigRow label="Atualização do lobby" value="Consultas recorrentes a cada poucos segundos para salas e jogadores online." />
      </PanelCard>
      <PanelCard title="Bots padrão do jogo" icon={Bot}>
        {bots.map((bot) => (
          <div key={bot.id} className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-4">
            <div className="font-black">{bot.name}</div>
            <div className="text-sm text-amber-100">{bot.email}</div>
            <div className="mt-1 text-xs text-amber-100/80">Jogador automático padrão | fora do ranking | sem senha de usuário.</div>
          </div>
        ))}
      </PanelCard>
    </div>
  );
}

function SecuritySection({ users }: { users: any[] }) {
  const admins = users.filter((item) => item.role === "admin");
  return (
    <PanelCard title="Segurança e acesso administrativo" icon={Lock}>
      <ConfigRow label="Proteção do painel" value="A rota administrativa exige usuário autenticado com perfil admin no backend." />
      <ConfigRow label="Administradores" value={`${admins.length} usuário(s) com permissão administrativa.`} />
      <ConfigRow label="Sessões" value="Usuários locais são marcados como online ao entrar e offline ao sair/recarregar conforme o fluxo de logout." />
      <ConfigRow label="Credenciais" value="Senhas não são exibidas no painel; use recuperação ou redefinição administrativa quando necessário." />
      <div className="mt-2 space-y-2">
        {admins.map((admin) => (
          <div key={admin.id} className="rounded-lg border border-red-300/20 bg-red-500/10 p-3 text-sm">
            <div className="font-black">{admin.name}</div>
            <div className="text-red-100">{admin.email || "Sem e-mail"}</div>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

function MiniMetric({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: typeof Users; hint?: string }) {
  return (
    <Card className="border-slate-700 bg-slate-900 text-white">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
          {label}
          <Icon className="h-5 w-5 text-emerald-300" />
        </div>
        <div className="text-2xl font-black">{value}</div>
        {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-black text-slate-100">{label}</div>
      <div className="mt-1 text-sm text-slate-300">{value}</div>
    </div>
  );
}
