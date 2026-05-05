import { useCallback, useEffect, useRef } from "react";
import { ScorePanel, ScorePanelHandle } from "@/components/ScorePanel";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { loadPlayerProfile, profileFromUser, savePlayerProfile } from "@/lib/playerProfile";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Loader2, Maximize2, Users } from "lucide-react";

export default function GamePage() {
  const [match, params] = useRoute("/game/:gameId");
  const pageRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scorePanelRef = useRef<ScorePanelHandle>(null);
  const startedRoomRef = useRef<number | null>(null);
  const [location, navigate] = useLocation();
  const routeGameId = params?.gameId ?? location.match(/^\/game\/([^/?#]+)\/?$/)?.[1];
  const roomId = routeGameId ? parseInt(routeGameId, 10) : NaN;
  const canUseRoomId = (match || location.startsWith("/game/")) && Number.isFinite(roomId);
  const { isAuthenticated, loading: authLoading, user } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/" });

  const leaveRoomMutation = trpc.rooms.leaveRoom.useMutation();
  const startRoomGameMutation = trpc.games.startRoomGame.useMutation();
  const playMoveMutation = trpc.games.playMove.useMutation();
  const finishRoomMatchMutation = trpc.games.finishRoomMatch.useMutation({
    onSuccess: () => {
      refetchRanking();
    },
    onError: (error) => toast.error(error.message || "Não foi possível registrar o resultado da partida."),
  });
  const { data: players } = trpc.rooms.getRoomPlayers.useQuery(roomId, {
    enabled: canUseRoomId,
    refetchInterval: 2000,
  });
  const { data: room } = trpc.rooms.getRoomById.useQuery(roomId, {
    enabled: canUseRoomId,
    refetchInterval: 2000,
  });
  const { data: ranking, refetch: refetchRanking } = trpc.ranking.getPlayerRanking.useQuery(undefined, {
    enabled: canUseRoomId && isAuthenticated,
  });
  const maxPlayers = room?.maxPlayers ?? 4;
  const currentPlayers = room?.currentPlayers ?? players?.length ?? 0;
  const canStartWithBots = Boolean(room?.allowBot);
  const hasEnoughPlayers = currentPlayers >= maxPlayers;
  const shouldShowTable = Boolean(room && (canStartWithBots || hasEnoughPlayers || room.status === "playing"));

  const syncIframe = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !canUseRoomId) return;
    const profile = user ? profileFromUser(user) : loadPlayerProfile();

    if (players) {
      iframeRef.current.contentWindow.postMessage({ type: "players", players }, "*");
    }

    iframeRef.current.contentWindow.postMessage(
      {
        type: "player-profile",
        profile,
        stats: ranking ?? null,
      },
      "*"
    );
  }, [canUseRoomId, players, ranking, user]);

  const sendToTable = useCallback((payload: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(payload, "*");
  }, []);

  const handlePointsChange = useCallback((points: number) => {
    sendToTable({ type: "set-announcement", points });
  }, [sendToTable]);

  const handleScoreAction = useCallback((action: "galo" | "passei") => {
    sendToTable({ type: "score-action", action });
  }, [sendToTable]);

  const openFullscreenTable = useCallback(async () => {
    const target = pageRef.current;
    if (!target) return;
    try {
      if (!document.fullscreenElement) {
        await target.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      toast.error("Tela cheia indisponível neste navegador.");
    }
  }, []);

  const leaveRoomAndReturn = useCallback(async () => {
    if (!canUseRoomId) {
      navigate("/lobby");
      return;
    }

    try {
      await leaveRoomMutation.mutateAsync(roomId);
      toast.success("Você saiu da sala.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível sair da sala corretamente.");
    } finally {
      navigate("/lobby");
    }
  }, [canUseRoomId, leaveRoomMutation, navigate, roomId]);

  useEffect(() => {
    syncIframe();
  }, [syncIframe]);

  useEffect(() => {
    if (!canUseRoomId || authLoading || !isAuthenticated || !room || startRoomGameMutation.isPending || startedRoomRef.current === roomId) return;
    const shouldStart = Boolean(room.allowBot) || room.currentPlayers >= room.maxPlayers;
    if (!shouldStart || room.status === "finished" || room.status === "closed") return;
    startedRoomRef.current = roomId;
    startRoomGameMutation.mutate({ roomId, fillBots: Boolean(room.allowBot) });
  }, [authLoading, canUseRoomId, isAuthenticated, room, roomId, startRoomGameMutation]);

  useEffect(() => {
    if (!canUseRoomId) return;
    const leaveOnClose = () => {
      leaveRoomMutation.mutate(roomId);
    };
    window.addEventListener("pagehide", leaveOnClose);
    return () => window.removeEventListener("pagehide", leaveOnClose);
  }, [canUseRoomId, leaveRoomMutation, roomId]);

  useEffect(() => {
    const updateViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--domino-vh", `${height}px`);
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);
    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
      document.documentElement.style.removeProperty("--domino-vh");
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "domino_player_profile") {
        syncIframe();
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "request-exit") {
        leaveRoomAndReturn();
      }
      if (event.data?.type === "points-reset") {
        scorePanelRef.current?.resetPoints();
        scorePanelRef.current?.resetGalo();
      }
      if (event.data?.type === "player-profile-updated" && event.data.profile) {
        savePlayerProfile(event.data.profile);
        syncIframe();
      }
      if (event.data?.type === "match-finished" && canUseRoomId) {
        const winnerPlayerIndex = Number(event.data.winnerPlayerIndex ?? 0);
        toast.success(event.data.message || "Partida encerrada. Resultado registrado.");
        finishRoomMatchMutation.mutate({ roomId, winnerPlayerIndex });
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
    };
  }, [canUseRoomId, finishRoomMatchMutation, leaveRoomAndReturn, ranking, roomId, syncIframe]);

  if (!canUseRoomId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <h1 className="mb-4 text-2xl font-bold">Jogo não encontrado</h1>
          <Link href="/lobby">
            <Button className="bg-blue-600 hover:bg-blue-700">Voltar ao Lobby</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!shouldShowTable) {
    const waitingPlayers = players ?? [];
    const waitingSlots = Array.from({ length: maxPlayers }, (_, index) => {
      const position = index + 1;
      return waitingPlayers.find((player: any) => (player.seatPosition ?? player.id) === position);
    });

    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#143b35_0%,#071013_48%,#020304_100%)] px-4 py-5 text-white sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-4xl flex-col justify-center">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={leaveRoomAndReturn}
              disabled={leaveRoomMutation.isPending}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao lobby
            </Button>
            <div className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-100">
              {currentPlayers}/{maxPlayers} jogadores
            </div>
          </div>

          <section className="rounded-2xl border border-emerald-300/15 bg-black/45 p-5 shadow-2xl backdrop-blur sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-emerald-200">
                  <Users className="h-4 w-4" />
                  {room?.isPrivate ? "Sala privada" : "Sala pública"}
                </div>
                <h1 className="text-3xl font-black sm:text-4xl">{room?.name ?? "Sala"}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  A mesa começa automaticamente quando as 4 posições estiverem ocupadas. Se você entrar em outra sala enquanto aguarda, esta seleção anterior será liberada.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando jogadores
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {waitingSlots.map((player: any, index: number) => player ? (
                <div key={`${player.userId}-${index}`} className="flex items-center gap-3 rounded-xl border border-emerald-300/15 bg-emerald-500/10 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/25 font-black text-emerald-50">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold">{player.name ?? `Jogador ${index + 1}`}</div>
                    <div className="text-xs text-emerald-100/75">Na sala</div>
                  </div>
                </div>
              ) : (
                <div key={`empty-${index}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-white/20 text-sm font-black">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-bold">Vaga aberta</div>
                    <div className="text-xs text-slate-400">Esperando outro jogador</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Exemplo de função para jogar pedra
  const handlePlayMove = async (move: { gameId: number, playerIndex: number, domino: { left: number; right: number }, side: "left" | "right" | "up" | "down", action?: "galo" | "normal" }) => {
    const announcedPoints = scorePanelRef.current?.getPoints() ?? 0;
    await playMoveMutation.mutateAsync({
      ...move,
      announcedPoints,
    });
    scorePanelRef.current?.resetPoints();
    scorePanelRef.current?.resetGalo();
  };

  return (
    <div
      ref={pageRef}
      className="fixed inset-0 overflow-hidden bg-black"
      style={{
        height: "var(--domino-vh, 100dvh)",
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    >
      <iframe
        ref={iframeRef}
        src="/domino-mesa/index.html"
        title="Mesa de Dominó"
        className="block h-full w-full"
        style={{ border: "none" }}
        allowFullScreen
        onLoad={syncIframe}
      />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="fixed right-4 top-4 z-[250] h-10 w-10 rounded-full border border-white/20 bg-black/60 text-white shadow-xl backdrop-blur hover:bg-black/80 md:right-5 md:top-5"
        onClick={openFullscreenTable}
        aria-label="Abrir mesa em tela cheia"
        title="Abrir mesa em tela cheia"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
      {canUseRoomId && shouldShowTable && (
        <ScorePanel
          ref={scorePanelRef}
          roomId={roomId}
          onPointsChange={handlePointsChange}
          onSendAction={handleScoreAction}
        />
      )}
    </div>
  );
}
