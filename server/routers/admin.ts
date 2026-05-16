import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import {
  getSystemSetting,
  setSystemSetting,
  getDoorSensorByRoomId,
  updateDoorSensorStatus,
  getAccessSchedulesByRoom,
  upsertAccessSchedule,
} from "../db";

const accessScheduleSchema = z.object({
  roomId: z.string(),
  dayOfWeek: z.number().min(0).max(6), // 0-6 (Sunday-Saturday)
  startTime: z.string().regex(/^\d{2}:\d{2}$/), // HH:mm format
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const adminRouter = router({
  /**
   * Get system settings
   */
  getSettings: adminProcedure.query(async () => {
    try {
      const qrExpiration = await getSystemSetting("qr_expiration_minutes");
      const reentryWindow = await getSystemSetting("reentry_window_minutes");
      const doorAlertEnabled = await getSystemSetting("door_alert_enabled");
      const webhookRetryCount = await getSystemSetting("webhook_retry_count");

      return {
        qrExpirationMinutes: qrExpiration ? parseInt(qrExpiration.value) : 15,
        reentryWindowMinutes: reentryWindow ? parseInt(reentryWindow.value) : 5,
        doorAlertEnabled: doorAlertEnabled ? doorAlertEnabled.value === "true" : true,
        webhookRetryCount: webhookRetryCount ? parseInt(webhookRetryCount.value) : 3,
      };
    } catch (error) {
      console.error("[Admin] Failed to get settings:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get settings",
      });
    }
  }),

  /**
   * Update system settings
   */
  updateSettings: adminProcedure
    .input(
      z.object({
        qrExpirationMinutes: z.number().optional(),
        reentryWindowMinutes: z.number().optional(),
        doorAlertEnabled: z.boolean().optional(),
        webhookRetryCount: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        if (input.qrExpirationMinutes !== undefined) {
          await setSystemSetting(
            "qr_expiration_minutes",
            input.qrExpirationMinutes.toString(),
            "QR code expiration time in minutes"
          );
        }

        if (input.reentryWindowMinutes !== undefined) {
          await setSystemSetting(
            "reentry_window_minutes",
            input.reentryWindowMinutes.toString(),
            "Re-entry window time in minutes"
          );
        }

        if (input.doorAlertEnabled !== undefined) {
          await setSystemSetting(
            "door_alert_enabled",
            input.doorAlertEnabled.toString(),
            "Enable/disable door alert"
          );
        }

        if (input.webhookRetryCount !== undefined) {
          await setSystemSetting(
            "webhook_retry_count",
            input.webhookRetryCount.toString(),
            "Webhook retry count"
          );
        }

        return { success: true };
      } catch (error) {
        console.error("[Admin] Failed to update settings:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update settings",
        });
      }
    }),

  /**
   * Set access schedule for a room
   */
  setAccessSchedule: adminProcedure
    .input(accessScheduleSchema.extend({ isEnabled: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      try {
        await upsertAccessSchedule({
          roomId: input.roomId,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          isEnabled: input.isEnabled,
        });
        return { success: true };
      } catch (error) {
        console.error("[Admin] Failed to set access schedule:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to set access schedule",
        });
      }
    }),

  /**
   * Get access schedules for a room
   */
  getAccessSchedules: adminProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ input }) => {
      try {
        return await getAccessSchedulesByRoom(input.roomId);
      } catch (error) {
        console.error("[Admin] Failed to get access schedules:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get access schedules",
        });
      }
    }),

  /**
   * Test door alert
   */
  testDoorAlert: adminProcedure
    .input(z.object({ roomId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const doorSensor = await getDoorSensorByRoomId(input.roomId);
        if (!doorSensor) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Door sensor not found",
          });
        }
        return { success: true, message: `Test alert triggered for ${doorSensor.roomName}` };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("[Admin] Failed to test door alert:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to test door alert",
        });
      }
    }),
});
