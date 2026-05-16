import { getDb } from "./db";
import { auditLogs, adminActivityLogs, accessApprovals, systemActionLogs } from "../drizzle/schema";
import type { InsertAuditLog, InsertAdminActivityLog, InsertAccessApproval, InsertSystemActionLog } from "../drizzle/schema";

/**
 * บันทึก Audit Log - สำหรับทุกการกระทำของระบบ
 */
export async function logAuditAction(data: {
  userId?: number; // Admin ID ที่ทำการ (null สำหรับการกระทำของระบบ)
  actionType: string; // เช่น APPROVE_ACCESS, OPEN_DOOR_AUTO, CHANGE_SETTINGS
  entityType?: string; // เช่น student, door, setting
  entityId?: string; // ID ของสิ่งที่ถูกกระทำต่อ
  reason?: string; // เหตุผล
  status?: "success" | "failed" | "pending";
  details?: Record<string, any>; // JSON object
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Audit Log] Database not available");
    return;
  }

  try {
    const insertData: InsertAuditLog = {
      userId: data.userId,
      actionType: data.actionType,
      entityType: data.entityType,
      entityId: data.entityId,
      reason: data.reason,
      status: data.status || "success",
      details: data.details ? JSON.stringify(data.details) : null,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      timestamp: new Date(),
      createdAt: new Date(),
    };

    await db.insert(auditLogs).values(insertData);
    console.log(`[Audit Log] ${data.actionType} - ${data.entityType}:${data.entityId}`);
  } catch (error) {
    console.error("[Audit Log] Failed to log action:", error);
  }
}

/**
 * บันทึก Admin Activity Log - สำหรับการกระทำของแอดมินเท่านั้น
 */
export async function logAdminActivity(data: {
  adminId: number; // Admin ID ที่ทำการ
  activityType: string; // เช่น APPROVE_ACCESS, CHANGE_SETTINGS, DELETE_STUDENT
  targetType?: string; // เช่น student, door, setting
  targetId?: string; // ID ของสิ่งที่ถูกกระทำต่อ
  targetName?: string; // ชื่อของสิ่งที่ถูกกระทำต่อ
  description?: string; // คำอธิบายการกระทำ
  oldValue?: any; // ค่าเก่า
  newValue?: any; // ค่าใหม่
  ipAddress?: string;
  userAgent?: string;
  status?: "success" | "failed";
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Admin Activity Log] Database not available");
    return;
  }

  try {
    const insertData: InsertAdminActivityLog = {
      adminId: data.adminId,
      activityType: data.activityType,
      targetType: data.targetType,
      targetId: data.targetId,
      targetName: data.targetName,
      description: data.description,
      oldValue: data.oldValue ? JSON.stringify(data.oldValue) : null,
      newValue: data.newValue ? JSON.stringify(data.newValue) : null,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      status: data.status || "success",
      timestamp: new Date(),
      createdAt: new Date(),
    };

    await db.insert(adminActivityLogs).values(insertData);
    console.log(`[Admin Activity] ${data.activityType} - ${data.targetType}:${data.targetId}`);
  } catch (error) {
    console.error("[Admin Activity Log] Failed to log activity:", error);
  }
}

/**
 * บันทึก Access Approval - สำหรับการอนุญาติการเข้าห้องโดยแอดมิน
 */
export async function logAccessApproval(data: {
  studentId: number;
  roomId: string;
  approvedBy: number; // Admin ID ที่อนุญาติ
  approvalType: "manual_approval" | "auto_open" | "reentry_window";
  reason: string; // เหตุผลการอนุญาติ (เช่น "ลืมสร้าง QR Code", "QR Code หมดอายุ")
  expiresAt?: Date; // เวลาที่อนุญาติหมดอายุ
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Access Approval] Database not available");
    return;
  }

  try {
    const insertData: InsertAccessApproval = {
      studentId: data.studentId,
      roomId: data.roomId,
      approvedBy: data.approvedBy,
      approvalType: data.approvalType,
      reason: data.reason,
      expiresAt: data.expiresAt,
      approvedAt: new Date(),
      createdAt: new Date(),
    };

    await db.insert(accessApprovals).values(insertData);
    console.log(`[Access Approval] Student ${data.studentId} approved for room ${data.roomId}`);
  } catch (error) {
    console.error("[Access Approval] Failed to log approval:", error);
  }
}

/**
 * บันทึก System Action Log - สำหรับการกระทำของระบบอัตโนมัติ
 */
export async function logSystemAction(data: {
  actionType: string; // เช่น AUTO_DOOR_OPEN, WEBHOOK_SENT, BACKUP_CREATED
  actionReason: string; // เหตุผลการทำการ
  targetEntity?: string; // เช่น room_101, student_123
  targetEntityId?: string;
  status?: "success" | "failed" | "pending";
  details?: Record<string, any>;
  errorMessage?: string;
  retryCount?: number;
  maxRetries?: number;
  nextRetryAt?: Date;
  completedAt?: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[System Action Log] Database not available");
    return;
  }

  try {
    const insertData: InsertSystemActionLog = {
      actionType: data.actionType,
      actionReason: data.actionReason,
      targetEntity: data.targetEntity,
      targetEntityId: data.targetEntityId,
      status: data.status || "pending",
      details: data.details ? JSON.stringify(data.details) : null,
      errorMessage: data.errorMessage,
      retryCount: data.retryCount || 0,
      maxRetries: data.maxRetries || 3,
      nextRetryAt: data.nextRetryAt,
      completedAt: data.completedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(systemActionLogs).values(insertData);
    console.log(`[System Action] ${data.actionType} - ${data.actionReason}`);
  } catch (error) {
    console.error("[System Action Log] Failed to log action:", error);
  }
}

/**
 * ดึง Audit Logs ตามเงื่อนไข
 */
export async function getAuditLogs(options: {
  userId?: number;
  actionType?: string;
  entityType?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Audit Log] Database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(auditLogs)
      .limit(options.limit || 100)
      .offset(options.offset || 0);
    return result;
  } catch (error) {
    console.error("[Audit Log] Failed to fetch logs:", error);
    return [];
  }
}

/**
 * ดึง Admin Activity Logs ตามเงื่อนไข
 */
export async function getAdminActivityLogs(options: {
  adminId?: number;
  activityType?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Admin Activity Log] Database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(adminActivityLogs)
      .limit(options.limit || 100)
      .offset(options.offset || 0);
    return result;
  } catch (error) {
    console.error("[Admin Activity Log] Failed to fetch logs:", error);
    return [];
  }
}

/**
 * ดึง System Action Logs ตามเงื่อนไข
 */
export async function getSystemActionLogs(options: {
  actionType?: string;
  status?: "success" | "failed" | "pending";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[System Action Log] Database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(systemActionLogs)
      .limit(options.limit || 100)
      .offset(options.offset || 0);
    return result;
  } catch (error) {
    console.error("[System Action Log] Failed to fetch logs:", error);
    return [];
  }
}
