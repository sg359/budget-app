# Cloud Sync & Year-End Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Year-End reset (parallel to Month End) and make budget data durable + cross-device via Firebase cloud sync with required Google sign-in.

**Architecture:** Extract the month/year reset logic into a pure, unit-tested module (`src/budgetLogic.js`). Add Vitest for those tests. Add a Firebase layer (`src/firebase.js`) providing Google auth + a single Firestore document per user (`users/{uid}` holding `data` + `history`), wired into `App.jsx` behind a required sign-in gate with a real-time `onSnapshot` listener and smart-merge-on-first-sign-in. `localStorage` is kept as an offline cache.

**Tech Stack:** Vite, React 19, Vitest, Firebase (Auth + Cloud Firestore), gh-pages.

**Spec:** `docs/superpowers/specs/2026-06-10-cloud-sync-and-year-end-design.md`

> **Amendment (2026-06-10):** Phase A (Year-End / Month-End reset) was implemented
> as written. **Phase B (Firebase cloud sync) was NOT built** — the user opted for
> a simpler **Export / Import to a local JSON file** instead (Export + Import
> buttons in the History tab; whole-state backup, manual, single-device). The
> Phase B tasks below are retained for historical context only.

---

## File Structure

- Create: `src/budgetLogic.js` — pure functions: `collectEnvelopeIdsByType`, `makeSnapshot`, `monthEndReset`, `yearEndReset`. No React, no I/O.
- Create: `src/budgetLogic.test.js` — Vitest unit tests for the above.
- Create: `src/firebase.js` — Firebase init + auth helpers + Firestore read/write/subscribe helpers.
- Create: `firestore.rules` — Firestore security rules (per-user document access).
- Modify: `src/App.jsx` — use `budgetLogic` for resets, add Year-End button + modal, add sign-in gate + cloud sync.
- Modify: `package.json` — add `firebase` dep, `vitest` dev dep, `"test"` script.

---

## Phase A — Year-End / Month-End reset model (pure logic + UI)

### Task A1: Add Vitest

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

Run: `npm install --save-dev vitest`
Expected: adds `vitest` to devDependencies, no errors.

- [ ] **Step 2: Add the test script**

Edit `package.json` scripts so it includes (keep existing scripts):

```json
"scripts": {
  "dev": "vite",
  "predeploy": "npm run build",
  "deploy": "gh-pages -d dist",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 3: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: Vitest runs and reports "No test files found" (exit non-zero is fine here) — confirms Vitest is installed.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest test runner"
```

---

### Task A2: `collectEnvelopeIdsByType` (pure)

Resolves which envelope ids belong to a given cadence. **Type is inherited from the top-level ancestor** — a sub-envelope of a yearly envelope counts as yearly even though child nodes don't carry their own meaningful `type`.

