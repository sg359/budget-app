import { describe, it, expect } from "vitest";
import { collectEnvelopeIdsByType } from "./budgetLogic";

describe("collectEnvelopeIdsByType", () => {
  const envelopes = [
    { id: "m1", type: "monthly", children: [{ id: "m1a", children: [] }] },
    { id: "y1", type: "yearly", children: [{ id: "y1a", children: [] }] },
  ];

  it("returns top-level monthly ids and their descendants", () => {
    const ids = collectEnvelopeIdsByType(envelopes, "monthly");
    expect(ids.has("m1")).toBe(true);
    expect(ids.has("m1a")).toBe(true);
    expect(ids.has("y1")).toBe(false);
    expect(ids.has("y1a")).toBe(false);
  });

  it("treats descendants of a yearly envelope as yearly", () => {
    const ids = collectEnvelopeIdsByType(envelopes, "yearly");
    expect(ids.has("y1")).toBe(true);
    expect(ids.has("y1a")).toBe(true);
    expect(ids.has("m1a")).toBe(false);
  });

  it("defaults a typeless top-level envelope to monthly", () => {
    const ids = collectEnvelopeIdsByType([{ id: "x", children: [] }], "monthly");
    expect(ids.has("x")).toBe(true);
  });
});
