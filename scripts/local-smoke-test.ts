import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../server/routers';

async function main() {
  const adminClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://localhost:3010/api/trpc',
        transformer: superjson,
      }),
    ],
  });

  const login = await adminClient.auth.localLogin.mutate({ name: 'Tester QA', email: 'qa@domino.local' });
  const localUserId = String(login.user.id);

  const authedClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://localhost:3010/api/trpc',
        transformer: superjson,
        headers() {
          return { 'x-local-user-id': localUserId };
        },
      }),
    ],
  });

  const me = await authedClient.auth.me.query();
  const room = await authedClient.rooms.createRoom.mutate({
    name: 'Sala QA Local',
    isPrivate: false,
    allowBot: true,
  });

  const started = await authedClient.games.startRoomGame.mutate({ roomId: room.roomId, fillBots: true });
  const gameState = await authedClient.games.getGameState.query(room.roomId);
  const playerIndex = gameState.playerIds.findIndex((id) => id === login.user.id);
  const hand = gameState.playerHands[playerIndex];
  const valid = hand
    .map((domino) => {
      const left = !gameState.boardState.left || domino.left === gameState.boardState.left.left || domino.right === gameState.boardState.left.left;
      const right = !gameState.boardState.right || domino.left === gameState.boardState.right.right || domino.right === gameState.boardState.right.right;
      return { domino, side: left ? 'left' : right ? 'right' : null };
    })
    .find((item) => item.side);

  let played = null;
  if (playerIndex === gameState.currentPlayerIndex && valid?.side) {
    played = await authedClient.games.playMove.mutate({
      gameId: gameState.gameId,
      playerIndex,
      domino: valid.domino,
      side: valid.side,
      announcedPoints: 0,
    });
  }

  const ranking = await authedClient.ranking.getGlobalRanking.query({ limit: 10, offset: 0 });

  console.log(JSON.stringify({
    me,
    room,
    startedStatus: started.status,
    gameId: gameState.gameId,
    playerIndex,
    currentPlayerIndex: gameState.currentPlayerIndex,
    validMoveFound: Boolean(valid),
    played: played ? {
      status: played.status,
      lastMove: played.lastMove,
      exactTablePlayedCount: played.boardState.played.length,
      teamScores: played.teamScores,
    } : null,
    rankingTop: ranking.slice(0, 3),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
