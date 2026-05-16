import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookies } from "cookie";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const DEV_ADMIN_USER: User = {
  id: 1,
  openId: "dev-admin",
  name: "Dev Admin",
  email: "dev@localhost.com",
  loginMethod: "dev",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Dev bypass — only when DEV_BYPASS_AUTH=true and dev_admin_session cookie is set
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_BYPASS_AUTH === "true"
  ) {
    const cookies = parseCookies(opts.req.headers.cookie ?? "");
    if (cookies["dev_admin_session"] === "1") {
      return { req: opts.req, res: opts.res, user: DEV_ADMIN_USER };
    }
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }

  return { req: opts.req, res: opts.res, user };
}
