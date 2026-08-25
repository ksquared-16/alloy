---
owner: platform
status: canonical
last_reviewed: 2026-08-25
---

# Public link origin — defect, repair, and what the census proved

**Lane** `lane_336af3bdc474` · **Run** `erun_1b33845011608284` · 2026-08-25

A Tour invitation sent while the operator was on hosted staging carried a booking link
pointing at `localhost`. This is the diagnosis and the repair. It is a bounded public-URL
authority defect; Communications V1 stays closed.

---

## 1. The trace

| Question | Answer |
|---|---|
| Route generated | `/tour-booking/{token}`, aliased to a short `/a/{short_code}` |
| Generated where | **Server-side**, in `sendTourInvitation` at *prepare* time |
| Origin authority | `process.env.NEXT_PUBLIC_APP_URL`, read directly by `sendTourInvitationAction` |
| Persisted | **Yes** — as absolute text, into the draft and then into `communication_messages.body` and `rendered_snapshot` |
| From a template | No |
| From request headers | Not on this path (but see §4 — seven other paths did) |
| Client-side | No |

## 2. Why localhost won while the runtime was staging

It didn't. **No hosted runtime ever minted that origin.** Both hosted runtimes are
configured correctly, proven from the live public bundles rather than from a config screen:

| Runtime | `NEXT_PUBLIC_APP_URL` inlined in the served bundle | Supabase project |
|---|---|---|
| `staging.workwithalloy.com` (`vercelEnv: preview`) | `https://staging.workwithalloy.com` | `ikaxilmwmrmbagoidedu` |
| `www.workwithalloy.com` (`vercelEnv: production`) | `https://workwithalloy.com` | `vslwnntzzgpnmrpjipat` |
| managed agent slot (`web/.env.local.agent`) | `http://localhost:301X` | **`ikaxilmwmrmbagoidedu`** |

The slot writes into **the same database staging reads**. And the link is materialized as
absolute text by whoever *authors* it, then frozen — nothing re-derives it downstream.

> **The origin was owned by whoever composed the message, not by whoever delivered it.**

The census then found the mechanism is worse than a stale draft. Dispatch is a separate
worker polling `communication_messages` for `queued`/`deferred`; it cannot tell which
process inserted a row. So **a slot's dev server enqueues and a hosted worker really
sends** — to a real recipient.

## 3. What the census proved (`tha_1d2752ee0d0ab6`, read-only)

- **8** outbound email bodies in the deployed project carry a loopback link.
  **7 `sent`, 1 `delivered`.**
- Ports: **3015 ×7, 3014 ×1**. Every one is a *slot*, never a hosted runtime.
- Most recent: `http://localhost:3014/a/R25htnbk`, `delivered`, **2026-08-25T21:33Z** —
  the reported invitation.
- Oldest: 2026-08-08. So this has been live for **17 days**.
- **All 50** `action_links` rows hold same-origin relative `redirect_path` values.
  **The link store is clean.** Only the rendered text ever carried an origin — which is
  why remediation needs no repair to the token store.
- Positive control (`staging.workwithalloy.com` in a body): **0**. Read carefully: the
  loopback probe matched 8 rows, so the probe demonstrably works. What the zero says is
  that **no message body in this database has ever carried a hosted origin** — every
  recipient-facing link ever persisted here was minted by a slot.

## 4. Authorities found, and where they went

| Was | Now |
|---|---|
| `sendTourInvitationAction` read `NEXT_PUBLIC_APP_URL` itself | `resolvePublicAppOrigin()` |
| `resolvePublicBaseUrl(request)` fell back to the **request origin** | authority only; the request parameter is **removed**, so it cannot come back |
| 7 admin routes derived the origin from `Host` / `X-Forwarded-Host` | authority only |
| `getPublicAppOrigin()` returned `""` silently → callers emitted relative `/a/CODE` into SMS | a decision value that names its failure |

One authority: **`web/lib/publicAppUrl.ts`**.

## 5. Environment semantics

| Environment | Origin | Loopback link |
|---|---|---|
| local development | `http://localhost:301X` | correct, untouched |
| certification | `http://localhost:3911` | correct, untouched |
| hosted staging | `https://staging.workwithalloy.com` | re-anchored, else refused |
| production | `https://workwithalloy.com` | re-anchored, else refused |
| **slot → deployed database** | none available | **refused** |

Hosted + missing / malformed / insecure / loopback origin → **fail closed before send**.

## 6. The guard, and why it sits at enqueue

`enforceOutboundPublicLinkOrigin` runs inside `enqueueCanonicalOutboundMessage` — the last
point at which application code owns the body. It re-anchors loopback URLs onto the
delivering runtime's own origin and refuses if any survive.

Two details that decide whether the fix is real:

- It rewrites **`rendered_snapshot` as well as `body`**. `deliverQueuedEmailHtml` sends
  `rendered_snapshot.html`; repairing only `body` would fix the record and still deliver
  the broken link.
- It keys on **whether the row lands in a deployed database**, not on whether the process
  is hosted — because the census showed the sends came from slots.

A slot on the deployed database is not misconfigured; it is *supposed* to have a loopback
origin. So it is refused only for the concrete harm — a body that actually carries a
loopback link. Everything else still sends. A hosted runtime with no usable origin refuses
outright, links or not.

Refusal is a `workflow_events` row (`message_link_origin_blocked`), never a
`communication_messages` row — modelled on the existing render refusal, because the
dispatch poller selects from that table and nothing undeliverable may sit where a poller
can reach it.

## 7. Certification

29 assertions in `web/tests/communications/publicLinkOriginAuthority.test.ts`:
local → local · certification → certification · staging → staging · production →
production · no loopback escapes a hosted runtime · **`Host` header has nothing to
influence** (structural: the seam takes no request) · malformed/missing/insecure hosted
origin refuses before send · email and SMS share one authority · participant token and
path unchanged · re-anchoring is idempotent, so a retry cannot move an authorized
destination · third-party URLs are never re-hosted.

