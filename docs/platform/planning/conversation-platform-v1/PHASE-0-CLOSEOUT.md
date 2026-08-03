# Phase 0 — closeout

**Status:** complete, pending Kelly's acceptance.
**Branch:** `agent/claude/2-conversation-platform-v1-discovery` — 24 commits, none pushed.
**Migrations:** 4, all authored, all replay-certified locally, **none applied to any shared environment.**

---

## 1. Delivered vs Foundation-only

The distinction Kelly asked for, applied honestly. **Delivered** means a user- or
attacker-visible behaviour changed. **Foundation-only** means the machinery
exists and is tested but nothing downstream consumes it yet.

### Delivered — behaviour changed

| # | Change | Observable difference |
| --- | --- | --- |
| D-1 | Payment executor authentication | `POST /admin/payments/run` was unauthenticated and could charge a card. It now requires a dedicated secret and fails closed when unconfigured. |
| D-2 | Legacy dispatch authentication | Two SMS routes were unauthenticated. Both now require a workflow secret, checked before any lookup. |
| D-3 | SMS oracle removed | Six of nine dispatch send sites fired on rejection branches. Supplying only a `contact_id` produced an SMS. They send nothing now. |
| D-4 | Home-access secrets removed from SMS | The assignment confirmation disclosed customer phone, street address, entry method and access notes, gated by a 5-digit code. All removed. |
| D-5 | Offer-code brute force closed | The 5-digit code had no attempt limit. Now 5 tries / 15-minute lockout, plus replay suppression. |
| D-6 | Document signing is row-driven | Signing authorized on the storage path; it now authorizes on the `documents` row, so path-shaped guesses fail closed. |
| D-7 | Signed-URL expiry capped | Seven-day signed URLs on children's photographs, now ≤15 minutes everywhere. |
| D-8 | Signed URLs no longer persisted | A signed URL was written to `persons.metadata.photo_url`, making one actor's expiry-bound credential durable metadata shared with all actors. |
| D-9 | Authorization precedes minting | The profile-photo route authorized *after* the URL was signed. Found by the closeout inventory, fixed in 6F. |
| D-10 | STOP/START/HELP honored | Inbound SMS keywords now update preferences and are acknowledged. |
| D-11 | `announcement_targets` canonical shape | P0-4, the one actually-broken defect live verification found. |

### Foundation-only — built, tested, not yet consumed

| # | Foundation | Why it is not "delivered" |
| --- | --- | --- |
| F-1 | Four-axis classification (audience × channel × category × purpose) | Columns and constraints exist; **no send path is required to populate them yet**, and `recordCategoryFallback` exists precisely to measure how often they are not |
| F-2 | Eligibility evaluator + enqueue gate | Enforces correctly at `enqueueCanonicalOutboundMessage`, which covers 10 of 14 send paths. The other 4 do not route through it. |
| F-3 | Python dispatch revalidation | Second layer works; its value is only realized once layer one is populated (F-1) |
| F-4 | Canonical renderer | Enforced on the **send** path. The **preview** endpoint still uses the separate B0 token engine, so parity is proven by unit test, not by wiring. |
| F-5 | Cross-runtime contracts + parity tests | Real and enforced, but they describe a vocabulary only partially adopted |
| F-6 | `resolveProfilePhotosForActor` | Correct resolver; most avatar surfaces have not adopted it (Phase 2) |
| F-7 | Vendor object remediation script | Dry-run only by default; the 6 legacy objects are unowned and already unreachable, so it is cleanup awaiting a disposition decision |

**Explicitly NOT claimed:** Phase 0 did not build the Conversation Platform. It
removed security defects and laid a classification/eligibility foundation. The
thirteen workstreams remain almost entirely unimplemented — see Scoreboard 2.

## 2. Verification performed

| Check | Result |
| --- | --- |
| Clean migration replay | **CERTIFIED** — all 301 migrations from scratch on the local `alloy-cert` stack, exit 0 |
| Upgrade replay | **CERTIFIED** — the four Phase 0 migrations applied in sequence onto the prior 297 |
| Idempotent rerun | **CERTIFIED** — all four re-apply against an already-migrated DB with no error |
| Schema verification | **CERTIFIED** — columns, defaults and CHECK constraints on `communication_messages` / `communication_scheduled_sends` match D3 exactly (`external\|internal`; `transactional\|operational\|marketing\|emergency`); `purpose` deliberately unconstrained |
| `announcement_targets` shape | **CERTIFIED** — `target_type`, `target_ref`, `rule` present |
| Web test suite | 778 passed, 25 failed — **all 25 pre-existing**, in 13 source-shape `readFileSync` files, none Phase 0's |
| Documents suite | 78/78 |
| Backend suite | 124 tests, 2 errors — **baseline**, both absent packages (`pytest`, `twilio`) |
| TypeScript | `tsc --noEmit` clean, exit 0 |
| Send-path inventory | No direct provider call outside the choke point |
| Signer inventory | All 4 signers guarded, capped, and authorize before minting — **now pinned by `signerConvergence.test.ts`** |
| Renderer inventory | One production caller (`canonicalOutboundEnqueue`); preview endpoint **not** converged (F-4) |

