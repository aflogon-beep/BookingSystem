import { describe, expect, it } from "vitest";

import { googleCalendarUrl, icsFile, type CalendarEvent } from "./add-to-calendar";

const event: CalendarEvent = {
  uid: "VTABC123",
  title: "Teide al atardecer, estrellas",
  start: "2026-10-14T15:30:00.000Z",
  end: "2026-10-14T20:30:00+00:00",
  location: "Plaza del Cristo; La Laguna",
  details: "Código VTABC123\nLlega 10 min antes",
};

describe("googleCalendarUrl", () => {
  it("rellena título, fechas en UTC y lugar", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261014T153000Z/20261014T203000Z");
    expect(url.searchParams.get("text")).toBe(event.title);
    expect(url.searchParams.get("location")).toBe(event.location);
  });
});

describe("icsFile", () => {
  it("genera un evento con el texto escapado", () => {
    const ics = icsFile(event, new Date("2026-10-11T22:00:00Z"));
    expect(ics).toContain("DTSTART:20261014T153000Z\r\n");
    expect(ics).toContain("DTEND:20261014T203000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261011T220000Z\r\n");
    expect(ics).toContain("SUMMARY:Teide al atardecer\\, estrellas\r\n");
    expect(ics).toContain("LOCATION:Plaza del Cristo\; La Laguna\r\n");
    expect(ics).toContain("DESCRIPTION:Código VTABC123\\nLlega 10 min antes\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

});
