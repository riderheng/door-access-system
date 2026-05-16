import { nanoid } from "nanoid";
import QRCode from "qrcode";

/**
 * Generate a unique QR code token
 * ใช้ nanoid เพื่อสร้าง token ที่ไม่ซ้ำกัน
 */
export function generateQRCodeToken(): string {
  return nanoid(32); // 32 character unique token
}

/**
 * Generate QR code image as data URL
 * สร้าง QR code image เป็น data URL
 */
export async function generateQRCodeImage(token: string): Promise<string> {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(token, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 300,
    });
    return qrCodeDataUrl;
  } catch (error) {
    console.error("[QR Code] Failed to generate image:", error);
    throw error;
  }
}

/**
 * Generate QR code as Buffer
 * สร้าง QR code image เป็น Buffer สำหรับเก็บไว้ใน S3
 */
export async function generateQRCodeBuffer(token: string): Promise<Buffer> {
  try {
    const buffer = await QRCode.toBuffer(token, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 300,
    });
    return buffer;
  } catch (error) {
    console.error("[QR Code] Failed to generate buffer:", error);
    throw error;
  }
}

/**
 * Calculate QR code expiration time
 * คำนวณเวลาหมดอายุของ QR code (ค่าเริ่มต้น 15 นาที)
 */
export function calculateQRCodeExpiration(expirationMinutes: number = 15): Date {
  const now = new Date();
  return new Date(now.getTime() + expirationMinutes * 60 * 1000);
}

/**
 * Check if QR code is expired
 * ตรวจสอบว่า QR code หมดอายุหรือไม่
 */
export function isQRCodeExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}
