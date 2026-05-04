import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Check, Clock3, MailPlus, Search, UserPlus, Users, X } from "lucide-react";

export default function Friends() {
  const { user } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/" });
  const utils = trpc.useUtils();
  const [friendSearch, setFriendSearch] = useState("");

  const availableUsers = trpc.friends.listAvailableUsers.useQuery(undefined, { refetchInterval: 5000 });
  const friends = trpc.friends.listFriends.useQuery(undefined, { refetchInterval: 5000 });
  const invites = trpc.friends.listInvites.useQuery(undefined, { refetchInterval: 5000 });

  const sendInvite = trpc.friends.sendInvite.useMutation({
    onSuccess: () => {
      toast.success("Convite enviado com sucesso.");
      invites.refetch();
      availableUsers.refetch();
      friends.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar o convite"),
  });

  const respondInvite = trpc.friends.respondInvite.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.action === "accepted" ? "Convite aceito." : "Convite recusado.");
      invites.refetch();
      availableUsers.refetch();
      friends.refetch();
      utils.invalidate();
    },
    onError: (error) => toast.error(error.message || "Não foi possível responder o convite"),
  });

  const receivedPending = useMemo(
    () => (invites.data ?? []).filter((invite: any) => invite.toUserId === user?.id && invite.status === "pending"),
    [invites.data, user?.id]
  );

  const sentPending = useMemo(
    () => (invites.data ?? []).filter((invite: any) => invite.fromUserId === user?.id && invite.status === "pending"),
    [invites.data, user?.id]
  );

  const filteredAvailableUsers = useMemo(() => {
    const query = friendSearch.trim().toLowerCase();
    if (!query) return availableUsers.data ?? [];
    return (availableUsers.data ?? []).filter((player: any) =>
      `${player.name ?? ""} ${player.email ?? ""}`.toLowerCase().includes(query)
    );
  }, [availableUsers.data, friendSearch]);

  const statusBadge = (item: { isPlaying?: boolean; isOnline?: boolean }) => {
    if (item.isPlaying) return <Badge className="bg-amber-600">Jogando</Badge>;
    if (item.isOnline) return <Badge className="bg-emerald-600">Disponível</Badge>;
    return <Badge variant="outline" className="border-white/20 text-white">Offline</Badge>;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#14532d,#020617_65%)] text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/lobby"><Button variant="outline" className="border-white/20"><ArrowLeft className="w-4 h-4 mr-2" />Voltar ao lobby</Button></Link>
            <div>
              <h1 className="text-4xl font-black">Amigos e convites</h1>
              <p className="text-slate-300">Veja quem está online, gerencie convites e monte sua mesa com a galera.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Card className="bg-white/10 border-white/10 text-white"><CardContent className="p-4"><div className="text-slate-300">Amigos</div><div className="text-2xl font-black">{friends.data?.length ?? 0}</div></CardContent></Card>
            <Card className="bg-white/10 border-white/10 text-white"><CardContent className="p-4"><div className="text-slate-300">Pendentes</div><div className="text-2xl font-black">{receivedPending.length + sentPending.length}</div></CardContent></Card>
          </div>
        </div>

        <Tabs defaultValue="friends" className="w-full">
          <TabsList className="grid w-full md:w-[640px] grid-cols-3 bg-white/10">
            <TabsTrigger value="friends">Meus amigos</TabsTrigger>
            <TabsTrigger value="invites">Convites</TabsTrigger>
            <TabsTrigger value="discover">Encontrar jogadores</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="mt-6">
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(friends.data ?? []).length === 0 ? (
                <Card className="col-span-full bg-slate-900/70 border-slate-700 text-white"><CardContent className="py-12 text-center text-slate-300">Você ainda não tem amigos adicionados.</CardContent></Card>
              ) : (
                (friends.data ?? []).map((friend: any) => (
                  <Card key={friend.id} className="bg-slate-900/70 border-slate-700 text-white">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3"><span>{friend.name}</span>{statusBadge(friend)}</CardTitle>
                      <CardDescription className="text-slate-300">{friend.email || "Sem e-mail informado"}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-xl bg-white/5 p-3 text-sm text-slate-200">Status atual: <span className="font-semibold">{friend.statusLabel}</span></div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="invites" className="mt-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><MailPlus className="w-5 h-5" />Convites recebidos</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {receivedPending.length === 0 ? (
                  <Card className="col-span-full bg-slate-900/70 border-slate-700 text-white"><CardContent className="py-8 text-center text-slate-300">Nenhum convite recebido no momento.</CardContent></Card>
                ) : (
                  receivedPending.map((invite: any) => (
                    <Card key={invite.id} className="bg-slate-900/70 border-slate-700 text-white">
                      <CardHeader>
                        <CardTitle>{invite.fromUserName}</CardTitle>
                        <CardDescription className="text-slate-300">Recebido em {new Date(invite.createdAt).toLocaleString()}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex gap-2">
                        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => respondInvite.mutate({ inviteId: invite.id, action: "accepted" })}><Check className="w-4 h-4 mr-2" />Aceitar</Button>
                        <Button variant="outline" className="border-white/20" onClick={() => respondInvite.mutate({ inviteId: invite.id, action: "declined" })}><X className="w-4 h-4 mr-2" />Recusar</Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><Clock3 className="w-5 h-5" />Convites enviados</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {sentPending.length === 0 ? (
                  <Card className="col-span-full bg-slate-900/70 border-slate-700 text-white"><CardContent className="py-8 text-center text-slate-300">Nenhum convite pendente enviado.</CardContent></Card>
                ) : (
                  sentPending.map((invite: any) => (
                    <Card key={invite.id} className="bg-slate-900/70 border-slate-700 text-white">
                      <CardHeader>
                        <CardTitle>{invite.toUserName}</CardTitle>
                        <CardDescription className="text-slate-300">Aguardando resposta até {new Date(invite.expiresAt).toLocaleDateString()}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="discover" className="mt-6">
            <div className="mb-4 grid gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  value={friendSearch}
                  onChange={(event) => setFriendSearch(event.target.value)}
                  placeholder="Localizar amigos por nome ou e-mail"
                  className="h-10 border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-400"
                />
              </div>
              <Button
                className="h-10 bg-emerald-600 hover:bg-emerald-700"
                disabled={!filteredAvailableUsers.some((player: any) => !player.isFriend && !player.hasPendingInvite) || sendInvite.isPending}
                onClick={() => {
                  const player = filteredAvailableUsers.find((item: any) => !item.isFriend && !item.hasPendingInvite);
                  if (player) sendInvite.mutate({ toUserId: player.id });
                }}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Adicionar amigo
              </Button>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredAvailableUsers.map((player: any) => (
                <Card key={player.id} className="bg-slate-900/70 border-slate-700 text-white">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-3"><span>{player.name}</span>{statusBadge(player)}</CardTitle>
                    <CardDescription className="text-slate-300">{player.email || "Sem e-mail"}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl bg-white/5 p-3 text-sm text-slate-200">{player.isFriend ? "Já está na sua lista de amigos." : player.isOnline ? "Online agora." : "Offline no momento."}</div>
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      disabled={player.isFriend || player.hasPendingInvite || sendInvite.isPending}
                      onClick={() => sendInvite.mutate({ toUserId: player.id })}
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      {player.isFriend ? "Amigo adicionado" : player.hasPendingInvite ? "Convite pendente" : "Enviar convite"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {filteredAvailableUsers.length === 0 && (
                <Card className="col-span-full bg-slate-900/70 border-slate-700 text-white"><CardContent className="py-12 text-center text-slate-300 flex items-center justify-center gap-2"><Users className="w-5 h-5" />Nenhum jogador disponível para adicionar.</CardContent></Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
