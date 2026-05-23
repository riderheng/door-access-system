import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import {
  generateQRCode,
  getQRCodeByCode,
  invalidateQRCode,
  createAccessLog,
  getStudentById,
  checkReentryWindow,
  createReentryWindow,
  getDoorSensorByRoomId,
  updateDoorSensorStatus,
  countActiveStudents,
  countTodayAccessLogs,
  getAllDoorSensors,
  getAccessLogsFiltered,
} from "../db";
import {
  generateQRCodeToken,
  generateQRCodeImage,
  calculateQRCodeExpiration,
  isQRCodeExpired,
} from "../qrCodeHelper";

export const accessRouter = router({
  /**
   * Generate new QR code for student
   * สร้าง QR code ใหม่สำหรับนักศึกษา
   */
  generateQRCode: publicProcedure
    .input(z.object({ studentId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const token = generateQRCodeToken();
        const expiresAt = calculateQRCodeExpiration(15); // 15 minutes

        await generateQRCode(input.studentId, token, expiresAt);

        const qrImage = await generateQRCodeImage(token);

        return {
          token,
          qrImage,
          expiresAt,
        };
      } catch (error) {
        console.error("[Access] QR Code generation failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate QR code",
        });
      }
    }),

  /**
   * Verify QR code and record access
   * ตรวจสอบ QR code และบันทึกการเข้าห้อง
   */
  verifyAndRecordAccess: publicProcedure
    .input(
      z.object({
        qrCode: z.string(),
        roomId: z.string(),
        accessType: z.enum(["entry", "exit"]),
        deviceInfo: z.object({
          userAgent: z.string().optional(),
          platform: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Find QR code
        const qrCodeRecord = await getQRCodeByCode(input.qrCode);
        if (!qrCodeRecord) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invalid QR code",
          });
        }

        // Check if QR code is active
        if (!qrCodeRecord.isActive) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "QR code is no longer valid",
          });
        }

        // Check if QR code is expired
        if (isQRCodeExpired(qrCodeRecord.expiresAt)) {
          await invalidateQRCode(qrCodeRecord.id);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "QR code has expired",
          });
        }

        // Get student info
        const student = await getStudentById(qrCodeRecord.studentId);
        if (!student) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Student not found",
          });
        }

        // On exit: create 5-minute re-entry window
        if (input.accessType === "exit") {
          await createReentryWindow(qrCodeRecord.studentId, input.roomId);
        }

        // Record access log
        const accessLog = await createAccessLog({
          studentId: qrCodeRecord.studentId,
          roomId: input.roomId,
          accessType: input.accessType,
          qrCodeId: qrCodeRecord.id,
          deviceInfo: input.deviceInfo ? JSON.stringify(input.deviceInfo) : undefined,
          status: "success",
        });

        // Invalidate QR code after use
        await invalidateQRCode(qrCodeRecord.id);

        return {
          success: true,
          student: {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            studentId: student.studentId,
            year: student.year,
            branch: student.branch,
          },
          accessType: input.accessType,
          timestamp: new Date(),
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("[Access] Access verification failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to verify access",
        });
      }
    }),

  /**
   * Get door sensor status
   * ตรวจสอบสถานะเซ็นเซอร์ประตู
   */
  getDoorStatus: publicProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ input }) => {
      try {
        const doorSensor = await getDoorSensorByRoomId(input.roomId);
        if (!doorSensor) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Door sensor not found",
          });
        }

        return {
          roomId: doorSensor.roomId,
          roomName: doorSensor.roomName,
          status: doorSensor.sensorStatus,
          lastStatusChange: doorSensor.lastStatusChange,
          alertEnabled: doorSensor.alertEnabled,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("[Access] Failed to get door status:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get door status",
        });
      }
    }),

  /**
   * Get dashboard stats
   */
  getStats: adminProcedure.query(async () => {
    const [totalStudents, todayAccess, allDoors] = await Promise.all([
      countActiveStudents(),
      countTodayAccessLogs(),
      getAllDoorSensors(),
    ]);
    const openDoors = allDoors.filter(d => d.sensorStatus === 'open').length;
    return { totalStudents, todayAccess, openDoors, totalDoors: allDoors.length };
  }),

  /**
   * Get paginated access logs with optional filters
   */
  getAccessLogs: adminProcedure
    .input(z.object({
      studentId: z.number().optional(),
      roomId: z.string().optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      return await getAccessLogsFiltered(input);
    }),

  /**
   * Update door sensor status (from ESP32)
   * อัพเดตสถานะเซ็นเซอร์ประตู (จาก ESP32)
   */
  updateDoorStatus: publicProcedure
    .input(
      z.object({
        roomId: z.string(),
        status: z.enum(["open", "closed", "error"]),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await updateDoorSensorStatus(input.roomId, input.status);
        return { success: true };
      } catch (error) {
        console.error("[Access] Failed to update door status:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update door status",
        });
      }
    }),

  /**
   * Record offline exit (from PWA / ESP32 sync queue)
   * บันทึกการออกห้องที่เกิดในโหมดออฟไลน์ เมื่อ client หรือ ESP32 sync กลับมา
   */
  recordOfflineExit: publicProcedure
    .input(
      z.object({
        studentId: z.number(),
        roomId: z.string(),
        reason: z.string().optional(),
        timestamp: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const student = await getStudentById(input.studentId);
        if (!student) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Student not found",
          });
        }

        await createAccessLog({
          studentId: input.studentId,
          roomId: input.roomId,
          accessType: "exit",
          isOfflineSync: true,
          status: "success",
          notes: input.reason ?? "Offline mode exit",
          timestamp: input.timestamp ?? new Date(),
        });

        return { success: true, syncedAt: new Date() };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("[Access] Failed to record offline exit:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to record offline exit",
        });
      }
    }),
});
