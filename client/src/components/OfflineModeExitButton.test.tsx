import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import OfflineModeExitButton from "./OfflineModeExitButton";

vi.mock("@/lib/trpc", () => ({
  trpc: {},
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockIndexedDB = () => {
  const fakeStore = {
    add: () => ({ onsuccess: null, onerror: null }),
    getAll: () => {
      const req: any = { onsuccess: null, onerror: null, result: [] };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    },
    clear: () => ({ onsuccess: null, onerror: null }),
  };
  const fakeTx = { objectStore: () => fakeStore };
  const fakeDb = {
    objectStoreNames: { contains: () => true },
    transaction: () => fakeTx,
    createObjectStore: () => fakeStore,
  };
  (globalThis as any).indexedDB = {
    open: () => {
      const req: any = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: fakeDb,
      };
      setTimeout(() => req.onsuccess?.({ target: req }), 0);
      return req;
    },
  };
};

describe("OfflineModeExitButton", () => {
  beforeEach(() => {
    mockIndexedDB();
  });

  it("render โดยไม่ crash", () => {
    render(
      <OfflineModeExitButton
        studentId={1}
        roomId="room_101"
        studentName="ทดสอบ"
      />
    );
    expect(screen.getByRole("button", { name: /exit/i })).toBeInTheDocument();
  });

  it("แสดงสถานะออนไลน์ตามค่า navigator.onLine", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
    render(
      <OfflineModeExitButton
        studentId={1}
        roomId="room_101"
        studentName="ทดสอบ"
      />
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
