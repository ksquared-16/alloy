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

## 8. Not done

- **Live staging acceptance.** Requires governed promotion; this lane cannot push or merge.
- **Remediation of the 8 already-sent bodies.** They are `sent`/`delivered` — nothing is
  queued, so there is nothing to repair in place. The tokens behind them are still valid
  (`action_links` is clean), so a recipient who needs one can be re-sent an invitation
  once this is promoted. **Operator decision.**
