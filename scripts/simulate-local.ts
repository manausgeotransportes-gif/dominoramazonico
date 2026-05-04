import { appRouter } from '../server/routers';
import type { TrpcContext } from '../server/_core/context';
import { getLocalUserById } from '../server/localStore';

function createCtx(userId?: number | null): TrpcContext {
  const user = userId ? (getLocalUserById(userId) as any) : null;
  return {
    user,
    req: {
      protocol: 'http',
      headers: userId ? { 'x-local-user-id': String(userId) } : {},
      header(name: string) {
        return (this.headers as any)?.[name.toLowerCase()] ?? (this.headers as any)?.[name];
      },
    } as any,
    res: {
      clearCookie() {},
    } as any,
  };
}

function getExactTablePoints(game: any) {
  const played = game.boardState.played ?? [];
  if (played.length === 0) return 0;
  if (played.length === 1) return played[0].left + played[0].right;
  return (game.boardState.left?.left ?? 0) + (game.boardState.right?.right ?? 0);
}

async function main() {
  const publicCaller = appRouter.createCaller(createCtx());
  const adminLogin = await publicCaller.auth.localLogin({ name: 'Administrador', email: 'admin@domino.local' });
  const p1Login = await publicCaller.auth.localLogin({ name: 'Teste Mesa 1', email: 'mesa1@domino.local' });
  const p2Login = await publicCaller.auth.localLogin({ name: 'Teste Mesa 2', email: 'mesa2@domino.local' });

  const player1 = p1Login.user;
  const player2 = p2Login.user;
  const admin = adminLogin.user;

  const caller1 = appRouter.createCaller(createCtx(player1.id));
  const caller2 = appRouter.createCaller(createCtx(player2.id));
  const adminCaller = appRouter.createCaller(createCtx(admin.id));

  const room = await caller1.rooms.createRoom({
    name: 'Sala Teste Automatizado',
    isPrivate: false,
    allowBot: true,
  });

  await caller2.rooms.joinRoom(room.roomId);
  const started = await caller1.games.startRoomGame({ roomId: room.roomId, fillBots: true });
  let game = await caller1.games.getGameState(started.gameId);

  const humanCaller = game.playerIds[game.currentPlayerIndex] === player1.id ? caller1 : game.playerIds[game.currentPlayerIndex] === player2.id ? caller2 : caller1;
  const humanPlayerId = game.playerIds[game.currentPlayerIndex] === player1.id ? player1.id : game.playerIds[game.currentPlayerIndex] === player2.id ? player2.id : player1.id;
  const activeHumanIndex = game.playerIds.findIndex((id: number) => id === humanPlayerId);
  let attemptedMove: any = null;
  let moveExecuted = false;

  if (activeHumanIndex === game.currentPlayerIndex) {
    const hand = game.playerHands[activeHumanIndex] ?? [];
    for (const domino of hand) {
      if (moveExecuted) break;
      for (const side of ['left', 'right'] as const) {
        try {
          const exactBefore = getExactTablePoints(game);
          attemptedMove = { domino, side, exactBefore, playerId: humanPlayerId };
          game = await humanCaller.games.playMove({
            gameId: game.gameId,
            playerIndex: activeHumanIndex,
            domino,
            side,
            announcedPoints: exactBefore,
          });
          moveExecuted = true;
          break;
        } catch {
          // tenta a próxima combinação válida
        }
      }
    }
  }

  await humanCaller.chat.sendMessage({ gameId: game.gameId, message: 'Boa sorte a todos!' });

  const ranking = await caller1.ranking.getGlobalRanking({ limit: 10, offset: 0 });
  const adminStats = await adminCaller.admin.getStats();
  const roomPlayers = await caller1.rooms.getRoomPlayers(room.roomId);

  console.log(JSON.stringify({
    users: { admin, player1, player2 },
    room,
    roomPlayers,
    startedGameId: started.gameId,
    currentPlayerIndex: game.currentPlayerIndex,
    currentPlayerName: game.playerNames?.[game.currentPlayerIndex],
    myIndex: activeHumanIndex,
    moveExecuted,
    attemptedMove,
    lastMove: game.lastMove,
    boardEnds: {
      left: game.boardState.left,
      right: game.boardState.right,
      playedCount: game.boardState.played?.length ?? 0,
    },
    announcementsTail: (game.announcements ?? []).slice(-5),
    rankingTop3: ranking.slice(0, 3),
    adminStats,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
