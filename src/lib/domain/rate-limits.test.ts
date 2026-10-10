import { describe, expect, it } from "vitest";

import { clientIpFrom, loginRules, webBookingRules } from "./rate-limits";

describe("límites de intentos", () => {
  it("toma la IP del cliente del primer valor de x-forwarded-for", () => {
    expect(clientIpFrom("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    expect(clientIpFrom(" 2001:DB8::1 ")).toBe("2001:db8::1");
  });

  it("sin IP pública (local o tests) no limita", () => {
    expect(clientIpFrom(null)).toBeNull();
    expect(clientIpFrom("")).toBeNull();
    expect(clientIpFrom("127.0.0.1")).toBeNull();
    expect(clientIpFrom("::1")).toBeNull();
    expect(clientIpFrom("x".repeat(100))).toBeNull();
  });

  it("las claves separan reserva web y login, por IP y por email en minúsculas", () => {
    expect(webBookingRules("203.0.113.7", " Ana@Example.com ")).toEqual([
      { key: "web-booking:ip:203.0.113.7", limit: 5, windowSeconds: 600 },
      { key: "web-booking:email:ana@example.com", limit: 5, windowSeconds: 86400 },
    ]);
    expect(loginRules("203.0.113.7", "Ana@Example.com").map((rule) => rule.key)).toEqual([
      "login:ip:203.0.113.7",
      "login:email:ana@example.com",
    ]);
  });
});
