import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { qrCodes, accessLogs, doorSensors } from "../../drizzle/schema";
import { logSystemAction } from "../auditLogHelper";
import { eq } from "drizzle-orm";

/**
 * Mock ESP32 API Router
 * สำหรับทดสอบระบบโดยไม่ต้องมี ESP32 จริง
 * 
 * Endpoints:
 * - generateQRCode: สร้าง QR Code ใหม่
 * - verifyQRCode: ตรวจสอบ QR Code
 * - recordAccess: บันทึกการเข้าห้อง
 * - recordExit: บันทึกการออกห้อง
 * - getDoorStatus: ตรวจสอบสถานะประตู
 * - updateDoorStatus: อัพเดตสถานะประตู
 * - recordOfflineExit: บันทึกการออกห้องแบบออฟไลน์
 */
export const mockESP32Router = router({
  /**
   * สร้าง QR Code ใหม่ (Mock)
   */
  generateQRCode: publicProcedure
    .input(
      z.object({
        studentId: z.number().describe("Student ID"),
        roomId: z.string().describe("Room ID"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // สร้าง QR Code token แบบสุ่ม
      const qrToken = `QR_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5); // หมดอายุใน 5 นาที

      await db.insert(qrCodes).values({
        code: qrToken,
        studentId: input.studentId,
        isActive: true,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // บันทึก System Action
      await logSystemAction({
        actionType: "QR_CODE_GENERATED",
        actionReason: "Mock QR Code generated for testing",
        targetEntity: `student_${input.studentId}`,
        targetEntityId: input.roomId,
        status: "success",
        details: {
          qrToken,
          expiresAt: expiresAt.toISOString(),
        },
      });

      return {
        success: true,
        qrCode: qrToken,
        expiresAt: expiresAt.toISOString(),
        message: "QR Code generated successfully",
      };
    }),

  /**
   * ตรวจสอบ QR Code (Mock)
   */
  verifyQRCode: publicProcedure
    .input(
      z.object({
        qrCode: z.string().describe("QR Code token"),
        roomId: z.string().describe("Room ID"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const qr = await db
        .select()
        .from(qrCodes)
        .where(eq(qrCodes.code, input.qrCode))
        .limit(1);

      if (!qr.length) {
        await logSystemAction({
          actionType: "QR_CODE_VERIFICATION_FAILED",
          actionReason: "Invalid QR Code",
          targetEntity: "qr_code",
          targetEntityId: input.qrCode,
          status: "failed",
        });

        return {
          success: false,
          message: "Invalid QR Code",
        };
      }

      const qrData = qr[0];

      // ตรวจสอบว่า QR Code ยังใช้ได้หรือไม่
      if (!qrData.isActive) {
        return {
          success: false,
          message: "QR Code has been used",
        };
      }

      // ตรวจสอบว่า QR Code หมดอายุหรือไม่
      if (new Date() > qrData.expiresAt) {
        return {
          success: false,
          message: "QR Code has expired",
        };
      }

      await logSystemAction({
        actionType: "QR_CODE_VERIFIED",
        actionReason: "QR Code verified successfully",
        targetEntity: `student_${qrData.studentId}`,
        targetEntityId: input.roomId,
        status: "success",
      });

      return {
        success: true,
        studentId: qrData.studentId,
        message: "QR Code verified successfully",
      };
    }),

  /**
   * บันทึกการเข้าห้อง (Mock)
   */
  recordAccess: publicProcedure
    .input(
      z.object({
        studentId: z.number(),
        roomId: z.string(),
        qrCodeId: z.number().optional(),
        accessType: z.enum(["entry", "exit"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(accessLogs).values({
        studentId: input.studentId,
        roomId: input.roomId,
        accessType: input.accessType,
        qrCodeId: input.qrCodeId,
        timestamp: new Date(),
        status: "success",
        isOfflineSync: false,
        createdAt: new Date(),
      });

      // บันทึก System Action
      await logSystemAction({
        actionType: "ACCESS_RECORDED",
        actionReason: `Student ${input.accessType} room ${input.roomId}`,
        targetEntity: `student_${input.studentId}`,
        targetEntityId: input.roomId,
        status: "success",
        details: {
          accessType: input.accessType,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        success: true,
        message: `Access recorded: ${input.accessType}`,
      };
    }),

  /**
   * ตรวจสอบสถานะประตู (Mock)
   */
  getDoorStatus: publicProcedure
    .input(
      z.object({
        roomId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const door = await db
        .select()
        .from(doorSensors)
        .where(eq(doorSensors.roomId, input.roomId))
        .limit(1);

      if (!door.length) {
        return {
          success: false,
          message: "Door not found",
        };
      }

      return {
        success: true,
        roomId: door[0].roomId,
        roomName: door[0].roomName,
        sensorStatus: door[0].sensorStatus,
        lastStatusChange: door[0].lastStatusChange?.toISOString(),
        alertEnabled: door[0].alertEnabled,
      };
    }),

  /**
   * อัพเดตสถานะประตู (Mock)
   */
  updateDoorStatus: publicProcedure
    .input(
      z.object({
        roomId: z.string(),
        sensorStatus: z.enum(["open", "closed", "error"]),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(doorSensors)
        .set({
          sensorStatus: input.sensorStatus,
          lastStatusChange: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(doorSensors.roomId, input.roomId));

      // บันทึก System Action
      await logSystemAction({
        actionType: "DOOR_STATUS_UPDATED",
        actionReason: input.reason || `Door status changed to ${input.sensorStatus}`,
        targetEntity: `door_${input.roomId}`,
        targetEntityId: input.roomId,
        status: "success",
        details: {
          sensorStatus: input.sensorStatus,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        success: true,
        message: `Door status updated to ${input.sensorStatus}`,
      };
    }),

  /**
   * บันทึกการออกห้องแบบออฟไลน์ (Mock)
   * ใช้สำหรับปุ่มออฟไลน์โหมดที่ติดตั้งที่ประตู
   */
  recordOfflineExit: publicProcedure
    .input(
      z.object({
        studentId: z.number(),
        roomId: z.string(),
        reason: z.string().describe("เหตุผลการออกห้องแบบออฟไลน์"),
        timestamp: z.date().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const exitTime = input.timestamp || new Date();

      await db.insert(accessLogs).values({
        studentId: input.studentId,
        roomId: input.roomId,
        accessType: "exit",
        timestamp: exitTime,
        status: "success",
        isOfflineSync: true, // ทำเครื่องหมายว่าเป็นข้อมูลออฟไลน์
        notes: `Offline Mode Exit - ${input.reason}`,
        createdAt: new Date(),
      });

      // บันทึก System Action
      await logSystemAction({
        actionType: "OFFLINE_EXIT_RECORDED",
        actionReason: input.reason,
        targetEntity: `student_${input.studentId}`,
        targetEntityId: input.roomId,
        status: "success",
        details: {
          exitTime: exitTime.toISOString(),
          isOfflineSync: true,
        },
      });

      return {
        success: true,
        message: "Offline exit recorded successfully",
        timestamp: exitTime.toISOString(),
      };
    }),

  /**
   * ทดสอบการเชื่อมต่อ Mock ESP32
   */
  healthCheck: publicProcedure.query(async () => {
    return {
      success: true,
      message: "Mock ESP32 API is running",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    };
  }),
});
