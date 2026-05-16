import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  json,
  datetime,
  tinyint,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Students table - เก็บข้อมูลนักศึกษา
 */
export const students = mysqlTable("students", {
  id: int("id").autoincrement().primaryKey(),
  studentId: varchar("studentId", { length: 20 }).notNull().unique(), // รหัสนักศึกษา
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  year: mysqlEnum("year", ["1", "2", "3", "4"]).notNull(), // ชั้นปี
  branch: varchar("branch", { length: 100 }).notNull(), // สาขาที่เรียน
  status: mysqlEnum("status", ["active", "inactive", "graduated"]).default("active").notNull(),
  profileImage: varchar("profileImage", { length: 500 }), // S3 URL
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Student = typeof students.$inferSelect;
export type InsertStudent = typeof students.$inferInsert;

/**
 * QR Codes table - เก็บข้อมูล QR Code แบบไดนามิก
 */
export const qrCodes = mysqlTable("qrCodes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 255 }).notNull().unique(), // QR Code token
  studentId: int("studentId").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  expiresAt: timestamp("expiresAt").notNull(), // เวลาหมดอายุ QR Code
  usedAt: timestamp("usedAt"), // เวลาที่ใช้งาน
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QRCode = typeof qrCodes.$inferSelect;
export type InsertQRCode = typeof qrCodes.$inferInsert;

/**
 * Access Logs table - บันทึกการเข้าออกห้อง
 */
export const accessLogs = mysqlTable("accessLogs", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("studentId").notNull(),
  roomId: varchar("roomId", { length: 50 }).notNull(), // ห้องที่เข้า
  accessType: mysqlEnum("accessType", ["entry", "exit"]).notNull(), // เข้า/ออก
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  qrCodeId: int("qrCodeId"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  deviceInfo: text("deviceInfo"), // JSON string
  isOfflineSync: boolean("isOfflineSync").default(false).notNull(), // ข้อมูลจากออฟไลน์
  status: mysqlEnum("status", ["success", "failed", "warning"]).default("success").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccessLog = typeof accessLogs.$inferSelect;
export type InsertAccessLog = typeof accessLogs.$inferInsert;

/**
 * Door Sensors table - ข้อมูลเซ็นเซอร์ประตู
 */
export const doorSensors = mysqlTable("doorSensors", {
  id: int("id").autoincrement().primaryKey(),
  roomId: varchar("roomId", { length: 50 }).notNull().unique(),
  roomName: varchar("roomName", { length: 100 }).notNull(),
  sensorStatus: mysqlEnum("sensorStatus", ["open", "closed", "error"]).default("closed").notNull(),
  lastStatusChange: timestamp("lastStatusChange").defaultNow(),
  alertEnabled: boolean("alertEnabled").default(true).notNull(),
  alertSoundUrl: varchar("alertSoundUrl", { length: 500 }), // S3 URL
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DoorSensor = typeof doorSensors.$inferSelect;
export type InsertDoorSensor = typeof doorSensors.$inferInsert;

/**
 * System Settings table - ตั้งค่าระบบ
 */
export const systemSettings = mysqlTable("systemSettings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(), // JSON string
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

/**
 * Access Schedule table - ตั้งเวลาเปิด-ปิดห้องอัตโนมัติ
 */
export const accessSchedules = mysqlTable("accessSchedules", {
  id: int("id").autoincrement().primaryKey(),
  roomId: varchar("roomId", { length: 50 }).notNull(),
  dayOfWeek: tinyint("dayOfWeek").notNull(), // 0-6 (Sunday-Saturday)
  startTime: varchar("startTime", { length: 5 }).notNull(), // HH:mm format
  endTime: varchar("endTime", { length: 5 }).notNull(),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AccessSchedule = typeof accessSchedules.$inferSelect;
export type InsertAccessSchedule = typeof accessSchedules.$inferInsert;

/**
 * Webhook Events table - บันทึก Webhook Events
 */
export const webhookEvents = mysqlTable("webhookEvents", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("eventType", { length: 100 }).notNull(), // เช่น door_not_closed, unauthorized_access
  studentId: int("studentId"),
  roomId: varchar("roomId", { length: 50 }),
  data: text("data").notNull(), // JSON string
  webhookUrl: varchar("webhookUrl", { length: 500 }).notNull(),
  webhookType: mysqlEnum("webhookType", ["line", "telegram", "email", "slack"]).notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
  retryCount: int("retryCount").default(0).notNull(),
  lastError: text("lastError"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

/**
 * Offline Sync Queue table - คิวสำหรับซิงค์ข้อมูลออฟไลน์
 */
export const offlineSyncQueue = mysqlTable("offlineSyncQueue", {
  id: int("id").autoincrement().primaryKey(),
  dataType: varchar("dataType", { length: 50 }).notNull(), // เช่น access_log, qr_code
  data: text("data").notNull(), // JSON string
  deviceId: varchar("deviceId", { length: 100 }).notNull(),
  syncedAt: timestamp("syncedAt"),
  status: mysqlEnum("status", ["pending", "synced", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OfflineSyncQueue = typeof offlineSyncQueue.$inferSelect;
export type InsertOfflineSyncQueue = typeof offlineSyncQueue.$inferInsert;

/**
 * Notification Settings table - ตั้งค่าการแจ้งเตือน
 */
export const notificationSettings = mysqlTable("notificationSettings", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  notificationType: mysqlEnum("notificationType", ["email", "line", "telegram", "slack"]).notNull(),
  webhookUrl: varchar("webhookUrl", { length: 500 }),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  eventTypes: text("eventTypes").notNull(), // JSON array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = typeof notificationSettings.$inferInsert;

/**
 * S3 Backups table - บันทึก S3 Backups
 */
export const s3Backups = mysqlTable("s3Backups", {
  id: int("id").autoincrement().primaryKey(),
  backupType: varchar("backupType", { length: 50 }).notNull(), // logs, images, database
  s3Key: varchar("s3Key", { length: 500 }).notNull(),
  s3Url: varchar("s3Url", { length: 500 }).notNull(),
  fileSize: int("fileSize"), // bytes
  status: mysqlEnum("status", ["completed", "failed"]).default("completed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type S3Backup = typeof s3Backups.$inferSelect;
export type InsertS3Backup = typeof s3Backups.$inferInsert;

/**
 * Re-entry Window table - ตรวจสอบการเข้าใหม่ภายใน 5 นาที
 */
export const reentryWindows = mysqlTable("reentryWindows", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("studentId").notNull(),
  roomId: varchar("roomId", { length: 50 }).notNull(),
  lastExitTime: timestamp("lastExitTime").notNull(),
  windowExpiresAt: timestamp("windowExpiresAt").notNull(), // หมดอายุหลังจาก 5 นาที
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReentryWindow = typeof reentryWindows.$inferSelect;
export type InsertReentryWindow = typeof reentryWindows.$inferInsert;


/**
 * Admin Roles table - ระดับสิทธิ์แอดมิน
 * บันทึกสิทธิ์และบทบาทของแอดมิน
 */
export const adminRoles = mysqlTable("adminRoles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // Foreign key to users table
  role: mysqlEnum("role", ["super_admin", "admin", "moderator"]).notNull(), // ระดับสิทธิ์
  permissions: text("permissions"), // JSON array of permissions
  assignedBy: int("assignedBy"), // Admin ID ที่อนุญาติให้เป็นแอดมิน
  reason: text("reason"), // เหตุผลการให้สิทธิ์
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AdminRole = typeof adminRoles.$inferSelect;
export type InsertAdminRole = typeof adminRoles.$inferInsert;

/**
 * Audit Logs table - บันทึกทุกการกระทำของระบบ
 * เก็บรายละเอียดการกระทำของแอดมินและระบบ
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // Admin ID ที่ทำการ (null สำหรับการกระทำของระบบ)
  actionType: varchar("actionType", { length: 64 }).notNull(), // เช่น APPROVE_ACCESS, OPEN_DOOR_AUTO, CHANGE_SETTINGS, DELETE_STUDENT
  entityType: varchar("entityType", { length: 64 }), // เช่น student, door, setting, admin
  entityId: varchar("entityId", { length: 255 }), // ID ของสิ่งที่ถูกกระทำต่อ
  reason: text("reason"), // เหตุผล (เช่น "ลืมสร้าง QR Code", "Re-entry Window ยังใช้ได้")
  status: mysqlEnum("status", ["success", "failed", "pending"]).default("success").notNull(),
  details: text("details"), // JSON object ของรายละเอียด
  ipAddress: varchar("ipAddress", { length: 45 }), // IPv4 หรือ IPv6
  userAgent: text("userAgent"), // Browser info
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * Access Approvals table - บันทึกการอนุญาติการเข้าห้องโดยแอดมิน
 * เก็บรายละเอียดการอนุญาติแบบ manual
 */
export const accessApprovals = mysqlTable("accessApprovals", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("studentId").notNull(), // Foreign key to students table
  roomId: varchar("roomId", { length: 50 }).notNull(),
  approvedBy: int("approvedBy").notNull(), // Admin ID ที่อนุญาติ
  approvalType: mysqlEnum("approvalType", ["manual_approval", "auto_open", "reentry_window"]).notNull(),
  reason: text("reason").notNull(), // เหตุผลการอนุญาติ (เช่น "ลืมสร้าง QR Code", "QR Code หมดอายุ")
  expiresAt: timestamp("expiresAt"), // เวลาที่อนุญาติหมดอายุ
  approvedAt: timestamp("approvedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccessApproval = typeof accessApprovals.$inferSelect;
export type InsertAccessApproval = typeof accessApprovals.$inferInsert;

/**
 * System Action Logs table - บันทึกการกระทำของระบบอัตโนมัติ
 * เก็บรายละเอียดการกระทำที่ระบบทำเอง
 */
export const systemActionLogs = mysqlTable("systemActionLogs", {
  id: int("id").autoincrement().primaryKey(),
  actionType: varchar("actionType", { length: 64 }).notNull(), // เช่น AUTO_DOOR_OPEN, WEBHOOK_SENT, BACKUP_CREATED, SYNC_OFFLINE_DATA
  actionReason: text("actionReason").notNull(), // เหตุผลการทำการ (เช่น "Re-entry Window ยังใช้ได้", "เวลาเปิดอัตโนมัติตามตั้งค่า")
  targetEntity: varchar("targetEntity", { length: 64 }), // เช่น room_101, student_123
  targetEntityId: varchar("targetEntityId", { length: 255 }),
  status: mysqlEnum("status", ["success", "failed", "pending"]).default("pending").notNull(),
  details: text("details"), // JSON object ของรายละเอียด
  errorMessage: text("errorMessage"), // ข้อความ error ถ้ามี
  retryCount: int("retryCount").default(0).notNull(),
  maxRetries: int("maxRetries").default(3).notNull(),
  nextRetryAt: timestamp("nextRetryAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemActionLog = typeof systemActionLogs.$inferSelect;
export type InsertSystemActionLog = typeof systemActionLogs.$inferInsert;

/**
 * Admin Activity Logs table - บันทึกกิจกรรมของแอดมิน
 * เก็บรายละเอียดการกระทำของแอดมินเท่านั้น
 */
export const adminActivityLogs = mysqlTable("adminActivityLogs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(), // Admin ID ที่ทำการ
  activityType: varchar("activityType", { length: 64 }).notNull(), // เช่น APPROVE_ACCESS, CHANGE_SETTINGS, DELETE_STUDENT, MANAGE_ADMINS
  targetType: varchar("targetType", { length: 64 }), // เช่น student, door, setting, admin
  targetId: varchar("targetId", { length: 255 }), // ID ของสิ่งที่ถูกกระทำต่อ
  targetName: varchar("targetName", { length: 255 }), // ชื่อของสิ่งที่ถูกกระทำต่อ (เช่น ชื่อนักศึกษา, ชื่อห้อง)
  description: text("description"), // คำอธิบายการกระทำ
  oldValue: text("oldValue"), // ค่าเก่า (สำหรับการเปลี่ยนแปลง)
  newValue: text("newValue"), // ค่าใหม่ (สำหรับการเปลี่ยนแปลง)
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  status: mysqlEnum("status", ["success", "failed"]).default("success").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminActivityLog = typeof adminActivityLogs.$inferSelect;
export type InsertAdminActivityLog = typeof adminActivityLogs.$inferInsert;
