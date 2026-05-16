import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { adminRoles, users } from "../../drizzle/schema";
import { logAdminActivity, logAuditAction } from "../auditLogHelper";
import { eq } from "drizzle-orm";

export const adminManagementRouter = router({
  /**
   * ดึงรายชื่อผู้ใช้ทั้งหมดในระบบ (สำหรับเลือก promote เป็น admin)
   */
  listUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    }).from(users).orderBy(users.createdAt);
  }),

  /**
   * ดึงรายชื่อแอดมินทั้งหมด
   */
  listAdmins: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const admins = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: adminRoles.role,
        permissions: adminRoles.permissions,
        assignedBy: adminRoles.assignedBy,
        reason: adminRoles.reason,
        createdAt: adminRoles.createdAt,
      })
      .from(users)
      .innerJoin(adminRoles, eq(users.id, adminRoles.userId));

    return admins;
  }),

  /**
   * ดึงข้อมูลแอดมินตามรหัส
   */
  getAdmin: adminProcedure
    .input(z.object({ adminId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const admin = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: adminRoles.role,
          permissions: adminRoles.permissions,
          assignedBy: adminRoles.assignedBy,
          reason: adminRoles.reason,
          createdAt: adminRoles.createdAt,
          updatedAt: adminRoles.updatedAt,
        })
        .from(users)
        .innerJoin(adminRoles, eq(users.id, adminRoles.userId))
        .where(eq(users.id, input.adminId))
        .limit(1);

      return admin[0] || null;
    }),

  /**
   * สร้างแอดมินใหม่
   */
  createAdmin: adminProcedure
    .input(
      z.object({
        userId: z.number().describe("User ID ที่จะให้เป็นแอดมิน"),
        role: z.enum(["super_admin", "admin", "moderator"]).describe("ระดับสิทธิ์"),
        permissions: z
          .array(z.string())
          .optional()
          .describe("รายการสิทธิ์ (JSON array)"),
        reason: z.string().describe("เหตุผลการให้สิทธิ์"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // ตรวจสอบว่าผู้ใช้มีอยู่จริง
      const user = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!user.length) throw new Error("User not found");

      // ตรวจสอบว่าผู้ใช้เป็นแอดมินแล้วหรือไม่
      const existingAdmin = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.userId, input.userId))
        .limit(1);

      if (existingAdmin.length) {
        throw new Error("User is already an admin");
      }

      // สร้างแอดมินใหม่
      await db.insert(adminRoles).values({
        userId: input.userId,
        role: input.role,
        permissions: input.permissions ? JSON.stringify(input.permissions) : null,
        assignedBy: ctx.user.id,
        reason: input.reason,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // บันทึก Admin Activity Log
      await logAdminActivity({
        adminId: ctx.user.id,
        activityType: "CREATE_ADMIN",
        targetType: "admin",
        targetId: input.userId.toString(),
        targetName: user[0].name || "Unknown",
        description: `สร้างแอดมิน ${user[0].name} ด้วยสิทธิ์ ${input.role}`,
        newValue: {
          userId: input.userId,
          role: input.role,
          reason: input.reason,
        },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
        status: "success",
      });

      // บันทึก Audit Log
      await logAuditAction({
        userId: ctx.user.id,
        actionType: "CREATE_ADMIN",
        entityType: "admin",
        entityId: input.userId.toString(),
        reason: input.reason,
        status: "success",
        details: {
          role: input.role,
          permissions: input.permissions,
        },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
      });

      return { success: true, adminId: input.userId };
    }),

  /**
   * อัพเดตสิทธิ์แอดมิน
   */
  updateAdminRole: adminProcedure
    .input(
      z.object({
        adminId: z.number(),
        role: z.enum(["super_admin", "admin", "moderator"]).optional(),
        permissions: z.array(z.string()).optional(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // ดึงข้อมูลแอดมินเก่า
      const oldAdmin = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.userId, input.adminId))
        .limit(1);

      if (!oldAdmin.length) throw new Error("Admin not found");

      // อัพเดตข้อมูล
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (input.role) updateData.role = input.role;
      if (input.permissions) updateData.permissions = JSON.stringify(input.permissions);
      if (input.reason) updateData.reason = input.reason;

      await db
        .update(adminRoles)
        .set(updateData)
        .where(eq(adminRoles.userId, input.adminId));

      // ดึงข้อมูลผู้ใช้
      const user = await db.select().from(users).where(eq(users.id, input.adminId)).limit(1);

      // บันทึก Admin Activity Log
      await logAdminActivity({
        adminId: ctx.user.id,
        activityType: "UPDATE_ADMIN_ROLE",
        targetType: "admin",
        targetId: input.adminId.toString(),
        targetName: user[0]?.name || "Unknown",
        description: `อัพเดตสิทธิ์แอดมิน`,
        oldValue: {
          role: oldAdmin[0].role,
          permissions: oldAdmin[0].permissions,
        },
        newValue: {
          role: input.role || oldAdmin[0].role,
          permissions: input.permissions,
        },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
        status: "success",
      });

      // บันทึก Audit Log
      await logAuditAction({
        userId: ctx.user.id,
        actionType: "UPDATE_ADMIN_ROLE",
        entityType: "admin",
        entityId: input.adminId.toString(),
        reason: input.reason || "Update admin role",
        status: "success",
        details: {
          oldRole: oldAdmin[0].role,
          newRole: input.role,
          permissions: input.permissions,
        },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
      });

      return { success: true };
    }),

  /**
   * ลบแอดมิน
   */
  deleteAdmin: adminProcedure
    .input(
      z.object({
        adminId: z.number(),
        reason: z.string().describe("เหตุผลการลบ"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // ตรวจสอบว่าไม่ลบตัวเอง
      if (input.adminId === ctx.user.id) {
        throw new Error("Cannot delete yourself");
      }

      // ดึงข้อมูลแอดมินที่จะลบ
      const admin = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.userId, input.adminId))
        .limit(1);

      if (!admin.length) throw new Error("Admin not found");

      // ดึงข้อมูลผู้ใช้
      const user = await db.select().from(users).where(eq(users.id, input.adminId)).limit(1);

      // ลบแอดมิน
      await db.delete(adminRoles).where(eq(adminRoles.userId, input.adminId));

      // บันทึก Admin Activity Log
      await logAdminActivity({
        adminId: ctx.user.id,
        activityType: "DELETE_ADMIN",
        targetType: "admin",
        targetId: input.adminId.toString(),
        targetName: user[0]?.name || "Unknown",
        description: `ลบแอดมิน ${user[0]?.name}`,
        oldValue: {
          role: admin[0].role,
          permissions: admin[0].permissions,
        },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
        status: "success",
      });

      // บันทึก Audit Log
      await logAuditAction({
        userId: ctx.user.id,
        actionType: "DELETE_ADMIN",
        entityType: "admin",
        entityId: input.adminId.toString(),
        reason: input.reason,
        status: "success",
        details: {
          role: admin[0].role,
        },
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers["user-agent"],
      });

      return { success: true };
    }),
});