**Not performed, and why:** no live provider send, no live charge, no mutating
run of the remediation script, and no migration applied to any shared
environment — all per standing instruction. Public reachability of the payment
route was not confirmed; per Kelly's decision, remediation did not wait on it.

## 3. What the closeout inventory caught

Worth recording, because it is the argument for running inventories rather than
trusting commit-level review: **6F**. The profile-photo route passed review, had
a correct-looking `assertDocumentAccess` call, and returned an error to
unauthorized callers — while handing authorized callers a seven-day credential
minted before the check. Two of Phase 0's own claims ("no seven-day signer
remains", "authorization precedes disclosure") were false at closeout time.

Both are now enforced by a test rather than asserted by grep during review.

## 4. Deployment and promotion package

**Order matters.** The migrations are additive and safe to apply ahead of code;
the code is not safe to deploy ahead of the migrations.

1. Apply the four migrations, in filename order.
2. Set `PAYMENT_EXECUTOR_SECRET` (Python + the Next.js proxy that calls it).
3. Set `GHL_WORKFLOW_SECRET` if unset — **both dispatch routes return 503 until
   it is**, by design.
4. Deploy web + backend.

### Environment variables

| Variable | Consumer | If missing |
| --- | --- | --- |
| `PAYMENT_EXECUTOR_SECRET` | `service_auth.py`, Next.js payment proxy | `/admin/payments/run` refuses (503) |
| `GHL_WORKFLOW_SECRET` | `legacy_dispatch_guard.py` | Both dispatch routes refuse (503) |

### Rollback

| Layer | Rollback | Safe? |
| --- | --- | --- |
| Code | Revert the branch | Yes — no migration depends on it |
| Migrations | Additive only: new nullable columns, new defaults, new constraints on new columns | Yes to leave in place. Reverting them requires dropping columns; prefer leaving them. |
| Secrets | Removing them makes routes fail **closed**, not open | Yes |

**The one-way door:** none. No data was destroyed, no column dropped, no row
deleted. The `persons.metadata.photo_url` key is deleted on the next profile
photo write, which is intended and recorded in R-3.

### Pre-promotion gate

**CLEARED 2026-07-31.** Staging is promotable.

An earlier draft of this section reported a 28-migration Processing-Identity
backlog and three orphan ledger versions. That was carried over from a note
written on 2026-07-26 and was **already stale when written here**: the backlog
was applied on 2026-07-27.

The verified history, from the repair sprint that followed:

- the 28-migration backlog had already been resolved on 2026-07-27
- the actual blocker was **one** dashboard-minted orphan, `20260730000602`,
  whose identical SQL was committed as `20260729120000` on an unmerged branch
- two further migrations (`20260730212000`, `20260730212100`) were genuinely
  unrecorded, though their schema was already applied out-of-band
- the orphan was reconciled to its canonical repository twin, and staging
  promotion was restored: repo and ledger now agree at 298/298, with
  `supabase db push` reporting "Remote database is up to date"

See `docs/platform/governance/migration-promotion-controls.md`.

## 5. Open decisions for Kelly

| # | Decision | Default if unanswered |
| --- | --- | --- |
| O-1 | Disposition of the 6 unowned legacy vendor objects | Leave them; already unreachable |
| O-2 | Decommission the GHL cleaning vertical? | See `LEGACY-DISPATCH-DECOMMISSIONING.md`; gated on one operational check in GHL |
| O-3 | The DB-trigger boundary question raised in discovery | Still open |
| O-4 | Promotion window for the four migrations | Held |

## 6. Related documents

- `PHASE-0-CONTRACT.md` — what was committed to
- `PHASE-0-LIVE-VERIFICATION.md` — the evidence that inverted the severity ranking
- `CODE-RETIREMENT-LEDGER.md` — every shim and its deletion condition
- `LEGACY-DISPATCH-DECOMMISSIONING.md` — recommendation only
- `PHASE-CONTRACTS.md` — Phases 1–5, **not started**