**Files:**
- Create: `src/budgetLogic.js`
- Test: `src/budgetLogic.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/budgetLogic.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/budgetLogic.test.js`
Expected: FAIL — `collectEnvelopeIdsByType` is not exported / file missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/budgetLogic.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/budgetLogic.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/budgetLogic.js src/budgetLogic.test.js
git commit -m "feat: collectEnvelopeIdsByType pure helper"
```

---

### Task A3: `makeSnapshot` (pure)

**Files:**
- Modify: `src/budgetLogic.js`
- Test: `src/budgetLogic.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/budgetLogic.test.js`:

```js
import { makeSnapshot } from "./budgetLogic";

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
    // mutate original; snapshot must not change (deep copy)
    state.envelopes[0].children[0].id = "MUT";
    expect(snap.envelopes[0].children[0].id).toBe("b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/budgetLogic.test.js`
Expected: FAIL — `makeSnapshot` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/budgetLogic.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/budgetLogic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/budgetLogic.js src/budgetLogic.test.js
git commit -m "feat: makeSnapshot pure helper"
```

---

### Task A4: `monthEndReset` and `yearEndReset` (pure)

Both archive a snapshot (capped at 24) and clear one cadence's transactions. **Budgets are never modified.** Month End advances `period` to the next month; Year End leaves `period` unchanged.

**Files:**
- Modify: `src/budgetLogic.js`
- Test: `src/budgetLogic.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/budgetLogic.test.js`:

```js
import { monthEndReset, yearEndReset } from "./budgetLogic";

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
    expect(newState.envelopes).toEqual(baseState().envelopes); // budgets untouched
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/budgetLogic.test.js`
Expected: FAIL — `monthEndReset` / `yearEndReset` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/budgetLogic.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all budgetLogic tests).

- [ ] **Step 5: Commit**

```bash
git add src/budgetLogic.js src/budgetLogic.test.js
git commit -m "feat: monthEndReset and yearEndReset pure functions"
```

---

### Task A5: Wire reset functions + Year-End UI into App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Import the pure helpers**

At the top of `src/App.jsx`, after the React import, add:

```js
import { monthEndReset, yearEndReset } from "./budgetLogic";
```

- [ ] **Step 2: Replace `doMonthEnd` with the pure-function version**

Replace the entire existing `async function doMonthEnd() { ... }` body with:

```js
  async function doMonthEnd() {
    const { newState, newHistory } = monthEndReset(data, history, new Date().toISOString());
    await saveHistory(newHistory);
    setHistory(newHistory);
    persist(newState);
    setModal(null);
    setView("home");
  }

  async function doYearEnd() {
    const { newState, newHistory } = yearEndReset(data, history, new Date().toISOString());
    await saveHistory(newHistory);
    setHistory(newHistory);
    persist(newState);
    setModal(null);
    setView("home");
  }
```

- [ ] **Step 3: Add the Year-End button beside Month End**

In the home-view header, find the `<button onClick={() => setModal("monthEnd")} ...>Month End →</button>`. Wrap both buttons in a flex container so they sit side by side. Replace that single button with:

```jsx
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => setModal("monthEnd")} style={{
                  background: "#1e293b", border: "1px solid #334155", color: "#94a3b8",
                  borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                }}>Month End →</button>
                <button onClick={() => setModal("yearEnd")} style={{
                  background: "#1e293b", border: "1px solid #334155", color: "#94a3b8",
                  borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                }}>Year End →</button>
              </div>
```

- [ ] **Step 4: Add the Year-End confirmation modal**

Immediately after the existing `{modal === "monthEnd" && ( ... )}` block, add:

```jsx
      {modal === "yearEnd" && (
        <Modal title="Close Year" onClose={() => setModal(null)}>
          <div style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            <p style={{ margin: "0 0 10px" }}>Closing out the year will:</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Save a snapshot to History</li>
              <li>Clear all <strong style={{ color: "#93c5fd" }}>yearly</strong> envelope transactions (balances reset to budget)</li>
              <li>Leave <strong style={{ color: "#93c5fd" }}>monthly</strong> envelopes and all budgets unchanged</li>
            </ul>
          </div>
          <Btn onClick={doYearEnd}>Archive Year & Reset Yearly Envelopes</Btn>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
        </Modal>
      )}
```

- [ ] **Step 5: Verify build + tests pass**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`, open the local URL. Create one monthly and one yearly envelope, add an expense to each. Tap **Year End → Archive**: the yearly envelope's transaction is gone and its balance equals its budget; the monthly envelope's transaction remains; a snapshot appears in History. Tap **Month End →**: the monthly transaction clears, yearly is untouched.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: year-end reset button + use pure reset functions"
```

---

## Phase B — Firebase cloud sync (Google sign-in)

### Task B1: One-time Firebase project setup (manual, by user)

This task is performed by the user in the browser; the engineer pauses and confirms the config values before continuing.

- [ ] **Step 1:** At https://console.firebase.google.com create a new project (no Analytics needed).
- [ ] **Step 2:** Build → Authentication → Get started → enable **Google** provider; save.
- [ ] **Step 3:** Build → Firestore Database → Create database → Production mode → pick a region.
- [ ] **Step 4:** Project settings → General → "Your apps" → add a **Web app**; copy the `firebaseConfig` object (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
- [ ] **Step 5:** Authentication → Settings → Authorized domains → add `sg359.github.io` (and confirm `localhost` is present).
- [ ] **Step 6:** Provide the `firebaseConfig` values to the engineer for Task B3.

---

### Task B2: Install Firebase + add Firestore rules file

**Files:**
- Modify: `package.json`
- Create: `firestore.rules`

- [ ] **Step 1: Install Firebase**

Run: `npm install firebase`
Expected: adds `firebase` to dependencies.

- [ ] **Step 2: Create the security rules**

Create `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

