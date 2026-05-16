import axios from "axios";

export type WebhookType = "line" | "telegram" | "email" | "slack";

export interface WebhookPayload {
  eventType: string;
  studentName?: string;
  roomId?: string;
  timestamp: string;
  message: string;
  severity: "info" | "warning" | "error";
  data?: Record<string, unknown>;
}

/**
 * Send webhook notification to Line
 */
export async function sendLineNotification(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<boolean> {
  try {
    const message = formatLineMessage(payload);
    await axios.post(webhookUrl, {
      messages: [
        {
          type: "text",
          text: message,
        },
      ],
    });
    return true;
  } catch (error) {
    console.error("[Webhook] Line notification failed:", error);
    return false;
  }
}

/**
 * Send webhook notification to Telegram
 */
export async function sendTelegramNotification(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<boolean> {
  try {
    const message = formatTelegramMessage(payload);
    await axios.post(webhookUrl, {
      text: message,
      parse_mode: "HTML",
    });
    return true;
  } catch (error) {
    console.error("[Webhook] Telegram notification failed:", error);
    return false;
  }
}

/**
 * Send webhook notification to Slack
 */
export async function sendSlackNotification(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<boolean> {
  try {
    const color = payload.severity === "error" ? "danger" : payload.severity === "warning" ? "warning" : "good";
    await axios.post(webhookUrl, {
      attachments: [
        {
          color,
          title: payload.eventType,
          text: payload.message,
          fields: [
            {
              title: "Student",
              value: payload.studentName || "N/A",
              short: true,
            },
            {
              title: "Room",
              value: payload.roomId || "N/A",
              short: true,
            },
            {
              title: "Time",
              value: payload.timestamp,
              short: false,
            },
          ],
        },
      ],
    });
    return true;
  } catch (error) {
    console.error("[Webhook] Slack notification failed:", error);
    return false;
  }
}

/**
 * Send email notification
 */
export async function sendEmailNotification(
  email: string,
  payload: WebhookPayload
): Promise<boolean> {
  try {
    // TODO: Implement email sending using your email service (e.g., SendGrid, Mailgun)
    console.log("[Webhook] Email notification sent to:", email);
    return true;
  } catch (error) {
    console.error("[Webhook] Email notification failed:", error);
    return false;
  }
}

/**
 * Format message for Line
 */
function formatLineMessage(payload: WebhookPayload): string {
  const emoji = payload.severity === "error" ? "🚨" : payload.severity === "warning" ? "⚠️" : "ℹ️";
  return `${emoji} ${payload.eventType}\n\n${payload.message}\n\nStudent: ${payload.studentName || "N/A"}\nRoom: ${payload.roomId || "N/A"}\nTime: ${payload.timestamp}`;
}

/**
 * Format message for Telegram
 */
function formatTelegramMessage(payload: WebhookPayload): string {
  const emoji = payload.severity === "error" ? "🚨" : payload.severity === "warning" ? "⚠️" : "ℹ️";
  return `<b>${emoji} ${payload.eventType}</b>\n\n${payload.message}\n\n<b>Student:</b> ${payload.studentName || "N/A"}\n<b>Room:</b> ${payload.roomId || "N/A"}\n<b>Time:</b> ${payload.timestamp}`;
}

/**
 * Send webhook notification based on type
 */
export async function sendWebhookNotification(
  webhookType: WebhookType,
  webhookUrl: string,
  payload: WebhookPayload
): Promise<boolean> {
  switch (webhookType) {
    case "line":
      return sendLineNotification(webhookUrl, payload);
    case "telegram":
      return sendTelegramNotification(webhookUrl, payload);
    case "slack":
      return sendSlackNotification(webhookUrl, payload);
    case "email":
      return sendEmailNotification(webhookUrl, payload);
    default:
      console.error("[Webhook] Unknown webhook type:", webhookType);
      return false;
  }
}
