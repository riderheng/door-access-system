import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { auditLogs, adminActivityLogs, systemActionLogs, accessApprovals, users } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export const auditLogViewerRouter = router({
  /**
   * ดึง Audit Logs ทั้งหมด
   */
  getAuditLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db
        .select({
          id: auditLogs.id,
          userId: auditLogs.userId,
          adminName: users.name,
          actionType: auditLogs.actionType,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          reason: auditLogs.reason,
          status: auditLogs.status,
          details: auditLogs.details,
          ipAddress: auditLogs.ipAddress,
          timestamp: auditLogs.timestamp,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .orderBy(desc(auditLogs.timestamp))
        .limit(input.limit)
        .offset(input.offset);

      return result;
    }),

  /**
   * ดึง Admin Activity Logs
   */
  getAdminActivityLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db
        .select({
          id: adminActivityLogs.id,
          adminId: adminActivityLogs.adminId,
          adminName: users.name,
          activityType: adminActivityLogs.activityType,
          targetType: adminActivityLogs.targetType,
          targetId: adminActivityLogs.targetId,
          targetName: adminActivityLogs.targetName,
          description: adminActivityLogs.description,
          oldValue: adminActivityLogs.oldValue,
          newValue: adminActivityLogs.newValue,
          status: adminActivityLogs.status,
          ipAddress: adminActivityLogs.ipAddress,
          timestamp: adminActivityLogs.timestamp,
        })
        .from(adminActivityLogs)
        .leftJoin(users, eq(adminActivityLogs.adminId, users.id))
        .orderBy(desc(adminActivityLogs.timestamp))
        .limit(input.limit)
        .offset(input.offset);

      return result;
    }),

  /**
   * ดึง System Action Logs
   */
  getSystemActionLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db
        .select()
        .from(systemActionLogs)
        .orderBy(desc(systemActionLogs.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return result;
    }),

  /**
   * ดึง Access Approvals (การอนุญาติการเข้าห้อง)
   */
  getAccessApprovals: adminProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db
        .select()
        .from(accessApprovals)
        .orderBy(desc(accessApprovals.approvedAt))
        .limit(input.limit)
        .offset(input.offset);

      return result;
    }),

  /**
   * ดึงสรุปกิจกรรม (Summary)
   */
  getSummary: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // นับ Audit Logs ในวันนี้
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const auditLogsToday = await db.select().from(auditLogs);
    const adminActivityToday = await db.select().from(adminActivityLogs);
    const systemActionToday = await db.select().from(systemActionLogs);
    const accessApprovalsToday = await db.select().from(accessApprovals);

    return {
      auditLogsTotal: auditLogsToday.length,
      adminActivityTotal: adminActivityToday.length,
      systemActionTotal: systemActionToday.length,
      accessApprovalsTotal: accessApprovalsToday.length,
      totalLogs:
        auditLogsToday.length +
        adminActivityToday.length +
        systemActionToday.length +
        accessApprovalsToday.length,
    };
  }),
});
