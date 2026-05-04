import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { chatMessages, chatInfractions, users } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { addInfractionLocal, appendMessage, getMessagesLocal, getLocalUserById, isBlockedLocal, listInfractionsLocal } from "./localStore";

async function checkOffensiveContent(message: string): Promise<boolean> {
  const normalized = message.toLowerCase();
  const bannedWords = ["idiota", "burro", "otário", "fdp", "merda", "lixo", "imbecil", "desgraçado"];
  if (bannedWords.some((word) => normalized.includes(word))) return true;
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um moderador de chat. Responda apenas SIM ou NÃO para conteúdo ofensivo." },
        { role: "user", content: message },
      ],
    });
    const content = typeof response.choices[0]?.message.content === "string" ? response.choices[0].message.content : "";
    return content.toUpperCase().includes("SIM");
  } catch {
    return false;
  }
}

async function getRecentMessages(
  userId: number,
  gameId: number,
  db: any
): Promise<Array<{ message: string; createdAt: Date }>> {
  if (!db) {
    return getMessagesLocal(gameId)
      .filter((message) => message.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId), eq(chatMessages.gameId, gameId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(10) as Promise<Array<{ message: string; createdAt: Date }>>;
}

async function checkSpamBehavior(userId: number, gameId: number, message: string, db: any) {
  const recentMessages = await getRecentMessages(userId, gameId, db);
  const normalizedMessage = message.trim().toLowerCase();
  const now = Date.now();
  const windowMs = 20_000;
  const recentCount = recentMessages.filter((item) => now - item.createdAt.getTime() <= windowMs).length;
  const repeatedCount = recentMessages.filter(
    (item) => item.message.trim().toLowerCase() === normalizedMessage
  ).length;

  if (recentCount >= 4 || repeatedCount >= 2) {
    return true;
  }

  return false;
}

// Validação antispam, repetição e ofensas (conforme guia)
const bannedWords = [
  "idiota", "burro", "otário", "fdp", "merda", "lixo", "imbecil", "desgraçado",
  "arrombado", "babaca", "corno", "otaria", "otario"
];

export const chatRouter = router({
  sendMessage: protectedProcedure
    .input(z.object({ gameId: z.number(), message: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const normalizedText = input.message.trim().replace(/\s+/g, " ");
      if (normalizedText.length < 1 || normalizedText.length > 120) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Mensagem deve ter entre 1 e 120 caracteres" });
      }
      const recentMessages = getMessagesLocal(input.gameId)
        .filter((msg) => msg.userId === ctx.user.id)
        .slice(-5);
      const lastMessage = recentMessages[recentMessages.length - 1];
      if (lastMessage && lastMessage.message.trim().toLowerCase() === normalizedText.toLowerCase()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não repita a mesma mensagem em sequência" });
      }
      const tooFast = recentMessages.some((msg) => Date.now() - new Date(msg.createdAt).getTime() < 1500);
      if (tooFast) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aguarde um instante antes de enviar outra mensagem" });
      }
      if (bannedWords.some((word) => normalizedText.toLowerCase().includes(word))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Mensagem contém palavras proibidas" });
      }

      const db = await getDb();
      if (!db) {
        if (isBlockedLocal(ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você foi bloqueado por infrações no chat" });
        }

        if (await checkSpamBehavior(ctx.user.id, input.gameId, normalizedText, null)) {
          const infraction = addInfractionLocal(ctx.user.id, "Spam no chat");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Mensagens repetidas ou envios rápidos detectados. Infração ${infraction.count}/3. Bloqueio por ${infraction.blockDuration}.`,
          });
        }

        const isOffensive = await checkOffensiveContent(normalizedText);
        appendMessage(input.gameId, ctx.user.id, normalizedText, isOffensive);
        if (isOffensive) {
          const infraction = addInfractionLocal(ctx.user.id, "Linguagem ofensiva no chat");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Mensagem ofensiva detectada. Infração ${infraction.count}/3. Bloqueio por ${infraction.blockDuration}.`,
          });
        }
        return { success: true, message: "Mensagem enviada com sucesso" };
      }

      const userList = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const user = userList[0];
      if (user?.blockedUntil && new Date() < user.blockedUntil) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você foi bloqueado por infrações no chat" });
      }

      if (await checkSpamBehavior(ctx.user.id, input.gameId, normalizedText, db)) {
        const currentInfractions = await db.select().from(chatInfractions).where(eq(chatInfractions.userId, ctx.user.id));
        const nextInfractionNumber = currentInfractions.length + 1;
        let blockDuration: "24h" | "30d" | "permanent" = "24h";
        let blockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (nextInfractionNumber === 2) {
          blockDuration = "30d";
          blockUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        if (nextInfractionNumber >= 3) {
          blockDuration = "permanent";
          blockUntil = new Date("2099-12-31");
        }
        await db.insert(chatInfractions).values({ userId: ctx.user.id, infractionCount: nextInfractionNumber, blockDuration, unblockAt: blockUntil, reason: "Spam no chat" });
        await db.update(users).set({ blockedUntil: blockUntil, blockReason: "Infrações no chat" }).where(eq(users.id, ctx.user.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: `Spam detectado. Infrações acumuladas: ${nextInfractionNumber}. Bloqueio por ${blockDuration}.` });
      }

      const isOffensive = await checkOffensiveContent(normalizedText);
      await db.insert(chatMessages).values({ gameId: input.gameId, userId: ctx.user.id, message: normalizedText, isOffensive });
      if (isOffensive) {
        const currentInfractions = await db.select().from(chatInfractions).where(eq(chatInfractions.userId, ctx.user.id));
        const nextInfractionNumber = currentInfractions.length + 1;
        let blockDuration: "24h" | "30d" | "permanent" = "24h";
        let blockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (nextInfractionNumber === 2) {
          blockDuration = "30d";
          blockUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        if (nextInfractionNumber >= 3) {
          blockDuration = "permanent";
          blockUntil = new Date("2099-12-31");
        }
        await db.insert(chatInfractions).values({ userId: ctx.user.id, infractionCount: nextInfractionNumber, blockDuration, unblockAt: blockUntil, reason: "Linguagem ofensiva no chat" });
        await db.update(users).set({ blockedUntil: blockUntil, blockReason: "Infrações no chat" }).where(eq(users.id, ctx.user.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: `Mensagem ofensiva detectada. Bloqueio por ${blockDuration}.` });
      }
      return { success: true, message: "Mensagem enviada com sucesso" };
    }),

  getMessages: protectedProcedure.input(z.number()).query(async ({ input: gameId }) => {
    const db = await getDb();
    if (!db) return getMessagesLocal(gameId);
    const messageList = await db.select().from(chatMessages).where(eq(chatMessages.gameId, gameId));
    return messageList.map((msg) => ({ ...msg, userName: getLocalUserById(msg.userId)?.name || `Jogador ${msg.userId}` }));
  }),

  checkBlockStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      const user = getLocalUserById(ctx.user.id);
      const infractionCount = listInfractionsLocal().filter((item) => item.userId === ctx.user.id).length;
      return {
        isBlocked: isBlockedLocal(ctx.user.id),
        infractionCount,
        blockReason: user?.blockReason ?? null,
      };
    }

    const userList = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const user = userList[0];
    const infractionCount = (await db.select().from(chatInfractions).where(eq(chatInfractions.userId, ctx.user.id))).length;
    return {
      isBlocked: Boolean(user?.blockedUntil && new Date() < user.blockedUntil),
      infractionCount,
      blockReason: user?.blockReason ?? null,
    };
  }),
});
