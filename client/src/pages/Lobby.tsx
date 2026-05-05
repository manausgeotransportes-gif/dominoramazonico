import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Bot,
  Calendar,
  Check,
  Crown,
  Globe2,
  Lock,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sun,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import ProfileSettingsDialog from "@/components/ProfileSettingsDialog";
import { getCompetitiveTier, loadPlayerProfile, profileFromUser, resolvePlayerAvatar, savePlayerProfile } from "@/lib/playerProfile";

type RoomFilter = "public" | "private";
type LobbyAppearance = "light" | "dark";

const APPEARANCES: Record<
  LobbyAppearance,
  {
    label: string;
    description: string;
    icon: typeof Palette;
    root: string;
    shell: string;
    card: string;
    panel: string;
    muted: string;
    field: string;
    softTile: string;
    subtleButton: string;
    preview: string;
  }
> = {
  light: {
    label: "Modelo claro",
    description: "Painel mais leve",
    icon: Sun,
    root: "bg-[radial-gradient(circle_at_top,#e5f6ee_0%,#f8fafc_48%,#dfece5_100%)] text-slate-950",
    shell: "border-emerald-700/15 bg-white/90 text-slate-950 shadow-emerald-900/10",
    card: "border-emerald-700/15 bg-white/88 text-slate-950 shadow-emerald-900/10",
    panel: "border-emerald-700/15 bg-white/70 shadow-emerald-900/10",
    muted: "text-slate-700",
    field: "border-emerald-900/15 bg-white text-slate-950 placeholder:text-slate-500",
    softTile: "border-emerald-900/15 bg-emerald-50 text-emerald-950",
    subtleButton: "border-emerald-900/15 bg-white/70 text-slate-950 hover:bg-emerald-50",
    preview: "from-emerald-200 via-white to-slate-200",
  },
  dark: {
    label: "Modelo escuro",
    description: "Mesa noturna",
    icon: Moon,
    root: "bg-[radial-gradient(circle_at_top,#172033_0%,#060812_50%,#000000_100%)] text-white",
    shell: "border-sky-300/15 bg-black/88 text-white shadow-sky-950/30",
    card: "border-sky-300/15 bg-slate-950/90 text-white shadow-sky-950/20",
    panel: "border-sky-300/15 bg-white/5 shadow-sky-950/20",
    muted: "text-slate-400",
    field: "border-sky-300/15 bg-white/5 text-white placeholder:text-slate-500",
    softTile: "border-sky-300/15 bg-sky-500/10 text-sky-100",
    subtleButton: "border-white/20 bg-white/5 text-white hover:bg-white/10",
    preview: "from-sky-500 via-slate-950 to-black",
  },
};

function cleanRoomName(name: string) {
  return name.replace(/^Mesa Pública\s+/i, "");
}