- [ ] **Step 3: Publish the rules**

In the Firebase console → Firestore → Rules tab, paste the contents of `firestore.rules` and click Publish. (Rules are deployed via the console; the file is the source of truth in the repo.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json firestore.rules
git commit -m "chore: add firebase dependency and firestore rules"
```

---

### Task B3: Firebase module (`src/firebase.js`)

**Files:**
- Create: `src/firebase.js`

- [ ] **Step 1: Create the module**

Create `src/firebase.js`, pasting the real values from Task B1 into `firebaseConfig`:

```js
import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "PASTE_FROM_FIREBASE",
  authDomain: "PASTE_FROM_FIREBASE",
  projectId: "PASTE_FROM_FIREBASE",
  storageBucket: "PASTE_FROM_FIREBASE",
  messagingSenderId: "PASTE_FROM_FIREBASE",
  appId: "PASTE_FROM_FIREBASE",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb); // cb(user|null); returns unsubscribe
}
export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}
export function signOutUser() {
  return signOut(auth);
}

// Read the user's doc once. Returns { data, history } or null if absent/empty.
export async function readUserDoc(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// Overwrite the user's whole doc.
export function writeUserDoc(uid, data, history) {
  return setDoc(doc(db, "users", uid), { data, history });
}

// Real-time listener; cb({ data, history }) on every remote change.
// Returns an unsubscribe function.
export function subscribeUserDoc(uid, cb) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    if (snap.exists()) cb(snap.data());
  });
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds (no import errors). Sign-in is not wired yet.

- [ ] **Step 3: Commit**

```bash
git add src/firebase.js
git commit -m "feat: firebase auth + firestore helper module"
```

---

### Task B4: Sign-in gate in App.jsx

Gate the whole app behind Google sign-in.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Import auth helpers**

Add to the imports in `src/App.jsx`:

```js
import { watchAuth, signInWithGoogle, signOutUser } from "./firebase";
```

- [ ] **Step 2: Track the user**

Inside `App`, add state and an effect (place near the other `useState` calls and the existing load `useEffect`):

```js
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = watchAuth((u) => { setUser(u); setAuthReady(true); });
    return unsub;
  }, []);
```

- [ ] **Step 3: Render loading + sign-in gate before the app**

Immediately after the existing `if (loading || !data) return (...)` block, add (so the gate is evaluated once auth state is known):

```jsx
  if (!authReady) return (
    <div style={{ background: "#0a0f1e", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#64748b", fontSize: 15 }}>Loading…</div>
    </div>
  );

  if (!user) return (
    <div style={{ background: "#0a0f1e", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, color: "#f1f5f9", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>🪙 Envelope Budget</div>
      <div style={{ color: "#64748b", fontSize: 14 }}>Sign in to access your budget</div>
      <button onClick={() => signInWithGoogle()} style={{
        background: "#3b82f6", border: "none", color: "#fff", borderRadius: 10,
        padding: "13px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer",
      }}>Sign in with Google</button>
    </div>
  );
```

