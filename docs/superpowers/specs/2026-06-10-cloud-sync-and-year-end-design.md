# Budget App — Cloud Sync & Year-End Reset Design

**Date:** 2026-06-10
**Status:** Partially superseded — see amendment below.

> **Amendment (2026-06-10):** The **Year-End / Month-End reset model** (Feature 1)
> was implemented as designed. **Firebase cloud sync (Feature 2) was dropped** at
> the user's request in favor of a simpler, fully-static **Export / Import to a
> local JSON file**: an "Export" button downloads a timestamped backup and an
> "Import" button restores one (with a confirm prompt), both in the History tab.
> This keeps the app backend-free with no sign-in. Trade-offs accepted: backups
> are manual (not auto-saved on every change) and single-device (the file is the
> portable copy, not live cross-device sync). The Firebase sections below are
> retained for historical context only and were not built.

## Goal

Two changes to the budget-envelopes app (Vite + React, deployed to GitHub Pages
at `https://sg359.github.io/budget-app/`):

1. Make budget data durable and available across devices (iPhone + laptop) so it
   survives a browser-data wipe — via Firebase cloud sync with required Google
   sign-in.
2. Add a **Year End** action that archives yearly-envelope transactions and
   resets their balances, mirroring how **Month End** works for monthly
   envelopes.

## Background — current behavior

- App state shape: `{ period: {month, year}, envelopes: [...], transactions: [...] }`.
  Envelopes are a tree (`children`), each with `{ id, name, budget, type, children }`
  where `type` is `"monthly"` or `"yearly"`.
- Persistence currently uses `localStorage` (keys `envelope_budget_v1`,
  `envelope_budget_history_v1`).
- **Month End** today: saves a snapshot to History; for monthly envelopes it
  drops their transactions (balance returns to budget); for yearly envelopes it
  *overwrites* `budget` with the current balance and *keeps* the transactions.

### Defect in current Month End (to be fixed by this work)

The yearly handling both (a) mutates the budget — which contradicts the desired
"reset never changes the budget" rule — and (b) double-counts: a kept `-$100`
transaction is folded into the new budget *and* still subtracts on the next
balance computation, so yearly balances drift incorrectly over time. The new
model removes this behavior entirely.

## Feature 1 — Month-End / Year-End reset model

### Principle

A budget amount is fixed and is **never modified** by a reset. "Reset" means:
remove (archive) that envelope type's transactions so the balance returns to the
budget.

### Behavior

| | Month End | Year End (new) |
|---|---|---|
| Archive a snapshot to History | yes | yes |
| Clear **monthly** envelope transactions | yes | no |
| Clear **yearly** envelope transactions | no | yes |
| Modify any budget | never | never |

- **Monthly** envelopes reset every month; **yearly** envelopes accumulate all
  year and reset only at Year End.
- The two actions are **independent** — Year End does *not* also run a monthly
  reset. The user taps each separately. (At the calendar year boundary they would
  tap both.)
- Month End **no longer touches yearly envelopes** (this removes the defect above).

### Snapshot / History

Both actions push a snapshot onto the existing `history` array (capped at 24, as
today): `{ period, envelopes (deep copy), transactions, savedAt }`. Year End's
snapshot captures the yearly transactions being archived.

### Transaction clearing

- Month End: keep only transactions whose envelope is **yearly**; drop the rest.
- Year End: keep only transactions whose envelope is **monthly**; drop the rest.
- Envelope type is resolved by walking the envelope tree and collecting the ids
  of each type (yearly transactions are identified by membership in the set of
  yearly envelope ids, including nested children).

### UI

- Add a **"Year End →"** button in the home-view header next to the existing
  **"Month End →"** button.
- Year End opens a confirmation modal (parallel to the Month End modal) that
  states: archives a History snapshot and clears yearly-envelope transactions;
  budgets are unchanged.

## Feature 2 — Firebase cloud sync

### Auth

- **Google sign-in required.** The app renders a sign-in gate; no budget data
  loads or is editable until the user is authenticated.
- Firebase Auth, Google provider, popup flow.

### Data model (Firestore)

- One document per user: `users/{uid}`.
- Fields: `data` (the `{period, envelopes, transactions}` object) and `history`
  (the snapshots array).
- Whole-document writes on every change; **last-write-wins** (acceptable for a
  single user across a few devices).

### Sync

- After sign-in, attach a real-time `onSnapshot` listener on `users/{uid}` so
  edits propagate between devices within ~1–2 seconds.
- Every local mutation (`persist`, `saveHistory`) writes the whole document back
  to Firestore.
- `localStorage` is retained as an **offline cache** so the app can render last
  known data while the network/Firestore is reconnecting.

### First sign-in — smart merge by emptiness

- If the cloud `users/{uid}` doc does **not exist / is empty**: upload the
  current local (`localStorage`) data to it. This migrates the user's existing
  local budget into the cloud on first login.
- If the cloud doc **already has data**: load the cloud copy (local cache is
  overwritten by it).

### Security

- The Firebase **web config** (apiKey, authDomain, projectId, etc.) is committed
  into the app source. This is standard and safe for Firebase web apps — it is an
  identifier, not a secret.
- **Firestore security rules** enforce that an authenticated user may read/write
  only their own document:

  ```
  match /users/{uid} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
  ```

- **Authorized domains** in Firebase Auth: add `sg359.github.io` (production) and
  `localhost` (local dev).

### One-time manual setup (user, guided)

1. Create a free Firebase project.
2. Enable Google as a sign-in provider.
3. Create a Cloud Firestore database.
4. Register a web app; copy its config into the app.
5. Publish the Firestore security rules above.
6. Add authorized domains.

## Out of scope (YAGNI)

- Multi-user sharing / collaboration.
- Field-level merge / conflict resolution beyond whole-doc last-write-wins.
- Email/password or other auth providers.
- Offline editing queue beyond Firestore's built-in behavior + localStorage cache.

## Risks / notes

- Required sign-in means a fresh browser must be online to authenticate before
  the app is usable (the user accepted this tradeoff).
- Deploys continue via `npm run deploy`; remember `gh` must be the `sg359`
  account at deploy time (switch back to work account after).
