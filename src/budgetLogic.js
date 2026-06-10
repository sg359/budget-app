// Collect ids of every envelope whose effective cadence === `type`.
// Effective cadence is inherited from the top-level ancestor (children
// inherit the root envelope's type); a typeless root defaults to "monthly".
export function collectEnvelopeIdsByType(envelopes, type) {
  const ids = new Set();
  const walk = (envs, inheritedType) => {
    for (const e of envs) {
      const effective = inheritedType ?? e.type ?? "monthly";
      if (effective === type) ids.add(e.id);
      if (e.children) walk(e.children, effective);
    }
  };
  walk(envelopes, null);
  return ids;
}

// Build a History snapshot of the current state. `savedAt` is passed in
// (not generated here) so this stays pure and testable.
export function makeSnapshot(state, savedAt) {
  return {
    period: { ...state.period },
    envelopes: JSON.parse(JSON.stringify(state.envelopes)),
    transactions: [...state.transactions],
    savedAt,
  };
}
