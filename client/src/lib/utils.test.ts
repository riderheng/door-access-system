import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn (className merger)", () => {
  it("รวม class strings ปกติ", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("ละ falsy values", () => {
    expect(cn("foo", null, undefined, false, "bar")).toBe("foo bar");
  });

  it("merge tailwind utility ที่ขัดกัน — เก็บอันท้าย", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("รองรับ conditional object form", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("รองรับ array form", () => {
    expect(cn(["foo", "bar"], "baz")).toBe("foo bar baz");
  });
});
