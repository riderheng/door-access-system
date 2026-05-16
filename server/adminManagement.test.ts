import { describe, expect, it, beforeEach } from "vitest";
import { logAdminActivity, logAuditAction, logAccessApproval, logSystemAction } from "./auditLogHelper";

describe("Audit Log Helpers", () => {
  describe("logAdminActivity", () => {
    it("should log admin activity successfully", async () => {
      const result = await logAdminActivity({
        adminId: 1,
        activityType: "CREATE_ADMIN",
        targetType: "admin",
        targetId: "2",
        targetName: "John Doe",
        description: "Create new admin user",
        status: "success",
      });

      // ถ้าไม่มี error ก็ถือว่า pass
      expect(result).toBeUndefined();
    });

    it("should log admin activity with old and new values", async () => {
      const result = await logAdminActivity({
        adminId: 1,
        activityType: "UPDATE_ADMIN_ROLE",
        targetType: "admin",
        targetId: "2",
        targetName: "John Doe",
        description: "Update admin role",
        oldValue: { role: "admin" },
        newValue: { role: "super_admin" },
        status: "success",
      });

      expect(result).toBeUndefined();
    });
  });

  describe("logAuditAction", () => {
    it("should log audit action successfully", async () => {
      const result = await logAuditAction({
        userId: 1,
        actionType: "APPROVE_ACCESS",
        entityType: "student",
        entityId: "123",
        reason: "Student forgot QR code",
        status: "success",
      });

      expect(result).toBeUndefined();
    });

    it("should log audit action with details", async () => {
      const result = await logAuditAction({
        userId: 1,
        actionType: "CHANGE_SETTINGS",
        entityType: "setting",
        entityId: "door_open_time",
        reason: "Update door opening time",
        status: "success",
        details: {
          oldTime: "08:00",
          newTime: "09:00",
        },
      });

      expect(result).toBeUndefined();
    });

    it("should log system action without userId", async () => {
      const result = await logAuditAction({
        actionType: "AUTO_DOOR_OPEN",
        entityType: "door",
        entityId: "room_101",
        reason: "Automatic door opening",
        status: "success",
      });

      expect(result).toBeUndefined();
    });
  });

  describe("logAccessApproval", () => {
    it("should log access approval successfully", async () => {
      const result = await logAccessApproval({
        studentId: 123,
        roomId: "room_101",
        approvedBy: 1,
        approvalType: "manual_approval",
        reason: "Student forgot to create QR code",
      });

      expect(result).toBeUndefined();
    });

    it("should log access approval with expiration", async () => {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      const result = await logAccessApproval({
        studentId: 123,
        roomId: "room_101",
        approvedBy: 1,
        approvalType: "reentry_window",
        reason: "Re-entry window still valid",
        expiresAt,
      });

      expect(result).toBeUndefined();
    });
  });

  describe("logSystemAction", () => {
    it("should log system action successfully", async () => {
      const result = await logSystemAction({
        actionType: "AUTO_DOOR_OPEN",
        actionReason: "Automatic door opening based on schedule",
        targetEntity: "room_101",
        status: "success",
      });

      expect(result).toBeUndefined();
    });

    it("should log system action with retry information", async () => {
      const result = await logSystemAction({
        actionType: "WEBHOOK_SENT",
        actionReason: "Send notification to admin",
        targetEntity: "webhook",
        status: "pending",
        retryCount: 0,
        maxRetries: 3,
      });

      expect(result).toBeUndefined();
    });

    it("should log system action with error message", async () => {
      const result = await logSystemAction({
        actionType: "BACKUP_CREATED",
        actionReason: "Daily backup to S3",
        status: "failed",
        errorMessage: "S3 connection timeout",
      });

      expect(result).toBeUndefined();
    });
  });

  describe("Audit Log Types", () => {
    it("should support all action types", async () => {
      const actionTypes = [
        "APPROVE_ACCESS",
        "OPEN_DOOR_AUTO",
        "CHANGE_SETTINGS",
        "DELETE_STUDENT",
        "CREATE_ADMIN",
        "UPDATE_ADMIN_ROLE",
        "DELETE_ADMIN",
      ];

      for (const actionType of actionTypes) {
        const result = await logAuditAction({
          userId: 1,
          actionType,
          entityType: "test",
          entityId: "1",
          status: "success",
        });

        expect(result).toBeUndefined();
      }
    });

    it("should support all approval types", async () => {
      const approvalTypes: Array<"manual_approval" | "auto_open" | "reentry_window"> = [
        "manual_approval",
        "auto_open",
        "reentry_window",
      ];

      for (const approvalType of approvalTypes) {
        const result = await logAccessApproval({
          studentId: 123,
          roomId: "room_101",
          approvedBy: 1,
          approvalType,
          reason: `Test ${approvalType}`,
        });

        expect(result).toBeUndefined();
      }
    });
  });

  describe("Audit Log with IP and User Agent", () => {
    it("should log with IP address and user agent", async () => {
      const result = await logAdminActivity({
        adminId: 1,
        activityType: "CREATE_ADMIN",
        targetType: "admin",
        targetId: "2",
        targetName: "John Doe",
        description: "Create new admin",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        status: "success",
      });

      expect(result).toBeUndefined();
    });

    it("should log audit action with IP and user agent", async () => {
      const result = await logAuditAction({
        userId: 1,
        actionType: "APPROVE_ACCESS",
        entityType: "student",
        entityId: "123",
        reason: "Student forgot QR code",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        status: "success",
      });

      expect(result).toBeUndefined();
    });
  });
});
