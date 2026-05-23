import axios from "axios";
import nodemailer, { type Transporter } from "nodemailer";

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

let cachedTransporter: Transporter | null = null;

function getMailTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });

  return cachedTransporter;
}

/**
 * Send email notification via SMTP (nodemailer)
 * ต้องตั้งค่า SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM ใน .env.local
 */
export async function sendEmailNotification(
  email: string,
  payload: WebhookPayload
): Promise<boolean> {
  const transporter = getMailTransporter();
  if (!transporter) {
    console.warn(
      "[Webhook] Email skipped — SMTP env vars not set (SMTP_HOST/PORT/USER/PASS)"
    );
    return false;
  }

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@example.com";
    const { subject, text, html } = formatEmailMessage(payload);
    await transporter.sendMail({ from, to: email, subject, text, html });
    return true;
  } catch (error) {
    console.error("[Webhook] Email notification failed:", error);
    return false;
  }
}

function formatEmailMessage(payload: WebhookPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const emoji =
    payload.severity === "error"
      ? "🚨"
      : payload.severity === "warning"
        ? "⚠️"
        : "ℹ️";
  const subject = `${emoji} [Door Access] ${payload.eventType}`;
  const text = [
    payload.message,
    "",
    `Student: ${payload.studentName || "N/A"}`,
    `Room: ${payload.roomId || "N/A"}`,
    `Time: ${payload.timestamp}`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px;">
      <h2 style="margin: 0 0 8px;">${emoji} ${escapeHtml(payload.eventType)}</h2>
      <p style="font-size: 15px; line-height: 1.6; white-space: pre-line;">${escapeHtml(payload.message)}</p>
      <table style="margin-top: 16px; font-size: 14px; border-collapse: collapse;">
        <tr><td style="padding: 4px 12px 4px 0; color: #555;"><b>Student</b></td><td>${escapeHtml(payload.studentName || "N/A")}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #555;"><b>Room</b></td><td>${escapeHtml(payload.roomId || "N/A")}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #555;"><b>Time</b></td><td>${escapeHtml(payload.timestamp)}</td></tr>
      </table>
      <p style="margin-top: 24px; font-size: 12px; color: #999;">
        ระบบควบคุมการเข้าใช้ห้องเรียน — RMUTP คณะครุศาสตร์
      </p>
    </div>
  `;
  return { subject, text, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
