import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Calendar,
  Check,
  Crown,
  Bot,
  Globe2,
  Lock,
  LogOut,
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
  const { user, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/" });
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const pendingCreateModeRef = useRef<"private" | "bot">("private");
  const [roomName, setRoomName] = useState("");
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("public");
  const [selectedRooms, setSelectedRooms] = useState<Record<number, number>>({});
  const [joiningRoomId, setJoiningRoomId] = useState<number | null>(null);
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
  const publicRoomsQuery = trpc.rooms.listOpenRooms.useQuery({ limit: 4, onlyPublic: true }, { refetchInterval: 500 });
  const privateRoomsQuery = trpc.rooms.searchPrivateRooms.useQuery(searchQuery, { enabled: roomFilter === "private", refetchInterval: 1000 });
  const myWaitingRoomQuery = trpc.rooms.getMyWaitingRoom.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 500,
    retry: false,
  });
  const waitingRoomQuery = trpc.rooms.getRoomById.useQuery(waitingRoom?.roomId ?? 0, {
    enabled: Boolean(waitingRoom?.roomId),
    refetchInterval: 500,
    retry: false,
  });
  const friendsQuery = trpc.friends.listFriends.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 3000 });
  const availableUsersQuery = trpc.friends.listAvailableUsers.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 500 });
  const heartbeatMutation = trpc.auth.heartbeat.useMutation();
  const startRoomGameMutation = trpc.games.startRoomGame.useMutation({
    onSuccess: (gameState) => {
      toast.success("Partida com bot iniciada.");
      refreshRoomData(gameState.roomId);
      navigate(`/game/${gameState.roomId}`);
    },
    onError: (error) => toast.error(error.message || "Não foi possível iniciar com bots"),
  });

  const sendInviteMutation = trpc.friends.sendInvite.useMutation({
    onSuccess: () => toast.success("Convite enviado ao amigo."),
    onError: (error) => toast.error(error.message || "Não foi possível enviar o convite"),
  });

  const createRoomMutation = trpc.rooms.createRoom.useMutation({
    onSuccess: (data) => {
      if (selectedFriendId) sendInviteMutation.mutate({ toUserId: selectedFriendId, gameId: data.roomId });
      if (pendingCreateModeRef.current === "bot") {
        toast.success("Preparando mesa com bots.");
        startRoomGameMutation.mutate({ roomId: data.roomId, fillBots: true });
        setRoomName("");
        setSelectedFriendId(null);
        return;
      }
      toast.success("Sala privada criada. Aguardando na sala.");
      setWaitingRoom({ roomId: data.roomId, position: 1 });
      setSelectedRooms({});
      setRoomName("");
      setSelectedFriendId(null);
      setRoomFilter("private");
      setSearchQuery("");
      publicRoomsQuery.refetch();
      privateRoomsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Erro ao criar sala"),
  });

  const refreshRoomData = async (roomId?: number) => {
    await Promise.all([
      utils.rooms.listOpenRooms.invalidate(),
      utils.rooms.searchPrivateRooms.invalidate(),
      utils.rooms.getMyWaitingRoom.invalidate(),
      roomId ? utils.rooms.getRoomPlayers.invalidate(roomId) : utils.rooms.getRoomPlayers.invalidate(),
      roomId ? utils.rooms.getRoomById.invalidate(roomId) : utils.rooms.getRoomById.invalidate(),
      availableUsersQuery.refetch(),
    ]);
  };

  const leaveRoomMutation = trpc.rooms.leaveRoom.useMutation({
    onSuccess: () => {
      toast.success("Você saiu da posição.");
      setWaitingRoom(null);
      setSelectedRooms({});
      setJoiningRoomId(null);
      refreshRoomData();
    },
    onError: (error) => toast.error(error.message || "Erro ao sair da sala"),
  });

  const joinRoomMutation = trpc.rooms.joinRoom.useMutation({
    onSuccess: (data) => {
      console.log(`[JoinRoom] Sucesso:`, data);
      
      // Verifica se é uma ação de saída (quando já estava na sala)
      if ((data as any).action === "left") {
        console.log(`[JoinRoom] Ação: saída da posição`);
        toast.success("Você saiu da posição.");
        setWaitingRoom(null);
        setSelectedRooms({});
        refreshRoomData(data.roomId);
        return;
      }
      
      const joinedRoomIsReady =
        data.status === "playing" ||
        (typeof data.currentPlayers === "number" && typeof data.maxPlayers === "number" && data.currentPlayers >= data.maxPlayers);
      
      if (joinedRoomIsReady) {
        console.log(`[JoinRoom] Sala pronta para jogar`);
        toast.success("Mesa completa. Iniciando a partida.");
        refreshRoomData(data.roomId);
        navigate(`/game/${data.roomId}`);
        return;
      }
      
      console.log(`[JoinRoom] Ação: entrada na sala, posição ${data.position}`);
      toast.success(data.position ? `Aguardando na sala, posição ${data.position}.` : "Aguardando na sala.");
      setWaitingRoom({ roomId: data.roomId, position: data.position ?? null });
      refreshRoomData(data.roomId);
      setSelectedRooms({});
    },
    onError: (error) => {
      console.error(`[JoinRoom] Erro:`, error);
      toast.error(error.message || "Erro ao entrar na sala");
    },
    onSettled: () => setJoiningRoomId(null),
  });

  const rooms = useMemo(() => {
    const base = roomFilter === "public" ? publicRoomsQuery.data ?? [] : privateRoomsQuery.data ?? [];
    return base
      .filter((room: any) => room.status === "waiting" || room.currentPlayers < room.maxPlayers)
      .sort((a: any, b: any) => b.currentPlayers - a.currentPlayers || a.id - b.id);
  }, [roomFilter, publicRoomsQuery.data, privateRoomsQuery.data]);

  const friends = friendsQuery.data ?? [];
  const onlinePlayers = availableUsersQuery.data ?? [];  // Já vem filtrado do servidor
  console.log(`[Lobby] Jogadores online: ${onlinePlayers.length}`, onlinePlayers.map((p: any) => `${p.name} (${p.id})`).join(", "));
  const emptyPublicRoomCards = roomFilter === "public" ? Math.max(0, 4 - rooms.length) : 0;
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
    if (!isAuthenticated) return;
    
    // Enviar heartbeat imediatamente
    heartbeatMutation.mutate();
    
    // Enviar heartbeat frequentemente para manter presence
    const heartbeatTimer = window.setInterval(() => {
      console.log(`[Heartbeat] Enviando presença para manter online...`);
      heartbeatMutation.mutate();
    }, 5_000);
    
    const sendPresenceLogout = async () => {
      console.log(`[Presence] Logout - enviando presença de saída...`);
      const localUserId = window.localStorage.getItem("domino_local_user_id");
      const payload = JSON.stringify({ localUserId: localUserId ? Number(localUserId) : undefined });
      
      if (navigator.sendBeacon) {
        const sent = navigator.sendBeacon("/api/presence/logout", new Blob([payload], { type: "application/json" }));
        if (sent) return;
      }
      
      try {
        await fetch("/api/presence/logout", {
          method: "POST",
          body: payload,
          headers: { "content-type": "application/json" },
          credentials: "include",
          keepalive: true,
        });
      } catch (e) {
        console.error(`[Presence] Erro ao enviar logout:`, e);
      }
    };
    
    const logoutOnExit = async () => {
      await sendPresenceLogout();
      logout().catch(() => undefined);
    };
    
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        console.log(`[Visibility] Aba oculta - enviando logout`);
        sendPresenceLogout();
      } else {
        console.log(`[Visibility] Aba visível - enviando heartbeat`);
        heartbeatMutation.mutate();
      }
    };
    
    window.addEventListener("pagehide", logoutOnExit);
    window.addEventListener("beforeunload", logoutOnExit);
    document.addEventListener("visibilitychange", handleVisibility);
    
    return () => {
      window.clearInterval(heartbeatTimer);
      window.removeEventListener("pagehide", logoutOnExit);
      window.removeEventListener("beforeunload", logoutOnExit);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated, logout, heartbeatMutation]);

  useEffect(() => {
    setSelectedRooms((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([roomId]) => rooms.some((room: any) => room.id === Number(roomId)))
      );
      if (Object.keys(next).length === Object.keys(current).length) return current;
      return next;
    });
  }, [rooms]);

  useEffect(() => {
    const room = myWaitingRoomQuery.data;
    if (!room) {
      setWaitingRoom(null);
      return;
    }
    setWaitingRoom((current) => {
      if (current && current.roomId === room.id && current.position === room.position) return current;
      return { roomId: room.id, position: room.position ?? null };
    });
  }, [myWaitingRoomQuery.data]);

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
    const finalRoomName = roomName.trim() || (mode === "bot" ? `Mesa com bot de ${user?.name || "Jogador"}` : `Sala privada de ${user?.name || "Jogador"}`);
    
    console.log(`[CreateRoom] Iniciando com modo: ${mode}, nome: ${finalRoomName}`);
    
    createRoomMutation.mutate({
      name: finalRoomName,
      isPrivate: true,
      allowBot: mode === "bot",
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
                <Button
                  className={`h-10 ${appearance === "light" ? "border-sky-900/15 bg-sky-50 text-sky-950 hover:bg-sky-100" : "border-sky-300/20 bg-sky-500/10 text-sky-50 hover:bg-sky-500/20"}`}
                  variant="outline"
                  onClick={() => createConfiguredRoom("bot")}
                  disabled={createRoomMutation.isPending || startRoomGameMutation.isPending}
                >
                  <Bot className="mr-2 h-4 w-4" />
                  Jogar com bot
                </Button>
                <Button
                  variant="outline"
                  className={`h-10 ${appearance === "light" ? "border-red-900/15 bg-red-50 text-red-950 hover:bg-red-100" : "border-red-300/20 bg-red-500/10 text-red-50 hover:bg-red-500/20"}`}
                  onClick={async () => {
                    await logout();
                    setWaitingRoom(null);
                    setSelectedRooms({});
                    navigate("/");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logoff
                </Button>
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
          {/* Painel de ações rápidas */}
          <section className={`rounded-2xl border p-4 shadow-xl backdrop-blur ${theme.shell}`}>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <Button
                className="h-12 bg-sky-600 hover:bg-sky-500 text-white font-bold text-lg"
                onClick={() => createConfiguredRoom("bot")}
                disabled={createRoomMutation.isPending || startRoomGameMutation.isPending}
              >
                <Bot className="mr-3 h-5 w-5" />
                {createRoomMutation.isPending || startRoomGameMutation.isPending ? "Preparando mesa..." : "🎮 Jogar com Bot"}
              </Button>
              <Button
                className="h-12 bg-red-600 hover:bg-red-500 text-white font-bold text-lg"
                onClick={async () => {
                  setWaitingRoom(null);
                  setSelectedRooms({});
                  await logout();
                  navigate("/");
                }}
              >
                <LogOut className="mr-3 h-5 w-5" />
                Sair (Logoff)
              </Button>
            </div>
          </section>

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

{Object.keys(selectedRooms).length > 0 && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button variant="outline" className="h-9" onClick={() => setSelectedRooms({})}>
                      Cancelar seleção
                    </Button>
                    <div className={`text-sm ${theme.muted}`}>
                      Salas selecionadas: {Object.entries(selectedRooms)
                        .map(([roomId, position]) => `#${roomId} - posição ${position}`)
                        .join(", ")}
                    </div>
                </div>
              )}

              {waitingRoom && (
                <div className={`mt-2 rounded-xl border px-3 py-2 text-sm font-semibold ${theme.subtleButton}`}>
                  Você está aguardando na sala #{waitingRoom.roomId}
                  {waitingRoom.position ? `, posição ${waitingRoom.position}` : ""}. Escolha outra sala se quiser trocar para completar uma mesa diferente.
                </div>
              )}

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-4">
                {rooms.length === 0 ? (
                  roomFilter === "public" ? (
                    Array.from({ length: 4 }, (_, index) => (
                      <RoomPlaceholder key={`public-placeholder-${index}`} theme={theme} index={index + 1} />
                    ))
                  ) : (
                    <Card className={`col-span-full ${theme.card}`}>
                      <CardContent className={`py-12 text-center ${theme.muted}`}>Nenhuma sala privada encontrada agora.</CardContent>
                    </Card>
                  )
                ) : (
                  <>
                  {rooms.map((room: any, idx: number) => {
                    const selectedPosition = selectedRooms[room.id] ?? null;
                    const waitingPosition = waitingRoom && waitingRoom.roomId === room.id ? waitingRoom.position : null;

                    return (
                      <RoomPanel
                        key={`${room.id}-${idx}`}
                        room={room}
                        theme={theme}
                        selectedPosition={selectedPosition}
                        waitingPosition={waitingPosition}
                        currentUserId={user?.id ?? null}
                        isJoining={joiningRoomId === room.id && joinRoomMutation.isPending}
                        onSelectPosition={(position) => {
                          if (joinRoomMutation.isPending) return;
                          setSelectedRooms({ [room.id]: position });
                          setJoiningRoomId(room.id);
                          joinRoomMutation.mutate({ roomId: room.id, position });
                        }}
                        onJoin={() => {
                          const isCurrentWaitingRoom = waitingRoom?.roomId === room.id;
                          const isCurrentWaitingPosition = waitingPosition === selectedPosition;
                          
                          // Se já está aguardando nesta posição, sair
                          if (isCurrentWaitingRoom && isCurrentWaitingPosition && selectedPosition) {
                            if (joinRoomMutation.isPending) return;
                            setJoiningRoomId(room.id);
                            // Clicar novamente na mesma posição para deselecionar/sair
                            joinRoomMutation.mutate({ roomId: room.id, position: selectedPosition });
                            return;
                          }
                          
                          if (!selectedPosition || joinRoomMutation.isPending) return;
                          setJoiningRoomId(room.id);
                          joinRoomMutation.mutate({ roomId: room.id, position: selectedPosition });
                        }}
                      />
                    );
                  })}
                  {Array.from({ length: emptyPublicRoomCards }, (_, index) => (
                    <RoomPlaceholder key={`public-empty-${index}`} theme={theme} index={rooms.length + index + 1} />
                  ))}
                  </>
                )}
              </div>
            </div>

            <Card className={`shadow-xl ${theme.card}`}>
              <CardHeader className="flex items-center justify-between p-3 pb-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-emerald-300" />
                  Jogadores online ({onlinePlayers.length})
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6"
                  onClick={() => availableUsersQuery.refetch()}
                  disabled={availableUsersQuery.isRefetching}
                >
                  <RefreshCw className={`h-3 w-3 ${availableUsersQuery.isRefetching ? "animate-spin" : ""}`} />
                </Button>
              </CardHeader>
              <CardContent className="max-h-[calc(100vh-8rem)] space-y-2 overflow-y-auto p-3 pt-1">
                {onlinePlayers.length > 0 ? (
                  onlinePlayers.map((player: any) => (
                    <div key={player.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${theme.subtleButton} transition`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{player.name}{player.id === user?.id ? " (você)" : ""}</div>
                        <div className={`flex items-center gap-1 text-xs ${appearance === "light" ? "text-emerald-800" : "text-emerald-200"}`}>
                          <div className={`h-1.5 w-1.5 rounded-full ${player.isPlaying ? "bg-amber-400" : "bg-emerald-400"}`} />
                          {player.isPlaying ? "Jogando" : "Disponível"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                        disabled={player.isPlaying || player.id === user?.id}
                        onClick={() => {
                          setSelectedFriendId(player.id);
                          toast.info("Amigo selecionado. Crie a sala privada para enviar o convite.");
                        }}
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className={`rounded-lg p-3 text-center text-sm ${theme.subtleButton}`}>
                    <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    <div>Nenhum jogador online agora</div>
                  </div>
                )}
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

function RoomPlaceholder({ theme, index }: { theme: typeof APPEARANCES.light; index: number }) {
  return (
    <Card className={`shadow-lg ${theme.card}`}>
      <CardContent className="p-2.5">
        <div className="min-w-0 leading-tight">
          <div className="truncate text-lg font-black">Mesa pública {index}</div>
          <div className={`mt-0.5 flex items-center gap-2 text-xs ${theme.muted}`}>
            <Globe2 className="h-3.5 w-3.5 text-emerald-300" />
            Preparando sala
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((position) => (
              <div key={position} className="grid h-8 w-8 place-items-center rounded-md border border-dashed border-white/15 bg-white/5 text-xs font-black opacity-70">
                {position}
              </div>
            ))}
          </div>
          <div className="text-right">
            <div className="text-xl font-black">0/4</div>
            <div className={`text-xs ${theme.muted}`}>online</div>
          </div>
        </div>
        <Button className="mt-3 h-10 w-full bg-emerald-600/50 font-semibold" disabled>
          Abrindo mesa...
        </Button>
      </CardContent>
    </Card>
  );
}

function RoomPanel({
  room,
  theme,
  selectedPosition,
  waitingPosition,
  currentUserId,
  isJoining,
  onSelectPosition,
  onJoin,
}: {
  room: any;
  theme: typeof APPEARANCES.light;
  selectedPosition: number | null;
  waitingPosition: number | null;
  currentUserId: number | null;
  isJoining: boolean;
  onSelectPosition: (position: number) => void;
  onJoin: () => void;
}) {
  const roomPlayersQuery = trpc.rooms.getRoomPlayers.useQuery(room.id, {
    refetchInterval: 300,  // Quase tempo real
  });
  const waitingPlayers = roomPlayersQuery.data ?? [];
  
  // Filtrar apenas jogadores humanos online (bots não aparecem em waiting)
  const onlineHumanPlayers = waitingPlayers.filter((player: any) => {
    const isBot = player?.loginMethod === "bot";
    const isOnline = player?.isOnline === true;
    return !isBot && isOnline;
  });
  
  console.log(`[RoomPanel ${room.id}] Jogadores: ${waitingPlayers.length} total, ${onlineHumanPlayers.length} humanos online`, {
    waiting: waitingPlayers.map((p: any) => `${p.name||'?'} (pos:${p.seatPosition},bot:${p.isBot},online:${p.isOnline})`),
  });
  
  const slots = Array.from({ length: room.maxPlayers ?? 4 }, (_, index) => {
    const position = index + 1;
    return onlineHumanPlayers.find((player: any) => player?.seatPosition === position);
  });
  
  // Contar apenas jogadores humanos online
  const onlinePlayersCount = slots.filter((player: any) => Boolean(player)).length;
  const isFull = onlinePlayersCount >= (room.maxPlayers ?? 4);
  const isLight = theme === APPEARANCES.light;
  const selectedSlot = selectedPosition ? slots[selectedPosition - 1] : null;
  // Slot bloqueado se está preenchido por outro usuário online
  const selectedSlotBlocked = Boolean(selectedSlot && selectedSlot?.isOnline && selectedSlot.userId !== currentUserId);
  const selectedIsCurrentWaiting = Boolean(selectedPosition && waitingPosition === selectedPosition);
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
              // Apenas considerar como preenchido se o jogador está online e é humano
              const filled = Boolean(player) && player?.isOnline && !player?.isBot;
              const filledByCurrentUser = filled && player?.userId === currentUserId;
              const selected = selectedPosition === position;
              const waiting = waitingPosition === position;
              const pairLabel = position === 1 || position === 3 ? "Dupla 1" : "Dupla 2";
              const label = filled ? (player?.name ?? `Jogador ${position}`) : `Posição ${position} - ${pairLabel}`;
              return (
              <button
                key={index}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                title={label}
                disabled={isJoining || (isFull && !filledByCurrentUser) || (filled && !filledByCurrentUser)}
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
                <span className="absolute left-1 top-0.5 text-[9px] leading-none opacity-75">{position}</span>
                {filled ? <Users className="h-3.5 w-3.5 text-emerald-100" /> : position}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden min-w-32 -translate-x-1/2 whitespace-nowrap rounded-lg border border-emerald-300/20 bg-slate-950 px-2 py-1 text-xs font-semibold text-white shadow-xl group-hover:block group-focus:block">
                  {filledByCurrentUser ? "Sua posição. Clique para sair." : selected ? "Posição selecionada" : filled ? "Posição ocupada por jogador" : label}
                </div>
              </button>
              );
            })}
          </div>
          <div className="text-right">
            <div className="text-xl font-black">{onlinePlayersCount}/{room.maxPlayers}</div>
            <div className={`text-xs ${theme.muted}`}>online</div>
          </div>
        </div>

          <Button className="mt-3 h-10 w-full bg-emerald-600 font-semibold hover:bg-emerald-500" disabled={isJoining || (!selectedIsCurrentWaiting && (isFull || !selectedPosition || selectedSlotBlocked))} onClick={onJoin}>
          {selectedIsCurrentWaiting ? "Clicar para sair desta posição" : isFull ? "Sala cheia" : isJoining ? "Aguardando..." : !selectedPosition ? "Selecione uma posição" : `${isWaitingHere ? "Trocar para" : "Entrar na"} posição ${selectedPosition}`}
        </Button>
      </CardContent>
    </Card>
  );
}
