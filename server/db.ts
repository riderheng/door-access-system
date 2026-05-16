import { eq, and, gt, lt, desc, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  students,
  qrCodes,
  accessLogs,
  doorSensors,
  reentryWindows,
  systemSettings,
  accessSchedules,
  notificationSettings,
  InsertStudent,
  InsertAccessLog,
  InsertAccessSchedule,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Students queries
 */
export async function getStudentByStudentId(studentId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(students).where(eq(students.studentId, studentId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllStudents() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(students).where(eq(students.status, 'active'));
}

export async function createStudent(data: InsertStudent) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(students).values(data);
  return result;
}

/**
 * QR Code queries
 */
export async function generateQRCode(studentId: number, code: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(qrCodes).values({ studentId, code, expiresAt });
  return result;
}

export async function getQRCodeByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(qrCodes).where(eq(qrCodes.code, code)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function invalidateQRCode(qrCodeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return await db.update(qrCodes).set({ isActive: false }).where(eq(qrCodes.id, qrCodeId));
}

/**
 * Access Log queries
 */
export async function createAccessLog(data: InsertAccessLog) {
  const db = await getDb();
  if (!db) return undefined;
  return await db.insert(accessLogs).values(data);
}

export async function getAccessLogsByStudentId(studentId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(accessLogs).where(eq(accessLogs.studentId, studentId)).orderBy(desc(accessLogs.timestamp)).limit(limit);
}

/**
 * Door Sensor queries
 */
export async function getDoorSensorByRoomId(roomId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(doorSensors).where(eq(doorSensors.roomId, roomId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateDoorSensorStatus(roomId: string, status: 'open' | 'closed' | 'error') {
  const db = await getDb();
  if (!db) return undefined;
  return await db.update(doorSensors).set({ sensorStatus: status, lastStatusChange: new Date() }).where(eq(doorSensors.roomId, roomId));
}

/**
 * Re-entry Window queries
 */
export async function checkReentryWindow(studentId: number, roomId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  const result = await db.select().from(reentryWindows).where(
    and(
      eq(reentryWindows.studentId, studentId),
      eq(reentryWindows.roomId, roomId),
      gt(reentryWindows.windowExpiresAt, now)
    )
  ).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createReentryWindow(studentId: number, roomId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes
  return await db.insert(reentryWindows).values({
    studentId,
    roomId,
    lastExitTime: now,
    windowExpiresAt: expiresAt,
  });
}

/**
 * System Settings queries
 */
export async function getSystemSetting(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setSystemSetting(key: string, value: string, description?: string) {
  const db = await getDb();
  if (!db) return undefined;
  return await db.insert(systemSettings).values({ key, value, description }).onDuplicateKeyUpdate({
    set: { value, description },
  });
}

/**
 * Additional Student queries
 */
export async function getStudentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(students).where(eq(students.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllStudentsWithStatus(status?: 'active' | 'inactive' | 'graduated') {
  const db = await getDb();
  if (!db) return [];
  if (status) {
    return await db.select().from(students).where(eq(students.status, status)).orderBy(desc(students.createdAt));
  }
  return await db.select().from(students).orderBy(desc(students.createdAt));
}

export async function updateStudentStatus(id: number, status: 'active' | 'inactive' | 'graduated') {
  const db = await getDb();
  if (!db) return undefined;
  return await db.update(students).set({ status }).where(eq(students.id, id));
}

export async function updateStudent(id: number, data: {
  studentId?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  year?: '1' | '2' | '3' | '4';
  branch?: string;
}) {
  const db = await getDb();
  if (!db) return undefined;
  return await db.update(students).set(data).where(eq(students.id, id));
}

export async function deleteStudent(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return await db.delete(students).where(eq(students.id, id));
}

/**
 * Stats queries (สำหรับ Dashboard)
 */
export async function countActiveStudents() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select().from(students).where(eq(students.status, 'active'));
  return result.length;
}

export async function countTodayAccessLogs() {
  const db = await getDb();
  if (!db) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = await db.select().from(accessLogs).where(gt(accessLogs.timestamp, today));
  return result.length;
}

export async function getAllDoorSensors() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(doorSensors);
}

/**
 * Access Logs with filter + join students
 */
export async function getAccessLogsFiltered(options: {
  studentId?: number;
  roomId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };

  const conditions: SQL[] = [];
  if (options.studentId) conditions.push(eq(accessLogs.studentId, options.studentId));
  if (options.roomId) conditions.push(eq(accessLogs.roomId, options.roomId));
  if (options.dateFrom) conditions.push(gt(accessLogs.timestamp, options.dateFrom));
  if (options.dateTo) conditions.push(lt(accessLogs.timestamp, options.dateTo));

  const baseQuery = db
    .select({
      id: accessLogs.id,
      studentId: accessLogs.studentId,
      roomId: accessLogs.roomId,
      accessType: accessLogs.accessType,
      timestamp: accessLogs.timestamp,
      status: accessLogs.status,
      isOfflineSync: accessLogs.isOfflineSync,
      notes: accessLogs.notes,
      firstName: students.firstName,
      lastName: students.lastName,
      studentCode: students.studentId,
    })
    .from(accessLogs)
    .leftJoin(students, eq(accessLogs.studentId, students.id))
    .orderBy(desc(accessLogs.timestamp))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);

  const logs = conditions.length > 0
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;

  return { logs };
}

/**
 * Access Schedule queries
 */
export async function getAccessSchedulesByRoom(roomId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(accessSchedules).where(eq(accessSchedules.roomId, roomId));
}

export async function upsertAccessSchedule(data: InsertAccessSchedule) {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db
    .select()
    .from(accessSchedules)
    .where(and(eq(accessSchedules.roomId, data.roomId), eq(accessSchedules.dayOfWeek, data.dayOfWeek as number)))
    .limit(1);

  if (existing.length > 0) {
    return await db
      .update(accessSchedules)
      .set({ startTime: data.startTime, endTime: data.endTime, isEnabled: data.isEnabled })
      .where(eq(accessSchedules.id, existing[0].id));
  }
  return await db.insert(accessSchedules).values(data);
}

/**
 * Notification Settings queries
 */
export async function getNotificationSettingsByAdmin(adminId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(notificationSettings).where(eq(notificationSettings.adminId, adminId));
}

export async function upsertNotificationSetting(
  adminId: number,
  notificationType: 'email' | 'line' | 'telegram' | 'slack',
  webhookUrl: string | null,
  isEnabled: boolean,
  eventTypes: string[]
) {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db
    .select()
    .from(notificationSettings)
    .where(and(eq(notificationSettings.adminId, adminId), eq(notificationSettings.notificationType, notificationType)))
    .limit(1);

  if (existing.length > 0) {
    return await db
      .update(notificationSettings)
      .set({ webhookUrl: webhookUrl ?? undefined, isEnabled, eventTypes: JSON.stringify(eventTypes) })
      .where(eq(notificationSettings.id, existing[0].id));
  }
  return await db.insert(notificationSettings).values({
    adminId,
    notificationType,
    webhookUrl: webhookUrl ?? undefined,
    isEnabled,
    eventTypes: JSON.stringify(eventTypes),
  });
}
