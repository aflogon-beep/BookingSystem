import { describe, expect, it } from "vitest";

import { clientIpFrom, loginRules, webBookingRules } from "./rate-limits";

describe("límites de intentos", () => {
  it("toma la IP del cliente del primer valor de x-forwarded-for", () => {
    expect(clientIpFrom("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
  });

  it("con IPv6 limita por el bloque /64, que una conexión puede recorrer entero", () => {
    expect(clientIpFrom(" 2001:DB8::1 ")).toBe("2001:db8:0:0::/64");
    expect(clientIpFrom("2001:db8:aa:bb:1:2:3:4")).toBe("2001:db8:aa:bb::/64");
    expect(clientIpFrom("2001:db8:aa:bb:ffff::9")).toBe("2001:db8:aa:bb::/64");
    expect(clientIpFrom("2001:0db8:00aa::")).toBe("2001:db8:aa:0::/64");
    expect(clientIpFrom("::ffff:203.0.113.7")).toBe("203.0.113.7");
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
      "login:ip-email:203.0.113.7:ana@example.com",
    ]);
  });
});
