import { describe, expect, it } from "vitest";
import {
  generateQRCodeToken,
  calculateQRCodeExpiration,
  isQRCodeExpired,
} from "./qrCodeHelper";

describe("QR Code Helper", () => {
  describe("generateQRCodeToken", () => {
    it("should generate a unique token", () => {
      const token1 = generateQRCodeToken();
      const token2 = generateQRCodeToken();

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(32);
      expect(token2.length).toBe(32);
    });
  });

  describe("calculateQRCodeExpiration", () => {
    it("should calculate expiration time correctly", () => {
      const now = new Date();
      const expiresAt = calculateQRCodeExpiration(15);

      const expectedTime = now.getTime() + 15 * 60 * 1000;
      const actualTime = expiresAt.getTime();

      // Allow 1 second tolerance
      expect(Math.abs(actualTime - expectedTime)).toBeLessThan(1000);
    });

    it("should use default 15 minutes when not specified", () => {
      const now = new Date();
      const expiresAt = calculateQRCodeExpiration();

      const expectedTime = now.getTime() + 15 * 60 * 1000;
      const actualTime = expiresAt.getTime();

      expect(Math.abs(actualTime - expectedTime)).toBeLessThan(1000);
    });
  });

  describe("isQRCodeExpired", () => {
    it("should return false for future expiration time", () => {
      const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
      expect(isQRCodeExpired(futureTime)).toBe(false);
    });

    it("should return true for past expiration time", () => {
      const pastTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes in past
      expect(isQRCodeExpired(pastTime)).toBe(true);
    });
  });
});
