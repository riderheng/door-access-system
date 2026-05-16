import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { setCommand, getAllPending, peekCommand } from "../doorCommandStore";
import { logSystemAction } from "../auditLogHelper";

export const doorControlRouter = router({
  // Admin sends unlock/lock command to a room
  sendCommand: adminProcedure
    .input(z.object({
      roomId: z.string(),
      command: z.enum(["unlock", "lock"]),
    }))
    .mutation(async ({ input }) => {
      setCommand(input.roomId, input.command, 30);

      await logSystemAction({
        actionType: input.command === "unlock" ? "DOOR_UNLOCK_COMMAND" : "DOOR_LOCK_COMMAND",
        actionReason: `Admin sent ${input.command} command`,
        targetEntity: `door_${input.roomId}`,
        targetEntityId: input.roomId,
        status: "success",
        details: { command: input.command, ttlSeconds: 30 },
      });

      return { success: true, command: input.command, roomId: input.roomId };
    }),

  // Admin views all pending commands
  getPendingCommands: adminProcedure.query(() => {
    return getAllPending();
  }),

  // Check if a room has a pending command (without consuming it)
  peekCommand: publicProcedure
    .input(z.object({ roomId: z.string() }))
    .query(({ input }) => {
      const cmd = peekCommand(input.roomId);
      return cmd ? { command: cmd.command, expiresAt: cmd.expiresAt } : null;
    }),
});
