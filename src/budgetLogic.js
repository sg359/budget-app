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

function archive(state, history, savedAt) {
  return [makeSnapshot(state, savedAt), ...history].slice(0, 24);
}

// Month End: archive, drop monthly transactions (keep yearly), advance month.
// Budgets are never modified.
export function monthEndReset(state, history, savedAt) {
  const newHistory = archive(state, history, savedAt);
  const yearlyIds = collectEnvelopeIdsByType(state.envelopes, "yearly");
  const transactions = state.transactions.filter(t => yearlyIds.has(t.envelopeId));
  const { month, year } = state.period;
  const newMonth = month === 11 ? 0 : month + 1;
  const newYear = month === 11 ? year + 1 : year;
  return {
    newState: { ...state, period: { month: newMonth, year: newYear }, transactions },
    newHistory,
  };
}

// Year End: archive, drop yearly transactions (keep monthly), leave period.
// Budgets are never modified.
export function yearEndReset(state, history, savedAt) {
  const newHistory = archive(state, history, savedAt);
  const monthlyIds = collectEnvelopeIdsByType(state.envelopes, "monthly");
  const transactions = state.transactions.filter(t => monthlyIds.has(t.envelopeId));
  return {
    newState: { ...state, transactions },
    newHistory,
  };
}