`typecheck` rc=0 · `typecheck:tests` rc=0 · targeted route suites 195/195 ·
tours + enqueue suites 573/573. The 18 failures in `tests/communications` are **pre-existing** —
identical list at `8e45f70a1`.

## 8. Promotion

**Pushed and promoted under explicit operator authorization (`erun_6404ce675c434ffb`).
`0f2e6b4d6` → **PR #510** → staging.**

**The defect is NOT closed.** Merging is not acceptance: the hosted Tour invitation has not
been sent or received, so nothing here may be read as a live pass. §8.4 is the checklist
that closes it.

### 8.1 The one thing that had to be authorized

An earlier run (`erun_8e5d1610622ee0d7`) stopped here, and the reason is worth keeping.
Push is not a worker capability: the session permission classifier denies `git push`, and
Alloy independently models push as **`repository.push`**, a control-plane command with
`confirmation: "required"`. The worker-facing `vac governed-action` CLI accepts only three
trusted-host keys (`database.read_census`, `repository.merge_pull_request`,
`database.apply_migration`), so `repository.push` returns **`unsupported_action_key`**. The
same is true of `promotion.open_pr`, and `repository.merge_pull_request` needs a
`pullRequestNumber`, so neither can substitute. Explicit operator authorization is the only
key that fits this lock.

### 8.2 Reconciliation and validation

**Step 2 — reconciliation against current staging: CLEAN.**

| Check | Result |
|---|---|
| `origin/staging` | `37cd4113a` (unchanged since orientation) |
| ahead / behind | 3 ahead, 339 behind |
| files changed on staging since merge base | 651 |
| **overlapping files** | **0** |
| `git merge-tree` | clean, no conflicts → tree `98f753823` |

Every invariant re-verified **against the merged tree**, not against my branch alone:

- `web/lib/publicAppUrl.ts` is the shared authority — present.
- `enforceOutboundPublicLinkOrigin` runs inside `enqueueCanonicalOutboundMessage` — line 562.
- `body` **and** `rendered_snapshot` rewritten at both insert sites — lines 729/742, 812/825.
- local / certification loopback still allowed — the `!deliveryIsHosted` early return.
- deployed-database rows cannot retain loopback — `isDeployedDatabaseTarget` + `undeliverable_link_origin`.
- hosted missing/invalid origin fails closed — `isHostedRuntime(runtime) || offending.length > 0`.

Staging **has not materially changed any authority**: it still carries the seven
header-derived origins, the Tour action's own env read, and the `resolvePublicBaseUrl`
request fallback — i.e. the exact pre-fix state. No stop condition, and no new competing
authority appeared.

**Step 3 (local half) — all green at `2463475f0`:**
targeted Tour / action-link / outbound / enqueue / delivery suites **685/685** ·
`typecheck` rc=0 · `typecheck:tests` rc=0 · **0 migrations touched, 0 new migration files**
(migration preflight trivially unchanged) · the 18 pre-existing Communications failures
reproduce **exactly** (18 failed / 77 passed, identical list at `8e45f70a1`) — preserved as
baseline, not "fixed".

CI, PR mergeability and required checks are **unverified** — no PR exists.

**Step 6 — local positive control: PASS.**
Proven at the real seam (`publicLinkOriginEnqueueSeam.test.ts`, 7 assertions driving
`enqueueCanonicalOutboundMessage` and reading the row the poller would pick up), because
covering only the pure function proves the function and not the wiring:

| Database | Origin | Result |
|---|---|---|
| local stack | `http://localhost:3013` | kept, **not** re-anchored to staging |
| certification | `http://localhost:3911` | kept |
| hosted staging | `https://staging.workwithalloy.com` | required; loopback re-anchored |
| production | `https://workwithalloy.com` | required; loopback re-anchored |
| slot → deployed | none available | **no sendable row created** |

**Step 7 — the 8 already-sent messages: recorded, NOT mutated.**

- **7 `sent` + 1 `delivered`.** Nothing queued, so there is no row to repair in place.
- All carry **valid tokens** with **incorrect loopback origins** — `action_links` is clean,
  so the tokens themselves still resolve.
- **Re-send is the only safe user-facing remediation**, and only if a given invitation
  matters. Not done automatically; operator decision.

### Residual found during reconciliation, deliberately NOT fixed here

`web/app/api/admin/send-password-reset/route.ts` and `web/app/api/admin/users/route.ts`
build a Supabase `redirectTo` from `NEXT_PUBLIC_APP_URL` directly. Those links are
externally delivered but are sent **by Supabase**, not through
`enqueueCanonicalOutboundMessage` — so this repair's seam does not cover them, and a slot
could still emit a loopback password-reset link. Recorded rather than fixed: this run is
bounded to the public-link-origin defect in outbound Communications.

### 8.4 Hosted acceptance — the only remaining gate

A managed slot cannot run this: its auth cookie is loopback-scoped. It needs a Director
session on hosted staging.

1. Open hosted staging and send **one** controlled Tour invitation.
2. Inspect the **actually received** Email/SMS. Require `https://staging.workwithalloy.com/…`
   and reject any `localhost`, `127.0.0.1`, or `:301X`.
3. Click the received link. Prove it opens the intended hosted Tour/participant experience,
   with no redirect back to localhost.
4. Prove the action-link token and path still resolve, and that the Tour/Enrollment
   transition still behaves.

Until that is reported as passing, the defect stays open.

## 9. Original open items (superseded by §8)

- Live staging acceptance — requires governed promotion.
- Remediation of the 8 already-sent bodies — operator decision.
