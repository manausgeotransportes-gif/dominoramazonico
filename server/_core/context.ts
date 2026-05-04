import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getLocalUserById } from "../localStore";
import { getHeaderValue } from "./requestHeaders";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    const localUserIdHeader = getHeaderValue(opts.req as any, "x-local-user-id");
    const localUserId = localUserIdHeader ? parseInt(localUserIdHeader, 10) : NaN;
    const localUser = Number.isFinite(localUserId) ? getLocalUserById(localUserId) : null;
    user = (localUser as User | null) ?? null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