> Note: the existing `if (loading || !data)` guard must run only when signed in. Move the auth checks ABOVE the data-loading effect's guard, OR ensure `loading` starts `true` and the data effect runs regardless — see Task B5 which makes data loading depend on `user`. For this step, place the two new blocks immediately AFTER `const { envelopes, transactions, period } = data;`? No — they must come before that destructure. Place both new `return` blocks directly BEFORE the existing `if (loading || !data)` block.

- [ ] **Step 4: Add a Sign-out control**

In the home-view header, inside the date/balance block area, add a small sign-out button. After the closing `</div>` of the totals block (the `<div>` containing month name + balance), but inside the header flex row, append:

```jsx
              <button onClick={() => signOutUser()} style={{
                background: "none", border: "none", color: "#475569",
                fontSize: 11, fontWeight: 600, cursor: "pointer", marginLeft: 8,
              }}>Sign out</button>
```

(Place it adjacent to the Month End / Year End button group so it sits in the header.)

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual verification**

Run `npm run dev`. You should see the sign-in screen. Click "Sign in with Google", complete the popup → the app appears. Click "Sign out" → back to the gate.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: require Google sign-in to use the app"
```

---

### Task B5: Cloud sync — load, subscribe, write, smart-merge

Replace `localStorage`-only persistence with Firestore as source of truth (localStorage kept as offline cache). Uses helpers from `src/firebase.js`.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Import Firestore helpers**

Extend the firebase import in `src/App.jsx`:

```js
import { watchAuth, signInWithGoogle, signOutUser, readUserDoc, writeUserDoc, subscribeUserDoc } from "./firebase";
```

- [ ] **Step 2: Replace the initial-load effect with a user-scoped load + smart merge**

Replace the existing data-loading `useEffect` (the one calling `loadData()`/`loadHistory()`) with:

```js
  useEffect(() => {
    if (!user) { setLoading(true); return; }
    let cancelled = false;
    (async () => {
      // Local cache (offline fallback / migration source).
      const localData = await loadData();
      const localHistory = await loadHistory();

      const cloud = await readUserDoc(user.uid);
      const cloudEmpty = !cloud || !cloud.data ||
        (Array.isArray(cloud.data.envelopes) && cloud.data.envelopes.length === 0 &&
         Array.isArray(cloud.data.transactions) && cloud.data.transactions.length === 0);

      if (cloudEmpty && localData) {
        // First sign-in with existing local data → migrate up.
        await writeUserDoc(user.uid, localData, localHistory || []);
        if (cancelled) return;
        setData(localData);
        setHistory(localHistory || []);
      } else if (cloud && cloud.data) {
        if (cancelled) return;
        setData(cloud.data);
        setHistory(cloud.history || []);
      } else {
        if (cancelled) return;
        setData(defaultState());
        setHistory([]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);
```

- [ ] **Step 3: Subscribe to remote changes for cross-device sync**

Add a second effect right after the load effect:

```js
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeUserDoc(user.uid, (remote) => {
      if (remote.data) setData(remote.data);
      if (remote.history) setHistory(remote.history);
    });
    return unsub;
  }, [user]);
```

- [ ] **Step 4: Make `persist` write to Firestore + localStorage**

Replace the existing `persist` callback with one that writes both the cloud doc and the local cache. It must send the current `history` alongside `data` (the doc holds both):

```js
  const persist = useCallback(async (newData) => {
    setData(newData);
    await saveData(newData);            // localStorage cache
    if (user) await writeUserDoc(user.uid, newData, history);
  }, [user, history]);
```

- [ ] **Step 5: Make history writes go to Firestore too**

The reset handlers call `saveHistory(newHistory)` then `persist(newState)`. Because `persist` closes over the previous `history`, update the doc with the new history explicitly. In `doMonthEnd` and `doYearEnd` (from Task A5), change the body to write the cloud doc with BOTH new values atomically:

```js
  async function doMonthEnd() {
    const { newState, newHistory } = monthEndReset(data, history, new Date().toISOString());
    await saveHistory(newHistory);
    setHistory(newHistory);
    setData(newState);
    await saveData(newState);
    if (user) await writeUserDoc(user.uid, newState, newHistory);
    setModal(null);
    setView("home");
  }

  async function doYearEnd() {
    const { newState, newHistory } = yearEndReset(data, history, new Date().toISOString());
    await saveHistory(newHistory);
    setHistory(newHistory);
    setData(newState);
    await saveData(newState);
    if (user) await writeUserDoc(user.uid, newState, newHistory);
    setModal(null);
    setView("home");
  }
```

- [ ] **Step 6: Verify build + tests**

Run: `npm run build && npm test`
Expected: build succeeds; pure-logic tests still pass.

- [ ] **Step 7: Manual verification — persistence + migration**

Run `npm run dev`. Sign in. If you had existing local data, confirm it appears (migrated to cloud). Add an envelope, refresh → it persists. Open the Firestore console → `users/{your-uid}` → confirm `data` and `history` fields exist.

- [ ] **Step 8: Manual verification — cross-device sync**

Open the app in two browser windows signed into the same Google account. Add a transaction in one; it appears in the other within ~1–2 seconds.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx
git commit -m "feat: firestore cloud sync with smart-merge on first sign-in"
```

---

### Task B6: Deploy

**Files:** none (deploy only)

- [ ] **Step 1: Ensure `gh` is the personal account**

Run: `gh auth switch --user sg359`
Expected: "Switched active account ... to sg359".

- [ ] **Step 2: Push and deploy**

```bash
git push origin main
npm run deploy
```
Expected: push succeeds; `gh-pages` prints "Published".

- [ ] **Step 3: Restore work account**

Run: `gh auth switch --user sohanggandhi`
Expected: "Switched active account ... to sohanggandhi".

- [ ] **Step 4: Verify live**

Open https://sg359.github.io/budget-app/ (hard refresh). Sign in with Google (confirm the popup is allowed for `sg359.github.io`), add data, refresh, confirm persistence. Open on your iPhone, sign in with the same account, confirm the same data appears.

---

## Self-Review

**Spec coverage:**
- Reset model (budgets never change; Month End → monthly, Year End → yearly; independent buttons; History snapshot; fixes the old yearly budget-overwrite bug) → Tasks A2–A5. ✅
- Year End UI button beside Month End → Task A5 Steps 3–4. ✅
- Firebase: required Google sign-in → Task B4. ✅
- `users/{uid}` doc with `data` + `history`, whole-doc writes, last-write-wins → Tasks B3, B5. ✅
- Real-time `onSnapshot` cross-device sync → Task B5 Step 3. ✅
- localStorage offline cache → Task B5 Steps 2, 4. ✅
- Smart-merge on first sign-in → Task B5 Step 2. ✅
- Security rules (owner-only) → Task B2. ✅
- Authorized domains (`sg359.github.io`, `localhost`) → Task B1 Step 5. ✅
- One-time Firebase setup, guided → Task B1. ✅

**Placeholder scan:** The only intentional placeholders are the `PASTE_FROM_FIREBASE` config values in Task B3, which are filled from Task B1's output — documented, not vague. No "TODO/handle edge cases" steps.

**Type/name consistency:** `monthEndReset`/`yearEndReset` return `{ newState, newHistory }` — consumed consistently in A5 and B5. `collectEnvelopeIdsByType(envelopes, type)` returns a `Set` — used with `.has()` everywhere. Firebase helpers (`watchAuth`, `signInWithGoogle`, `signOutUser`, `readUserDoc`, `writeUserDoc`, `subscribeUserDoc`) defined in B3 and imported/used with matching signatures in B4–B5.

**Note on A5 vs B5:** Task A5 first writes `doMonthEnd`/`doYearEnd` against localStorage only; Task B5 Step 5 deliberately rewrites those two handlers to also write the Firestore doc. This is an intentional, ordered evolution (Phase A produces working software before Firebase exists), not a contradiction.
