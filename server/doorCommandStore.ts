type DoorCommand = "unlock" | "lock";

interface PendingCommand {
  command: DoorCommand;
  expiresAt: Date;
  sentAt: Date;
}

// In-memory store: roomId → pending command
const store = new Map<string, PendingCommand>();

export function setCommand(roomId: string, command: DoorCommand, ttlSeconds = 30) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  store.set(roomId, { command, expiresAt, sentAt: new Date() });
}

// Returns the command and clears it (consumed once)
export function consumeCommand(roomId: string): PendingCommand | null {
  const entry = store.get(roomId);
  if (!entry) return null;
  if (new Date() > entry.expiresAt) {
    store.delete(roomId);
    return null;
  }
  store.delete(roomId);
  return entry;
}

export function peekCommand(roomId: string): PendingCommand | null {
  const entry = store.get(roomId);
  if (!entry) return null;
  if (new Date() > entry.expiresAt) {
    store.delete(roomId);
    return null;
  }
  return entry;
}

export function getAllPending(): { roomId: string; command: DoorCommand; expiresAt: Date }[] {
  const now = new Date();
  const result: { roomId: string; command: DoorCommand; expiresAt: Date }[] = [];
  for (const [roomId, entry] of store.entries()) {
    if (now <= entry.expiresAt) {
      result.push({ roomId, command: entry.command, expiresAt: entry.expiresAt });
    } else {
      store.delete(roomId);
    }
  }
  return result;
}
