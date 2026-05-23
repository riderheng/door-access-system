import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import {
  getNotificationSettingsByAdmin,
  upsertNotificationSetting,
} from "../db";
import { sendWebhookNotification } from "../webhookHelper";

const notificationTypeEnum = z.enum(["line", "telegram", "slack", "email"]);

const destinationSchema = z
  .object({
    notificationType: notificationTypeEnum,
    webhookUrl: z.string().min(1),
  })
  .refine(
    ({ notificationType, webhookUrl }) =>
      notificationType === "email"
        ? z.string().email().safeParse(webhookUrl).success
        : z.string().url().safeParse(webhookUrl).success,
    {
      message:
        "Email type ต้องเป็นที่อยู่อีเมล, ส่วนชนิดอื่นต้องเป็น URL ที่ถูกต้อง",
      path: ["webhookUrl"],
    }
  );

export const notificationsRouter = router({
  getSettings: adminProcedure.query(async ({ ctx }) => {
    return await getNotificationSettingsByAdmin(ctx.user.id);
  }),

  upsertSetting: adminProcedure
    .input(z.object({
      notificationType: notificationTypeEnum,
      webhookUrl: z.string().nullable().optional(),
      isEnabled: z.boolean(),
      eventTypes: z.array(z.string()),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.isEnabled && input.webhookUrl) {
        const check = destinationSchema.safeParse({
          notificationType: input.notificationType,
          webhookUrl: input.webhookUrl,
        });
        if (!check.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: check.error.issues[0]?.message ?? "Invalid destination",
          });
        }
      }
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
    .input(destinationSchema)
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
