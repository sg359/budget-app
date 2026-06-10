import { describe, it, expect } from "vitest";
import { collectEnvelopeIdsByType } from "./budgetLogic";
import { makeSnapshot } from "./budgetLogic";

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

describe("makeSnapshot", () => {
  it("deep-copies envelopes and stamps savedAt", () => {
    const state = {
      period: { month: 5, year: 2026 },
      envelopes: [{ id: "a", children: [{ id: "b", children: [] }] }],
      transactions: [{ id: "t1", envelopeId: "a", amount: -10 }],
    };
    const snap = makeSnapshot(state, "2026-06-10T00:00:00.000Z");
    expect(snap.savedAt).toBe("2026-06-10T00:00:00.000Z");
    expect(snap.period).toEqual({ month: 5, year: 2026 });
    state.envelopes[0].children[0].id = "MUT";
    expect(snap.envelopes[0].children[0].id).toBe("b");
  });
});
