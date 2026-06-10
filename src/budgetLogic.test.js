import { describe, it, expect } from "vitest";
import { collectEnvelopeIdsByType } from "./budgetLogic";
import { makeSnapshot } from "./budgetLogic";
import { monthEndReset, yearEndReset } from "./budgetLogic";

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

const baseState = () => ({
  period: { month: 5, year: 2026 },
  envelopes: [
    { id: "m1", type: "monthly", budget: 100, children: [] },
    { id: "y1", type: "yearly", budget: 1200, children: [] },
  ],
  transactions: [
    { id: "t1", envelopeId: "m1", amount: -30 },
    { id: "t2", envelopeId: "y1", amount: -50 },
  ],
});

describe("monthEndReset", () => {
  it("clears monthly tx, keeps yearly tx, leaves budgets, advances month", () => {
    const { newState, newHistory } = monthEndReset(baseState(), [], "2026-06-10T00:00:00.000Z");
    expect(newState.transactions.map(t => t.id)).toEqual(["t2"]);
    expect(newState.envelopes).toEqual(baseState().envelopes);
    expect(newState.period).toEqual({ month: 6, year: 2026 });
    expect(newHistory).toHaveLength(1);
  });

  it("rolls December into next January", () => {
    const s = baseState();
    s.period = { month: 11, year: 2026 };
    const { newState } = monthEndReset(s, [], "x");
    expect(newState.period).toEqual({ month: 0, year: 2027 });
  });
});

describe("yearEndReset", () => {
  it("clears yearly tx, keeps monthly tx, leaves budgets and period", () => {
    const { newState, newHistory } = yearEndReset(baseState(), [], "2026-06-10T00:00:00.000Z");
    expect(newState.transactions.map(t => t.id)).toEqual(["t1"]);
    expect(newState.envelopes).toEqual(baseState().envelopes);
    expect(newState.period).toEqual({ month: 5, year: 2026 });
    expect(newHistory).toHaveLength(1);
  });
});

describe("history cap", () => {
  it("keeps at most 24 snapshots, newest first", () => {
    const old = Array.from({ length: 24 }, (_, i) => ({ savedAt: `old${i}` }));
    const { newHistory } = monthEndReset(baseState(), old, "NEW");
    expect(newHistory).toHaveLength(24);
    expect(newHistory[0].savedAt).toBe("NEW");
  });
});