export default function Lobby() {
  const { user, isAuthenticated } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/" });
  const [, navigate] = useLocation();
  const pendingCreateModeRef = useRef<"private" | "bot">("private");
  const [roomName, setRoomName] = useState("");
  const [allowBot, setAllowBot] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("public");
  const [selectedRoom, setSelectedRoom] = useState<{ roomId: number; position: number | null } | null>(null);
  const [waitingRoom, setWaitingRoom] = useState<{ roomId: number; position: number | null } | null>(null);
  const [playerProfile, setPlayerProfile] = useState(loadPlayerProfile());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [appearance, setAppearance] = useState<LobbyAppearance>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem("domino_lobby_appearance");
    return stored === "light" || stored === "dark" ? stored : "dark";
  });
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);

  const playerAvatar = resolvePlayerAvatar(playerProfile);
  const rankingQuery = trpc.ranking.getPlayerRanking.useQuery(undefined, { enabled: isAuthenticated });
  const topPlayersQuery = trpc.ranking.getTopPlayers.useQuery(undefined, { enabled: isAuthenticated });
  const publicRoomsQuery = trpc.rooms.listOpenRooms.useQuery({ limit: 60, onlyPublic: true }, { refetchInterval: 3000 });
  const privateRoomsQuery = trpc.rooms.searchPrivateRooms.useQuery(searchQuery, { enabled: roomFilter === "private" });
  const waitingRoomQuery = trpc.rooms.getRoomById.useQuery(waitingRoom?.roomId ?? 0, {
    enabled: Boolean(waitingRoom?.roomId),
    refetchInterval: 2000,
    retry: false,
  });
  const friendsQuery = trpc.friends.listFriends.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 5000 });
  const availableUsersQuery = trpc.friends.listAvailableUsers.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 5000 });

  const sendInviteMutation = trpc.friends.sendInvite.useMutation({
    onSuccess: () => toast.success("Convite enviado ao amigo."),
    onError: (error) => toast.error(error.message || "Não foi possível enviar o convite"),
  });

  const createRoomMutation = trpc.rooms.createRoom.useMutation({
    onSuccess: (data) => {
      if (selectedFriendId) sendInviteMutation.mutate({ toUserId: selectedFriendId, gameId: data.roomId });
      if (pendingCreateModeRef.current === "bot") {
        toast.success("Sala com bots criada. Iniciando a partida.");
        navigate(`/game/${data.roomId}`);
        return;
      }
      toast.success("Sala privada criada. Aguardando na sala.");
      setWaitingRoom({ roomId: data.roomId, position: 1 });
      setSelectedRoom(null);
      setRoomName("");
      setAllowBot(false);
      setSelectedFriendId(null);
      setRoomFilter("private");
      setSearchQuery("");
      publicRoomsQuery.refetch();
      privateRoomsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Erro ao criar sala"),
  });

  const joinRoomMutation = trpc.rooms.joinRoom.useMutation({
    onSuccess: (data) => {
      const joinedRoomIsReady =
        data.status === "playing" ||
        (typeof data.currentPlayers === "number" && typeof data.maxPlayers === "number" && data.currentPlayers >= data.maxPlayers);
      if (joinedRoomIsReady) {
        toast.success("Mesa completa. Iniciando a partida.");
        navigate(`/game/${data.roomId}`);
        return;
      }
      toast.success(data.position ? `Aguardando na sala, posição ${data.position}.` : "Aguardando na sala.");
      setWaitingRoom({ roomId: data.roomId, position: data.position ?? null });
      publicRoomsQuery.refetch();
      privateRoomsQuery.refetch();
      setSelectedRoom(null);
    },
    onError: (error) => toast.error(error.message || "Erro ao entrar na sala"),
  });

  const rooms = useMemo(() => {
    const base = roomFilter === "public" ? publicRoomsQuery.data ?? [] : privateRoomsQuery.data ?? [];
    return base
      .filter((room: any) => room.status === "waiting" || room.currentPlayers < room.maxPlayers)
      .sort((a: any, b: any) => b.currentPlayers - a.currentPlayers || a.id - b.id);
  }, [roomFilter, publicRoomsQuery.data, privateRoomsQuery.data]);

  const friends = friendsQuery.data ?? [];
  const onlinePlayers = availableUsersQuery.data?.filter((player: any) => player.isOnline) ?? [];
  const tier = getCompetitiveTier(rankingQuery.data?.totalPoints ?? 0);
  const theme = APPEARANCES[appearance];

  useEffect(() => {
    window.localStorage.setItem("domino_lobby_appearance", appearance);
  }, [appearance]);

  useEffect(() => {
    if (!user) return;
    const persistedProfile = profileFromUser(user);
    savePlayerProfile(persistedProfile);
    setPlayerProfile(persistedProfile);
  }, [user]);

  useEffect(() => {
    if (!selectedRoom) return;
    if (rooms.some((room: any) => room.id === selectedRoom.roomId)) return;
    setSelectedRoom(null);
  }, [rooms, selectedRoom]);

  useEffect(() => {
    const room = waitingRoomQuery.data;
    if (!waitingRoom || !room) return;

    if (room.status === "playing" || room.currentPlayers >= room.maxPlayers) {
      toast.success("Mesa completa. Iniciando a partida.");
      navigate(`/game/${waitingRoom.roomId}`);
    }
  }, [navigate, waitingRoom, waitingRoomQuery.data]);

  const createConfiguredRoom = (mode: "private" | "bot") => {
    pendingCreateModeRef.current = mode;
    createRoomMutation.mutate({
      name: roomName || `Sala privada de ${user?.name || "Jogador"}`,
      isPrivate: true,
      allowBot: mode === "bot" || allowBot,
    });
  };

  const refreshAll = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        publicRoomsQuery.refetch(),
        privateRoomsQuery.refetch(),
        rankingQuery.refetch(),
        topPlayersQuery.refetch(),
        friendsQuery.refetch(),
        availableUsersQuery.refetch(),
      ]);
      toast.success("Painel atualizado.");
    } catch {
      toast.error("Não foi possível atualizar agora.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className={`min-h-screen px-3 py-4 sm:px-5 lg:px-6 ${theme.root}`}>
      <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <Card className={`overflow-hidden shadow-2xl ${theme.shell}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <img src={playerAvatar} alt="Avatar do jogador" className="h-12 w-12 rounded-xl object-cover ring-2 ring-emerald-300/30" />
                  <div className="min-w-0">
                    <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${appearance === "light" ? "text-emerald-800" : "text-emerald-200"}`}>Perfil</div>
                    <div className="truncate text-lg font-black">{playerProfile.displayName || user?.name || "Jogador"}</div>
                  </div>
                </div>
                <div className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${tier.surface} ${tier.tone}`}>{tier.label}</div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <StatTile label="Ranking" value={rankingQuery.data?.rank ?? "--"} tone="emerald" appearance={appearance} />
                <StatTile label="Pontos" value={rankingQuery.data?.totalPoints ?? 0} tone="amber" appearance={appearance} />
                <StatTile label="Vitórias" value={rankingQuery.data?.totalWins ?? 0} tone="sky" appearance={appearance} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <ProfileSettingsDialog
                  profile={playerProfile}
                  onSave={(profile) => {
                    savePlayerProfile(profile);
                    setPlayerProfile(profile);
                    toast.success("Perfil atualizado!");
                  }}
                  triggerLabel="Editar perfil"
                  className={`h-10 ${appearance === "light" ? "border-emerald-900/15 bg-emerald-50 text-emerald-950 hover:bg-emerald-100" : "border-emerald-300/20 bg-emerald-500/10 text-emerald-50 hover:bg-emerald-500/20"}`}
                />
                <Link href="/ranking">
                  <Button variant="outline" className={`h-10 w-full ${appearance === "light" ? "border-amber-900/15 bg-amber-50 text-amber-950 hover:bg-amber-100" : "border-amber-300/20 bg-amber-500/10 text-amber-50 hover:bg-amber-500/20"}`}>
                    <Trophy className="mr-2 h-4 w-4" />
                    Ranking
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className={`shadow-xl ${theme.shell}`}>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5 text-emerald-300" />
                Criar sala privada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3 pt-1">
              <Input
                placeholder="Nome da sala"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                className={`h-10 ${theme.field}`}
              />

              <label className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold ${theme.subtleButton}`}>
                <span className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-amber-300" />
                  Permitir jogar com bot
                </span>
                <input type="checkbox" checked={allowBot} onChange={(event) => setAllowBot(event.target.checked)} />
              </label>

              <select
                value={selectedFriendId ?? ""}
                onChange={(event) => setSelectedFriendId(event.target.value ? Number(event.target.value) : null)}
                className={`h-10 w-full rounded-md px-3 text-sm ${appearance === "light" ? "border border-emerald-900/15 bg-white text-slate-950" : "border border-emerald-300/15 bg-slate-950 text-white"}`}
              >
                <option value="">Convidar amigo depois</option>
                {friends.map((friend: any) => (
                  <option key={friend.id} value={friend.id}>
                    {friend.name} - {friend.statusLabel}
                  </option>
                ))}
              </select>

              <Button className="h-10 w-full bg-emerald-600 font-semibold hover:bg-emerald-500" onClick={() => createConfiguredRoom("private")}>
                    {createRoomMutation.isPending ? "Criando..." : "Criar sala privada"}
              </Button>
              <Button variant="outline" className={`h-10 w-full ${appearance === "light" ? "border-amber-900/15 bg-amber-50 text-amber-950 hover:bg-amber-100" : "border-amber-400/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"}`} onClick={() => createConfiguredRoom("bot")}>
                <Bot className="mr-2 h-4 w-4" />
                Jogar com bot
              </Button>
            </CardContent>
          </Card>

          <Card className={`shadow-xl ${theme.shell}`}>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Crown className="h-5 w-5 text-amber-300" />
                Ranking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-1">
              {(topPlayersQuery.data ?? []).slice(0, 4).map((player: any) => (
                <div key={player.userId} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${theme.subtleButton}`}>
                  <span className="truncate font-semibold">{player.rank} {player.userName}</span>
                  <span className={appearance === "light" ? "text-emerald-800" : "text-emerald-200"}>{player.totalWins}V</span>
                </div>
              ))}
              {(topPlayersQuery.data ?? []).length === 0 && <div className={`rounded-lg p-3 text-sm ${theme.subtleButton}`}>Ranking ainda sem dados.</div>}
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-3">
          <section className={`rounded-2xl border p-3 shadow-xl backdrop-blur ${theme.shell}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h1 className="text-2xl font-black sm:text-3xl">Salas disponíveis</h1>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className={`h-10 ${theme.subtleButton}`} disabled={isRefreshing} onClick={refreshAll}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "Atualizando..." : "Atualizar"}
                </Button>
                {user?.role === "admin" && (
                  <Link href="/admin">
                    <Button variant="outline" className={`h-10 ${appearance === "light" ? "border-red-900/15 bg-red-50 text-red-950 hover:bg-red-100" : "border-red-300/20 bg-red-500/10 text-red-50 hover:bg-red-500/20"}`}>
                      <Shield className="mr-2 h-4 w-4" />
                      Administrador
                    </Button>
                  </Link>
                )}
                <Link href="/friends">
                  <Button variant="outline" className={`h-10 ${appearance === "light" ? "border-emerald-900/15 bg-emerald-50 text-emerald-950 hover:bg-emerald-100" : "border-emerald-300/20 bg-emerald-500/10 text-emerald-50 hover:bg-emerald-500/20"}`}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Amigos
                  </Button>
                </Link>
                <Link href="/agenda">
                  <Button variant="outline" className={`h-10 ${appearance === "light" ? "border-amber-900/15 bg-amber-50 text-amber-950 hover:bg-amber-100" : "border-amber-300/20 bg-amber-500/10 text-amber-50 hover:bg-amber-500/20"}`}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Agenda
                  </Button>
                </Link>
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    className={`h-10 font-semibold backdrop-blur ${theme.subtleButton}`}
                    onClick={() => setIsAppearanceOpen((current) => !current)}
                  >
                    <Palette className="mr-2 h-4 w-4" />
                    Aparência
                  </Button>

                  {isAppearanceOpen && (
                    <div className={`absolute right-0 top-12 z-30 w-80 rounded-2xl border p-3 shadow-2xl backdrop-blur ${theme.shell}`}>
                      <div className="mb-2 text-sm font-black">Escolha o modelo</div>
                      <div className="grid gap-2">
                        {(Object.entries(APPEARANCES) as Array<[LobbyAppearance, typeof APPEARANCES.light]>).map(([key, option]) => {
                          const Icon = option.icon;
                          const selected = appearance === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                setAppearance(key);
                                setIsAppearanceOpen(false);
                              }}
                              className={`grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-xl border p-2 text-left transition ${selected ? "border-emerald-400 bg-emerald-500/15" : theme.subtleButton}`}
                            >
                              <div className={`h-10 rounded-lg bg-gradient-to-br ${option.preview}`} />
                              <div>
                                <div className="flex items-center gap-2 text-sm font-black">
                                  <Icon className="h-4 w-4" />
                                  {option.label}
                                </div>
                                <div className="text-xs opacity-70">{option.description}</div>
                              </div>
                              {selected && <Check className="h-4 w-4 text-emerald-300" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <div className={`rounded-2xl border p-2 shadow-xl backdrop-blur ${theme.panel}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-2">
                  <button onClick={() => setRoomFilter("public")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${roomFilter === "public" ? "bg-emerald-600 text-white" : theme.subtleButton}`}>
                    Públicas
                  </button>
                  <button onClick={() => setRoomFilter("private")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${roomFilter === "private" ? "bg-emerald-600 text-white" : theme.subtleButton}`}>
                    Privadas
                  </button>
                </div>
                {roomFilter === "private" && (
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input placeholder="Buscar sala privada..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className={`h-10 pl-10 ${theme.field}`} />
                  </div>
                )}
              </div>

              {selectedRoom && (
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="outline" className="h-9" onClick={() => setSelectedRoom(null)}>
                    Cancelar seleção
                  </Button>
                  <div className={`text-sm ${theme.muted}`}>Sala selecionada: #{selectedRoom.roomId} {selectedRoom.position ? `- posição ${selectedRoom.position}` : "(sem posição)"}</div>
                </div>
              )}

              {waitingRoom && (
                <div className={`mt-2 rounded-xl border px-3 py-2 text-sm font-semibold ${theme.subtleButton}`}>
                  Você está aguardando na sala #{waitingRoom.roomId}
                  {waitingRoom.position ? `, posição ${waitingRoom.position}` : ""}. Escolha outra sala se quiser trocar para completar uma mesa diferente.
                </div>
              )}

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {rooms.length === 0 ? (
                  <Card className={`col-span-full ${theme.card}`}>
                    <CardContent className={`py-12 text-center ${theme.muted}`}>Nenhuma sala disponível agora. Crie uma sala ou atualize a lista.</CardContent>
                  </Card>
                ) : (
                  rooms.map((room: any, idx: number) => {
                    const selectedPosition = selectedRoom && selectedRoom.roomId === room.id ? selectedRoom.position : null;
                    const waitingPosition = waitingRoom && waitingRoom.roomId === room.id ? waitingRoom.position : null;

                    return (
                      <RoomPanel
                        key={`${room.id}-${idx}`}
                        room={room}
                        theme={theme}
                        selectedPosition={selectedPosition}
                        waitingPosition={waitingPosition}
                        isJoining={joinRoomMutation.isPending}
                        onSelectPosition={(position) =>
                          setSelectedRoom((current) =>
                            current && current.roomId === room.id && current.position === position
                              ? null
                              : { roomId: room.id, position },
                          )
                        }
                        onJoin={() => joinRoomMutation.mutate({ roomId: room.id, position: selectedPosition ?? undefined })}
                      />
                    );
                  })
                )}
              </div>
            </div>

            <Card className={`shadow-xl ${theme.card}`}>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-emerald-300" />
                  Jogadores online
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-1">
                {onlinePlayers.slice(0, 6).map((player: any) => (
                  <div key={player.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${theme.subtleButton}`}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{player.name}</div>
                      <div className={appearance === "light" ? "text-xs text-emerald-800" : "text-xs text-emerald-200"}>
                        {player.isPlaying ? "Jogando" : "Disponível"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-500"
                      onClick={() => {
                        setSelectedFriendId(player.id);
                        toast.info("Amigo selecionado. Crie a sala privada para enviar o convite.");
                      }}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {onlinePlayers.length === 0 && <div className={`rounded-lg p-3 text-sm ${theme.subtleButton}`}>Nenhum jogador online agora.</div>}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone, appearance }: { label: string; value: string | number; tone: "emerald" | "amber" | "sky"; appearance: LobbyAppearance }) {
  const styles = {
    emerald: appearance === "dark" ? "border-emerald-300/15 bg-emerald-500/10 text-emerald-100" : "border-emerald-300/15 bg-emerald-500/10 text-emerald-800",
    amber: appearance === "dark" ? "border-amber-300/15 bg-amber-500/10 text-amber-100" : "border-amber-300/15 bg-amber-500/10 text-amber-800",
    sky: appearance === "dark" ? "border-sky-300/15 bg-sky-500/10 text-sky-100" : "border-sky-300/15 bg-sky-500/10 text-sky-800",
  };

  return (
    <div className={`rounded-xl border p-3 ${styles[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</div>
      <div className={`mt-1 text-2xl font-black ${appearance === "dark" ? "text-white" : "text-slate-950"}`}>{value}</div>
    </div>
  );
}

function RoomPanel({
  room,
  theme,
  selectedPosition,
  waitingPosition,
  isJoining,
  onSelectPosition,
  onJoin,
}: {
  room: any;
  theme: typeof APPEARANCES.light;
  selectedPosition: number | null;
  waitingPosition: number | null;
  isJoining: boolean;
  onSelectPosition: (position: number) => void;
  onJoin: () => void;
}) {
  const roomPlayersQuery = trpc.rooms.getRoomPlayers.useQuery(room.id, {
    refetchInterval: 3000,
  });
  const waitingPlayers = roomPlayersQuery.data ?? [];
  const slots = Array.from({ length: room.maxPlayers ?? 4 }, (_, index) => {
    const position = index + 1;
    return waitingPlayers.find((player: any) => (player.seatPosition ?? player.id) === position);
  });
  const isFull = room.currentPlayers >= room.maxPlayers;
  const isLight = theme === APPEARANCES.light;
  const selectedSlotAvailable = selectedPosition ? !slots[selectedPosition - 1] : false;
  const isWaitingHere = Boolean(waitingPosition);

  return (
    <Card className={`shadow-lg transition hover:border-emerald-400/35 ${theme.card}`}>
      <CardContent className="p-2.5">
        <div className="min-w-0 leading-tight">
          <div className="truncate text-lg font-black">{cleanRoomName(room.name)}</div>
          <div className={`mt-0.5 flex items-center gap-2 text-xs ${theme.muted}`}>
            {room.isPrivate ? <Lock className="h-3.5 w-3.5 text-amber-300" /> : <Globe2 className="h-3.5 w-3.5 text-emerald-300" />}
            {room.isPrivate ? "Privada" : "Pública"}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {slots.map((player: any, index) => {
              const position = index + 1;
              const filled = Boolean(player);
              const selected = selectedPosition === position;
              const waiting = waitingPosition === position;
              const pairLabel = position === 1 || position === 3 ? "Dupla 1" : "Dupla 2";
              const label = filled ? player?.name ?? `Jogador ${position}` : `Posição ${position} - ${pairLabel}`;

              return (
              <button
                key={index}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                title={label}
                disabled={filled || isFull || isWaitingHere}
                onClick={() => {
                  onSelectPosition(position);
                }}
                className={`group relative grid h-8 w-8 place-items-center rounded-md border text-xs font-black outline-none ring-emerald-300/0 transition focus:ring-2 disabled:cursor-default ${
                  waiting
                    ? "border-amber-300 bg-amber-400 text-slate-950"
                    : filled
                    ? "border-emerald-300/40 bg-emerald-500/25 text-emerald-100"
                    : selected
                      ? "border-amber-300 bg-amber-400 text-slate-950"
                      : isLight
                        ? "border-slate-300 bg-white text-slate-700 hover:border-emerald-500"
                        : "border-white/10 bg-white/5 text-slate-200 hover:border-emerald-300/50"
                }`}
              >
                {filled ? <Users className="h-3.5 w-3.5 text-emerald-100" /> : position}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden min-w-28 -translate-x-1/2 whitespace-nowrap rounded-lg border border-emerald-300/20 bg-slate-950 px-2 py-1 text-xs font-semibold text-white shadow-xl group-hover:block group-focus:block">
                  {label}
                </div>
              </button>
              );
            })}
          </div>
          <div className="text-right">
            <div className="text-xl font-black">{room.currentPlayers}/{room.maxPlayers}</div>
            <div className={`text-xs ${theme.muted}`}>jogadores</div>
          </div>
        </div>

          <Button className="mt-3 h-10 w-full bg-emerald-600 font-semibold hover:bg-emerald-500" disabled={isJoining || isFull || isWaitingHere || !selectedSlotAvailable} onClick={onJoin}>
          {isWaitingHere ? "Você está aguardando aqui" : isFull ? "Mesa cheia" : isJoining ? "Aguardando..." : selectedPosition ? `Aguardar na posição ${selectedPosition}` : "Selecione uma posição"}
        </Button>
      </CardContent>
    </Card>
  );
}
