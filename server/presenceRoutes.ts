import type { Express, Request } from "express";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import { getHeaderValue } from "./_core/requestHeaders";
import { sdk } from "./_core/sdk";
import { logoutLocalUser, persistLocalStoreNow } from "./localStore";
import { cleanupWaitingRoomsForUser, replaceActiveRoomsForUserWithBot } from "./roomsRouter";

function readLocalUserId(req: Request) {
  const header = getHeaderValue(req as any, "x-local-user-id");
  const bodyValue = typeof req.body?.localUserId === "number" || typeof req.body?.localUserId === "string"
    ? Number(req.body.localUserId)
    : NaN;
  const headerValue = header ? Number(header) : NaN;
  return Number.isFinite(headerValue) ? headerValue : bodyValue;
}

export function registerPresenceRoutes(app: Express) {
  app.post("/api/presence/logout", async (req, res) => {
    try {
      const localUserId = readLocalUserId(req);
      if (Number.isFinite(localUserId)) {
        logoutLocalUser(localUserId);
        await persistLocalStoreNow();
        res.status(204).end();
        return;
      }

      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (user?.id) {
        await replaceActiveRoomsForUserWithBot(user.id);
        await cleanupWaitingRoomsForUser(user.id);
        const drizzle = await getDb();
        if (drizzle) {
          await drizzle.update(users).set({ isOnline: false, isPlaying: false }).where(eq(users.id, user.id));
        }
      }

      res.status(204).end();
    } catch (error) {
      console.error("Erro ao registrar saída de presença:", error);
      res.status(204).end();
    }
  });
}
