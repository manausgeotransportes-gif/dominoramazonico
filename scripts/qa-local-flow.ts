import { appRouter } from '../server/routers';
import type { TrpcContext } from '../server/_core/context';

type AuthenticatedUser = NonNullable<TrpcContext['user']>;

function createCtx(user: AuthenticatedUser): TrpcContext {
  return {
    user,
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { clearCookie() {} } as TrpcContext['res'],
  };
}

async function main() {
  const guestCaller = appRouter.createCaller({
    user: null,
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { clearCookie() {} } as TrpcContext['res'],
  });

  const adminLogin = await guestCaller.auth.localLogin({ name: 'Administrador', email: 'admin@domino.local' });
  const anaLogin = await guestCaller.auth.localLogin({ name: 'Ana QA', email: 'ana@domino.local' });
  const brunoLogin = await guestCaller.auth.localLogin({ name: 'Bruno QA', email: 'bruno@domino.local' });

  const admin = adminLogin.user as AuthenticatedUser;
  const ana = anaLogin.user as AuthenticatedUser;
  const bruno = brunoLogin.user as AuthenticatedUser;

  const anaCaller = appRouter.createCaller(createCtx(ana));
  const brunoCaller = appRouter.createCaller(createCtx(bruno));
  const adminCaller = appRouter.createCaller(createCtx(admin));

  const quickRoom = await anaCaller.rooms.quickMatch();
  const brunoQuickRoom = await brunoCaller.rooms.quickMatch();

  const invite = await anaCaller.friends.sendInvite({ toUserId: bruno.id });
  const inviteListBefore = await brunoCaller.friends.listInvites();
  const pendingForBruno = inviteListBefore.find((item: any) => item.toUserId === bruno.id && item.status === 'pending');
  if (!pendingForBruno) throw new Error('Pending invite not found');
  await brunoCaller.friends.respondInvite({ inviteId: pendingForBruno.id, action: 'accepted' });

  const friendsAna = await anaCaller.friends.listFriends();
  const friendsBruno = await brunoCaller.friends.listFriends();
  const ranking = await anaCaller.ranking.getGlobalRanking({ limit: 5, offset: 0 });
  const adminStats = await adminCaller.admin.getStats();

  console.log(JSON.stringify({
    quickRoom,
    brunoQuickRoom,
    inviteAccepted: Boolean(invite.success),
    anaFriends: friendsAna.map((f: any) => ({ id: f.id, name: f.name, status: f.statusLabel })),
    brunoFriends: friendsBruno.map((f: any) => ({ id: f.id, name: f.name, status: f.statusLabel })),
    rankingTop: ranking.slice(0, 5),
    adminStats,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
