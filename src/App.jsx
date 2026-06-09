import { useState, useEffect, useCallback } from "react";

// ── Storage helpers ──────────────────────────────────────────────────────────
const STORAGE_KEY = "envelope_budget_v1";
const HISTORY_KEY = "envelope_budget_history_v1";

async function loadData() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function saveData(data) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
async function loadHistory() {
  try {
    const r = await window.storage.get(HISTORY_KEY);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
}
async function saveHistory(h) {
  try { await window.storage.set(HISTORY_KEY, JSON.stringify(h)); } catch {}
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n) {
  const abs = Math.abs(n);
  const s = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (n < 0 ? "-$" : "$") + s;
}

function currentPeriod() {
  const d = new Date();
  return { month: d.getMonth(), year: d.getFullYear() };
}

function getEnvelopeById(envelopes, id) {
  for (const e of envelopes) {
    if (e.id === id) return e;
    if (e.children) {
      const found = getEnvelopeById(e.children, id);
      if (found) return found;
    }
  }
  return null;
}

function computeBalance(env, allTx) {
  const myTx = allTx.filter(t => t.envelopeId === env.id);
  const spent = myTx.reduce((s, t) => s + t.amount, 0);
  const childBalance = (env.children || []).reduce((s, c) => s + computeBalance(c, allTx), 0);
  return env.budget + spent + childBalance;
}

function computeDirectBalance(env, allTx) {
  const myTx = allTx.filter(t => t.envelopeId === env.id);
  return env.budget + myTx.reduce((s, t) => s + t.amount, 0);
}

function computeTotalBudget(env) {
  return env.budget + (env.children || []).reduce((s, c) => s + computeTotalBudget(c), 0);
}

function defaultState() {
  const { month, year } = currentPeriod();
  return {
    period: { month, year },
    envelopes: [],
    transactions: [],
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ balance, budget }) {
  if (budget <= 0) return null;
  const pct = Math.max(0, Math.min(100, (balance / budget) * 100));
  const color = pct > 50 ? "#22c55e" : pct > 20 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ height: 4, background: "#1e293b", borderRadius: 2, marginTop: 6 }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.3s" }} />
    </div>
  );
}

