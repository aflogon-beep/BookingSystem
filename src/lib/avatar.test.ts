import { describe, expect, it } from "vitest";

import { avatarColor, initials } from "./avatar";

describe("initials", () => {
  it("toma la inicial de las dos primeras palabras", () => {
    expect(initials("Ana Pérez")).toBe("AP");
    expect(initials("  carmen   díaz hernández ")).toBe("CD");
    expect(initials("Lukas")).toBe("L");
    expect(initials("")).toBe("");
  });
});

describe("avatarColor", () => {
  it("da siempre el mismo color para el mismo nombre", () => {
    expect(avatarColor("Ana Pérez")).toBe(avatarColor("Ana Pérez"));
    expect(avatarColor("Ana Pérez")).toMatch(/^#[0-9A-F]{6}$/);
  });
});
