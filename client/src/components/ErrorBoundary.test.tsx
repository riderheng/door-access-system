import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

const ChildOk = () => <div>child rendered</div>;
const ChildThrows = () => {
  throw new Error("boom");
};

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("render children เมื่อไม่มี error", () => {
    render(
      <ErrorBoundary>
        <ChildOk />
      </ErrorBoundary>
    );
    expect(screen.getByText("child rendered")).toBeInTheDocument();
  });

  it("แสดง fallback UI เมื่อ child throw error", () => {
    render(
      <ErrorBoundary>
        <ChildThrows />
      </ErrorBoundary>
    );
    expect(
      screen.getByText(/An unexpected error occurred/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });
});
