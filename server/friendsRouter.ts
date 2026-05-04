import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { friendInvites, users } from "../drizzle/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  listAvailableUsersLocal,
  listFriendInvitesLocal,
  listFriendsLocal,
  respondFriendInviteLocal,
  sendFriendInviteLocal,
} from "./localStore";

export const friendsRouter = router({
  listAvailableUsers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return listAvailableUsersLocal(ctx.user.id);

    const userList = await db.select().from(users);
    const inviteList = await db.select().from(friendInvites).where(
      or(eq(friendInvites.fromUserId, ctx.user.id), eq(friendInvites.toUserId, ctx.user.id))
    );

    return userList
      .filter((user) => user.id !== ctx.user.id && (user.loginMethod ?? "") !== "bot")
      .map((user) => {
        const related = inviteList.filter(
          (invite) =>
            (invite.fromUserId === ctx.user.id && invite.toUserId === user.id) ||
            (invite.fromUserId === user.id && invite.toUserId === ctx.user.id)
        );
        const isFriend = related.some((invite) => invite.status === "accepted");
        const pendingInvite = related.some((invite) => invite.status === "pending");
        return {
          id: user.id,
          name: user.name || `Jogador ${user.id}`,
          email: user.email,
          isOnline: user.isOnline,
          isPlaying: user.isPlaying,
          isBlocked: Boolean(user.blockedUntil && new Date() < user.blockedUntil),
          isFriend,
          hasPendingInvite: pendingInvite,
        };
      })
      .sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.name.localeCompare(b.name));
  }),

  sendInvite: protectedProcedure
    .input(z.object({ toUserId: z.number(), gameId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        const invite = sendFriendInviteLocal(ctx.user.id, input.toUserId, input.gameId);
        return { success: true, invite };
      }

      if (ctx.user.id === input.toUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode convidar a si mesmo" });
      }

      const target = await db.select().from(users).where(eq(users.id, input.toUserId)).limit(1);
      if (!target.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      }

      const relatedInvites = await db.select().from(friendInvites).where(
        or(
          and(eq(friendInvites.fromUserId, ctx.user.id), eq(friendInvites.toUserId, input.toUserId)),
          and(eq(friendInvites.fromUserId, input.toUserId), eq(friendInvites.toUserId, ctx.user.id))
        )
      );

      if (relatedInvites.some((invite) => invite.status === "accepted")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este usuário já é seu amigo" });
      }
      if (relatedInvites.some((invite) => invite.status === "pending")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe um convite pendente entre vocês" });
      }

      await db.insert(friendInvites).values({
        fromUserId: ctx.user.id,
        toUserId: input.toUserId,
        gameId: input.gameId,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      return { success: true };
    }),

  listInvites: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return listFriendInvitesLocal(ctx.user.id);

    const invites = await db
      .select()
      .from(friendInvites)
      .where(or(eq(friendInvites.fromUserId, ctx.user.id), eq(friendInvites.toUserId, ctx.user.id)))
      .orderBy(desc(friendInvites.createdAt));

    const userIds = Array.from(new Set(invites.flatMap((invite) => [invite.fromUserId, invite.toUserId])));
    const userList = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    const userMap = new Map(userList.map((user) => [user.id, user]));

    return invites.map((invite) => ({
      ...invite,
      fromUserName: userMap.get(invite.fromUserId)?.name || `Jogador ${invite.fromUserId}`,
      toUserName: userMap.get(invite.toUserId)?.name || `Jogador ${invite.toUserId}`,
    }));
  }),

  respondInvite: protectedProcedure
    .input(z.object({ inviteId: z.number(), action: z.enum(["accepted", "declined"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        const invite = respondFriendInviteLocal(input.inviteId, ctx.user.id, input.action);
        return { success: true, invite };
      }

      const found = await db.select().from(friendInvites).where(eq(friendInvites.id, input.inviteId)).limit(1);
      const invite = found[0];
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Convite não encontrado" });
      if (invite.toUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode responder este convite" });
      }
      if (invite.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite já foi respondido" });
      }

      await db.update(friendInvites).set({ status: input.action }).where(eq(friendInvites.id, input.inviteId));
      return { success: true };
    }),

  listFriends: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return listFriendsLocal(ctx.user.id);

    const accepted = await db.select().from(friendInvites).where(
      and(
        or(eq(friendInvites.fromUserId, ctx.user.id), eq(friendInvites.toUserId, ctx.user.id)),
        eq(friendInvites.status, "accepted")
      )
    );

    const friendIds = Array.from(
      new Set(
        accepted.map((invite) =>
          invite.fromUserId === ctx.user.id ? invite.toUserId : invite.fromUserId
        )
      )
    );

    const friendUsers = friendIds.length ? await db.select().from(users).where(inArray(users.id, friendIds)) : [];
    return friendUsers
      .map((user) => ({
        id: user.id,
        name: user.name || `Jogador ${user.id}`,
        email: user.email,
        isOnline: user.isOnline,
        isPlaying: user.isPlaying,
        isBlocked: Boolean(user.blockedUntil && new Date() < user.blockedUntil),
        statusLabel: user.isPlaying ? "Jogando" : user.isOnline ? "Disponível" : "Offline",
      }))
      .sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.name.localeCompare(b.name));
  }),
});
