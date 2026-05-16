import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import {
  getNotificationSettingsByAdmin,
  upsertNotificationSetting,
} from "../db";
import { sendWebhookNotification } from "../webhookHelper";

const notificationTypeEnum = z.enum(["line", "telegram", "slack", "email"]);

export const notificationsRouter = router({
  getSettings: adminProcedure.query(async ({ ctx }) => {
    return await getNotificationSettingsByAdmin(ctx.user.id);
  }),

  upsertSetting: adminProcedure
    .input(z.object({
      notificationType: notificationTypeEnum,
      webhookUrl: z.string().url().nullable().optional(),
      isEnabled: z.boolean(),
      eventTypes: z.array(z.string()),
    }))
    .mutation(async ({ input, ctx }) => {
      await upsertNotificationSetting(
        ctx.user.id,
        input.notificationType,
        input.webhookUrl ?? null,
        input.isEnabled,
        input.eventTypes,
      );
      return { success: true };
    }),

  testNotification: adminProcedure
    .input(z.object({
      notificationType: notificationTypeEnum,
      webhookUrl: z.string().url(),
    }))
    .mutation(async ({ input }) => {
      const payload = {
        eventType: "TEST_NOTIFICATION",
        message: "นี่คือการทดสอบการแจ้งเตือน — ระบบควบคุมประตู RMUTP",
        timestamp: new Date().toISOString(),
        severity: "info" as const,
      };
      try {
        await sendWebhookNotification(input.notificationType, input.webhookUrl, payload);
        return { success: true };
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "ส่งการทดสอบไม่สำเร็จ — ตรวจสอบ Webhook URL อีกครั้ง",
        });
      }
    }),
});
