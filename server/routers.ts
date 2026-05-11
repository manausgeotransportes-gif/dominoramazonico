import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { getHeaderValue } from "./_core/requestHeaders";
import { roomsRouter } from "./roomsRouter";
import { cleanupStaleOnlineUsers, cleanupWaitingRoomsForUser, replaceActiveRoomsForUserWithBot } from "./roomsRouter";
import { gamesRouter } from "./gamesRouter";
import { chatRouter } from "./chatRouter";
import { rankingRouter } from "./rankingRouter";
import { adminRouter } from "./adminRouter";
import { friendsRouter } from "./friendsRouter";
import { scoreRouter } from "./scoreRouter";
import { calendarRouter } from "./calendarRouter";
import { getLocalUserById, loginLocalUser, loginPasswordUser, logoutLocalUser, markLocalUserPresence, persistLocalStoreNow, registerCredentialUser, requestEmailCode, verifyEmailCode, updateLocalUserProfile } from "./localStore";
import { getDb, updateUserProfile } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => {
      if (opts.ctx.user) return opts.ctx.user;
      const localUserIdHeader = getHeaderValue(opts.ctx.req as any, "x-local-user-id");
      const localUserId = localUserIdHeader ? parseInt(localUserIdHeader, 10) : NaN;
      return Number.isFinite(localUserId) ? getLocalUserById(localUserId) : null;
    }),
    localLogin: publicProcedure
      .input(z.object({ name: z.string().min(2).max(50), email: z.string().email().optional() }))
      .mutation(async ({ input }) => {
        const user = loginLocalUser(input.name, input.email ?? null);
        await persistLocalStoreNow();
        return { user };
      }),
    registerPassword: publicProcedure
      .input(z.object({
        name: z.string().min(2).max(50),
        email: z.string().email(),
        password: z.string().min(4).max(100),
      }))
      .mutation(async ({ input }) => {
        const user = registerCredentialUser(input.name, input.email, input.password);
        await persistLocalStoreNow();
        return { user };
      }),
    loginPassword: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(4).max(100),
      }))
      .mutation(async ({ input }) => {
        const user = loginPasswordUser(input.email, input.password);
        await persistLocalStoreNow();
        return { user };
      }),
    requestEmailCode: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(({ input }) => requestEmailCode(input.email)),
    verifyEmailCode: publicProcedure
      .input(z.object({ email: z.string().email(), code: z.string().min(1).max(10), name: z.string().min(2).max(50).optional() }))
      .mutation(async ({ input }) => {
        const user = verifyEmailCode(input.email, input.code, input.name);
        await persistLocalStoreNow();
        return { user };
      }),
    updateProfile: protectedProcedure
      .input(z.object({
        displayName: z.string().min(1).max(100).optional(),
        avatarType: z.enum(["preset", "upload"]).optional(),
        avatarPresetId: z.string().min(1).max(50).optional(),
        avatarImage: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = ctx.user;
        if (!user) throw new Error("User not authenticated");

        // Update in database if available
        if (user.id) {
          await updateUserProfile(user.openId, input);
        }

        // Update in local store
        updateLocalUserProfile(user.id, input);

        return { success: true };
      }),
    heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
      const localUserIdHeader = getHeaderValue(ctx.req as any, "x-local-user-id");
      const localUserId = localUserIdHeader ? parseInt(localUserIdHeader, 10) : NaN;
      if (Number.isFinite(localUserId)) {
        markLocalUserPresence(localUserId, true);
        await persistLocalStoreNow();
        return { success: true } as const;
      }

      const drizzle = await getDb();
      if (drizzle && ctx.user?.id) {
        await cleanupStaleOnlineUsers();
        console.log(`[Heartbeat] Marcando usuário ${ctx.user.id} (${ctx.user.name}) como online`);
        await drizzle.update(users).set({ isOnline: true, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
      }
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const localUserIdHeader = getHeaderValue(ctx.req as any, "x-local-user-id");
      const localUserId = localUserIdHeader ? parseInt(localUserIdHeader, 10) : NaN;
      if (Number.isFinite(localUserId)) {
        logoutLocalUser(localUserId);
      } else if (ctx.user?.id) {
        await replaceActiveRoomsForUserWithBot(ctx.user.id);
        await cleanupWaitingRoomsForUser(ctx.user.id);
        const drizzle = await getDb();
        if (drizzle) {
          await drizzle.update(users).set({ isOnline: false, isPlaying: false }).where(eq(users.id, ctx.user.id));
        }
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  rooms: roomsRouter,
  games: gamesRouter,
  chat: chatRouter,
  ranking: rankingRouter,
  friends: friendsRouter,
  admin: adminRouter,
  score: scoreRouter,
  calendar: calendarRouter,
});

export type AppRouter = typeof appRouter;
