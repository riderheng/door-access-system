import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { studentsRouter } from "./routers/students";
import { accessRouter } from "./routers/access";
import { adminRouter } from "./routers/admin";
import { adminManagementRouter } from "./routers/adminManagement";
import { auditLogViewerRouter } from "./routers/auditLogViewer";
import { notificationsRouter } from "./routers/notifications";
import { doorControlRouter } from "./routers/doorControl";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  students: studentsRouter,
  access: accessRouter,
  admin: adminRouter,
  adminManagement: adminManagementRouter,
  auditLogs: auditLogViewerRouter,
  notifications: notificationsRouter,
  doorControl: doorControlRouter,
});

export type AppRouter = typeof appRouter;