function EnvelopeCard({ env, allTx, depth = 0, onOpen, onAddSub }) {
  const balance = computeBalance(env, allTx);
  const totalBudget = computeTotalBudget(env);
  const hasChildren = env.children && env.children.length > 0;
  const balColor = balance < 0 ? "#ef4444" : balance < totalBudget * 0.2 ? "#f59e0b" : "#22c55e";

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div
        onClick={() => onOpen(env.id)}
        style={{
          background: depth === 0 ? "#1e293b" : "#162032",
          border: `1px solid ${depth === 0 ? "#334155" : "#1e2d42"}`,
          borderRadius: 12,
          padding: "14px 16px",
          marginBottom: 8,
          cursor: "pointer",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {env.type === "yearly" && (
                <span style={{ fontSize: 10, background: "#1d4ed8", color: "#93c5fd", padding: "1px 6px", borderRadius: 4, fontWeight: 700, letterSpacing: "0.05em" }}>YEARLY</span>
              )}
              <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{env.name}</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Budget: {fmt(totalBudget)}
              {hasChildren && " (combined)"}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: balColor }}>{fmt(balance)}</div>
            <div style={{ fontSize: 11, color: "#475569" }}>remaining</div>
          </div>
        </div>
        <ProgressBar balance={balance} budget={totalBudget} />
      </div>
      {hasChildren && env.children.map(child => (
        <EnvelopeCard key={child.id} env={child} allTx={allTx} depth={depth + 1} onOpen={onOpen} onAddSub={onAddSub} />
      ))}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#0f172a", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480,
        padding: "20px 20px 36px", maxHeight: "85vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9" }}>{title}</span>
          <button onClick={onClose} style={{ background: "#1e293b", border: "none", color: "#94a3b8", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InputField({ label, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4, fontWeight: 600, letterSpacing: "0.05em" }}>{label}</label>
      <input {...props} style={{
        width: "100%", background: "#1e293b", border: "1px solid #334155",
        borderRadius: 10, padding: "11px 14px", color: "#f1f5f9", fontSize: 15,
        outline: "none", boxSizing: "border-box",
        ...props.style,
      }} />
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", small = false }) {
  const bg = variant === "primary" ? "#3b82f6" : variant === "danger" ? "#dc2626" : variant === "ghost" ? "transparent" : "#1e293b";
  const border = variant === "ghost" ? "1px solid #334155" : "none";
  return (
    <button onClick={onClick} style={{
      background: bg, border, color: variant === "ghost" ? "#94a3b8" : "#fff",
      borderRadius: 10, padding: small ? "8px 14px" : "13px 20px",
      fontSize: small ? 13 : 15, fontWeight: 600, cursor: "pointer", width: small ? "auto" : "100%",
      marginTop: small ? 0 : 6,
    }}>{children}</button>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState("home"); // home | envelope | history
  const [activeId, setActiveId] = useState(null);
  const [modal, setModal] = useState(null); // null | "addEnvelope" | "addTx" | "editBudget" | "monthEnd" | "addSub"
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const d = await loadData();
      const h = await loadHistory();
      setData(d || defaultState());
      setHistory(h || []);
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (newData) => {
    setData(newData);
    await saveData(newData);
  }, []);

  if (loading || !data) return (
    <div style={{ background: "#0a0f1e", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#64748b", fontSize: 15 }}>Loading…</div>
    </div>
  );

  const { envelopes, transactions, period } = data;

  // ── Envelope helpers ────────────────────────────────────────────────────────
  function updateEnvelopeInTree(envs, id, updater) {
    return envs.map(e => {
      if (e.id === id) return updater(e);
      if (e.children) return { ...e, children: updateEnvelopeInTree(e.children, id, updater) };
      return e;
    });
  }

  function removeEnvelopeFromTree(envs, id) {
    return envs
      .filter(e => e.id !== id)
      .map(e => e.children ? { ...e, children: removeEnvelopeFromTree(e.children, id) } : e);
  }

  // ── Active envelope ─────────────────────────────────────────────────────────
  const activeEnv = activeId ? getEnvelopeById(envelopes, activeId) : null;
  const activeTx = activeId ? transactions.filter(t => t.envelopeId === activeId) : [];
  const activeBalance = activeEnv ? computeDirectBalance(activeEnv, transactions) : 0;

  // ── Handlers ────────────────────────────────────────────────────────────────
  function addEnvelope() {
    const { name, budget, type, parentId } = form;
    if (!name || !budget) return;
    const newEnv = {
      id: uid(),
      name: name.trim(),
      budget: parseFloat(budget),
      type: type || "monthly",
      children: [],
    };
    let updated;
    if (parentId) {
      updated = updateEnvelopeInTree(envelopes, parentId, e => ({
        ...e, children: [...(e.children || []), newEnv]
      }));
    } else {
      updated = [...envelopes, newEnv];
    }
    persist({ ...data, envelopes: updated });
    setModal(null); setForm({});
  }

  function addTransaction() {
    const { desc, amount, isExpense } = form;
    if (!amount || !activeId) return;
    const val = parseFloat(amount) * (isExpense !== false ? -1 : 1);
    const tx = {
      id: uid(),
      envelopeId: activeId,
      description: desc?.trim() || "Transaction",
      amount: val,
      date: new Date().toISOString(),
    };
    const updated = { ...data, transactions: [...transactions, tx] };
    persist(updated);
    setModal(null); setForm({});
  }

  function editBudget() {
    const { budget } = form;
    if (!budget || !activeId) return;
    const updated = updateEnvelopeInTree(envelopes, activeId, e => ({ ...e, budget: parseFloat(budget) }));
    persist({ ...data, envelopes: updated });
    setModal(null); setForm({});
  }

  function deleteEnvelope() {
    if (!activeId) return;
    const updated = removeEnvelopeFromTree(envelopes, activeId);
    persist({ ...data, envelopes: updated, transactions: transactions.filter(t => t.envelopeId !== activeId) });
    setView("home"); setActiveId(null);
  }

  async function doMonthEnd() {
    // Save snapshot to history
    const snapshot = {
      period: { ...period },
      envelopes: JSON.parse(JSON.stringify(envelopes)),
      transactions: [...transactions],
      savedAt: new Date().toISOString(),
    };
    const newHistory = [snapshot, ...history].slice(0, 24);
    await saveHistory(newHistory);
    setHistory(newHistory);

    // Reset: monthly envelopes go back to budget, yearly carry over balance
    const { month, year } = currentPeriod();
    const newMonth = month === 11 ? 0 : month + 1;
    const newYear = month === 11 ? year + 1 : year;

    function resetEnvelopes(envs) {
      return envs.map(e => {
        const isYearly = e.type === "yearly";
        if (isYearly) {
          // carry over: new budget = remaining balance
          const bal = computeBalance(e, transactions);
          return { ...e, budget: bal, children: resetEnvelopes(e.children || []) };
        } else {
          return { ...e, children: resetEnvelopes(e.children || []) };
        }
      });
    }

    const resetEnvs = resetEnvelopes(envelopes);
    // Remove monthly transactions; keep yearly (they were folded into budget)
    const yearlyIds = new Set();
    function collectYearly(envs) {
      envs.forEach(e => {
        if (e.type === "yearly") yearlyIds.add(e.id);
        if (e.children) collectYearly(e.children);
      });
    }
    collectYearly(envelopes);
    const remainingTx = transactions.filter(t => yearlyIds.has(t.envelopeId));

    const newData = {
      period: { month: newMonth, year: newYear },
      envelopes: resetEnvs,
      transactions: remainingTx,
    };
    persist(newData);
    setModal(null);
    setView("home");
  }

  // ── Delete transaction ──────────────────────────────────────────────────────
  function deleteTx(id) {
    persist({ ...data, transactions: transactions.filter(t => t.id !== id) });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const totalBudget = envelopes.reduce((s, e) => s + computeTotalBudget(e), 0);
  const totalBalance = envelopes.reduce((s, e) => s + computeBalance(e, transactions), 0);
  const totalBalColor = totalBalance < 0 ? "#ef4444" : totalBalance < totalBudget * 0.2 ? "#f59e0b" : "#22c55e";

  const styles = {
    root: {
      background: "#0a0f1e",
      minHeight: "100vh",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#f1f5f9",
      maxWidth: 480,
      margin: "0 auto",
      paddingBottom: 80,
    },
    header: {
      padding: "20px 20px 0",
      position: "sticky",
      top: 0,
      background: "#0a0f1e",
      zIndex: 10,
      paddingTop: 52,
    },
    body: { padding: "0 16px" },
    fab: {
      position: "fixed",
      bottom: 28,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: "50%",
      background: "#3b82f6",
      border: "none",
      color: "#fff",
      fontSize: 26,
      cursor: "pointer",
      boxShadow: "0 4px 20px rgba(59,130,246,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
    },
    navBar: {
      position: "fixed",
      bottom: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: "100%",
      maxWidth: 480,
      background: "#0f172a",
      borderTop: "1px solid #1e293b",
      display: "flex",
      zIndex: 40,
    },
  };

  return (
    <div style={styles.root}>
      {/* ── HOME VIEW ── */}
      {view === "home" && (
        <>
          <div style={styles.header}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, color: "#475569", fontWeight: 600, letterSpacing: "0.08em" }}>
                  {MONTH_NAMES[period.month]} {period.year}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: totalBalColor, lineHeight: 1.1 }}>
                  {fmt(totalBalance)}
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>of {fmt(totalBudget)} budgeted</div>
              </div>
              <button onClick={() => setModal("monthEnd")} style={{
                background: "#1e293b", border: "1px solid #334155", color: "#94a3b8",
                borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600,
                cursor: "pointer", flexShrink: 0,
              }}>Month End →</button>
            </div>
          </div>

          <div style={styles.body}>
            {envelopes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🪙</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>No envelopes yet</div>
                <div style={{ fontSize: 14, marginTop: 6 }}>Tap + to create your first budget envelope</div>
              </div>
            ) : (
              envelopes.map(env => (
                <EnvelopeCard
                  key={env.id}
                  env={env}
                  allTx={transactions}
                  onOpen={(id) => { setActiveId(id); setView("envelope"); }}
                  onAddSub={(id) => { setForm({ parentId: id }); setModal("addEnvelope"); }}
                />
              ))
            )}
          </div>

          <button style={styles.fab} onClick={() => { setForm({}); setModal("addEnvelope"); }}>+</button>
        </>
      )}

      {/* ── ENVELOPE VIEW ── */}
      {view === "envelope" && activeEnv && (
        <>
          <div style={{ ...styles.header, paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <button onClick={() => { setView("home"); setActiveId(null); }} style={{
                background: "#1e293b", border: "none", color: "#94a3b8",
                borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}>← Back</button>
              <span style={{ fontSize: 17, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeEnv.name}</span>
            </div>

            <div style={{ background: "#1e293b", borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>BALANCE</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: activeBalance < 0 ? "#ef4444" : "#22c55e" }}>{fmt(activeBalance)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>BUDGET</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#94a3b8" }}>{fmt(activeEnv.budget)}</div>
                </div>
              </div>
              <ProgressBar balance={activeBalance} budget={activeEnv.budget} />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button onClick={() => { setForm({ isExpense: true }); setModal("addTx"); }} style={{
                flex: 1, background: "#dc2626", border: "none", color: "#fff",
                borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>− Expense</button>
              <button onClick={() => { setForm({ isExpense: false }); setModal("addTx"); }} style={{
                flex: 1, background: "#16a34a", border: "none", color: "#fff",
                borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>+ Income</button>
              <button onClick={() => { setForm({ budget: String(activeEnv.budget) }); setModal("editBudget"); }} style={{
                background: "#1e293b", border: "1px solid #334155", color: "#94a3b8",
                borderRadius: 10, padding: "11px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Edit Budget</button>
            </div>
          </div>

          <div style={styles.body}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em" }}>TRANSACTIONS</span>
              <button onClick={() => { setForm({}); setModal("addEnvelope"); setForm({ parentId: activeId }); }}
                style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                + Sub-envelope
              </button>
            </div>

            {/* Sub-envelopes if any */}
            {activeEnv.children && activeEnv.children.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {activeEnv.children.map(child => (
                  <EnvelopeCard
                    key={child.id}
                    env={child}
                    allTx={transactions}
                    depth={0}
                    onOpen={(id) => { setActiveId(id); }}
                    onAddSub={(id) => { setForm({ parentId: id }); setModal("addEnvelope"); }}
                  />
                ))}
              </div>
            )}

            {activeTx.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#475569", fontSize: 14 }}>
                No transactions yet
              </div>
            ) : (
              [...activeTx].reverse().map(tx => (
                <div key={tx.id} style={{
                  background: "#1e293b", borderRadius: 10, padding: "12px 14px",
                  marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{tx.description}</div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                      {new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: tx.amount < 0 ? "#ef4444" : "#22c55e" }}>
                      {fmt(tx.amount)}
                    </span>
                    <button onClick={() => deleteTx(tx.id)} style={{
                      background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16, padding: 2,
                    }}>×</button>
                  </div>
                </div>
              ))
            )}

            <div style={{ marginTop: 24 }}>
              <Btn variant="danger" onClick={deleteEnvelope}>Delete Envelope</Btn>
            </div>
          </div>
        </>
      )}

      {/* ── HISTORY VIEW ── */}
      {view === "history" && (
        <>
          <div style={{ ...styles.header, paddingTop: 52 }}>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>History</div>
          </div>
          <div style={styles.body}>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
                <div style={{ fontSize: 14 }}>No saved months yet</div>
              </div>
            ) : history.map((snap, i) => {
              const totalSpent = snap.transactions.reduce((s, t) => s + (t.amount < 0 ? t.amount : 0), 0);
              const totalBudgeted = snap.envelopes.reduce((s, e) => s + computeTotalBudget(e), 0);
              return (
                <div key={i} style={{ background: "#1e293b", borderRadius: 12, padding: "16px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{MONTH_NAMES[snap.period.month]} {snap.period.year}</span>
                    <span style={{ color: "#ef4444", fontWeight: 700 }}>{fmt(totalSpent)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    Budget: {fmt(totalBudgeted)} · {snap.transactions.length} transactions
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                    Saved {new Date(snap.savedAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── NAV BAR ── */}
      <nav style={styles.navBar}>
        {[
          { id: "home", icon: "🏠", label: "Envelopes" },
          { id: "history", icon: "📁", label: "History" },
        ].map(tab => (
          <button key={tab.id} onClick={() => { setView(tab.id); setActiveId(null); }} style={{
            flex: 1, background: "none", border: "none", padding: "12px 0",
            color: view === tab.id ? "#3b82f6" : "#475569",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          }}>
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── MODALS ── */}
      {modal === "addEnvelope" && (
        <Modal title={form.parentId ? "New Sub-Envelope" : "New Envelope"} onClose={() => { setModal(null); setForm({}); }}>
          <InputField label="NAME" placeholder="e.g. Groceries" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <InputField label="BUDGET ($)" type="number" inputMode="decimal" placeholder="0.00" value={form.budget || ""} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} />
          {!form.parentId && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 8, fontWeight: 600, letterSpacing: "0.05em" }}>TYPE</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["monthly", "yearly"].map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid",
                    borderColor: form.type === t || (!form.type && t === "monthly") ? "#3b82f6" : "#334155",
                    background: form.type === t || (!form.type && t === "monthly") ? "#1d3461" : "#1e293b",
                    color: form.type === t || (!form.type && t === "monthly") ? "#93c5fd" : "#64748b",
                    fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "capitalize",
                  }}>{t}</button>
                ))}
              </div>
            </div>
          )}
          <Btn onClick={addEnvelope}>Create Envelope</Btn>
        </Modal>
      )}

      {modal === "addTx" && (
        <Modal title={form.isExpense ? "Add Expense" : "Add Income"} onClose={() => { setModal(null); setForm({}); }}>
          <InputField label="DESCRIPTION" placeholder="e.g. Whole Foods" value={form.desc || ""} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
          <InputField label="AMOUNT ($)" type="number" inputMode="decimal" placeholder="0.00" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <button onClick={() => setForm(f => ({ ...f, isExpense: true }))} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid",
              borderColor: form.isExpense !== false ? "#dc2626" : "#334155",
              background: form.isExpense !== false ? "#3b0f0f" : "#1e293b",
              color: form.isExpense !== false ? "#fca5a5" : "#64748b",
              fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>Expense</button>
            <button onClick={() => setForm(f => ({ ...f, isExpense: false }))} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid",
              borderColor: form.isExpense === false ? "#16a34a" : "#334155",
              background: form.isExpense === false ? "#0f2d1a" : "#1e293b",
              color: form.isExpense === false ? "#86efac" : "#64748b",
              fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>Income</button>
          </div>
          <Btn onClick={addTransaction}>Save Transaction</Btn>
        </Modal>
      )}

      {modal === "editBudget" && (
        <Modal title="Adjust Budget" onClose={() => { setModal(null); setForm({}); }}>
          <InputField label="NEW BUDGET ($)" type="number" inputMode="decimal" value={form.budget || ""} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} />
          <Btn onClick={editBudget}>Update Budget</Btn>
        </Modal>
      )}

      {modal === "monthEnd" && (
        <Modal title="Close Month" onClose={() => setModal(null)}>
          <div style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            <p style={{ margin: "0 0 10px" }}>Closing <strong style={{ color: "#f1f5f9" }}>{MONTH_NAMES[period.month]} {period.year}</strong> will:</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Save a snapshot to History</li>
              <li>Reset all <strong style={{ color: "#93c5fd" }}>monthly</strong> envelopes back to their budgets</li>
              <li>Carry the current balance of <strong style={{ color: "#93c5fd" }}>yearly</strong> envelopes forward</li>
            </ul>
          </div>
          <Btn onClick={doMonthEnd}>Close Month & Roll Forward</Btn>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
        </Modal>
      )}
    </div>
  );
}
