# Conversation Technical Debt Register

Every known remaining debt in the communications surface as of 2026-07-31.

**Priority** — P1 blocks production or Phase 1; P2 should be fixed in its phase;
P3 is cleanup.
**Blocks production?** — would a reasonable release manager hold a release on it.

---

## P1 — blocks Phase 1 or production

### D-1 · Preview renderer diverges from the send renderer

| | |
| --- | --- |
| **Priority** | P1 |
| **Owner** | Template Platform (WS12) |
| **Blocks production?** | **No** — but it blocks trusting previews |
| **Removed by** | Phase 3 |

**Why it exists.** Phase 0's mandate was the *send* path. It made
`renderOutboundMessage` canonical and server-authoritative and proved
`previewOutboundMessage` is literally the same function. But the preview
*endpoint* (`/api/admin/communications/templates/[id]/preview`) predates that
work and calls `buildTemplatePreview` → `renderCommunicationTemplate`, a
different engine with different token semantics.

**Consequence.** An operator can preview a template, approve it, and have it send
differently. Parity is proven by unit test but not enforced by wiring — precisely
the class of claim Phase 0 learned not to trust.

**Fix.** Point the preview endpoint at `previewOutboundMessage`. Expect token
semantics differences to surface as test failures; that is the point.

---

### D-2 · Four send paths bypass the enqueue gate

| | |
| --- | --- |
| **Priority** | P1 |
| **Owner** | Conversation Runtime |
| **Blocks production?** | **Yes**, for any tenant with real opt-outs |
| **Removed by** | Phase 1 |

**Why it exists.** Phase 0 relocated enforcement to
`enqueueCanonicalOutboundMessage` because it covered 10 of 14 paths with zero
re-pointing. The remaining four route through `executeCommunicationsSend` or
send directly, and re-pointing them was out of Phase 0's bounded scope.

**Consequence.** Eligibility enforcement is strong but not universal. Today the
tenant is pre-production with zero opted-out people, so the exposure is latent.
It stops being latent on the first real opt-out.

**Fix.** Re-point the remaining callers; then make `executeCommunicationsSend`
either a thin delegate or delete it. Add a test asserting no send path reaches a
provider adapter without an enqueue.

---

### D-3 · Classification is optional in practice

| | |
| --- | --- |
| **Priority** | P1 |
| **Owner** | Conversation Runtime |
| **Blocks production?** | **No** — defaults are conservative (`operational`) |
| **Removed by** | Phase 1 |

**Why it exists.** The columns and constraints landed in Phase 0, but requiring
every call site to supply a category would have meant touching every send path —
Phase 1's job. `recordCategoryFallback` was added to *measure* the gap rather
than assume it away.

**Consequence.** Messages default to `operational`, which is a middle-strictness
guess. A marketing message defaulting to `operational` is a compliance problem.

**Fix.** Make `category` a required argument at the enqueue boundary. Retire
`recordCategoryFallback` when it reports zero over a full billing cycle (R-7).

---

### D-4 · Scheduled sends have no lease

| | |
| --- | --- |
| **Priority** | P1 |
| **Owner** | Conversation Runtime |
| **Blocks production?** | **Yes** at more than one worker |
| **Removed by** | Phase 2 |

**Why it exists.** Pre-dates Phase 0; found in discovery, out of Phase 0 scope.

**Consequence.** Two workers can claim the same scheduled send and dispatch it
twice. Single-worker deployment masks it entirely, which is why it has not been
observed.

**Fix.** A claim/lease column with an atomic conditional update, matching how
`process_communication_messages` claims queued rows.

---

## P2 — fix within the owning phase

### D-5 · Avatar read path not adopted

| | |
| --- | --- |
| **Priority** | P2 · **Owner** Phase 2 UI · **Blocks production?** No |

**Why it exists.** Phase 0 removed persisted signed URLs and capped expiry at 15
minutes. That was correct and is the reason avatars now degrade: surfaces reading
the old `persons.metadata.photo_url` cache find values that are classified and
discarded rather than displayed.

**Consequence.** Cosmetic — affected surfaces show initials instead of a
photograph. No credential leaks; that is the trade Phase 0 deliberately made.

**Fix.** Adopt `resolveProfilePhotosForActor` + `applyResolvedPhotoUrls` in the
remaining view-model builders. Then retire the adapter (R-1).

---

### D-6 · Three composer surfaces

| | |
| --- | --- |
| **Priority** | P2 · **Owner** WS4 / Phase 2 · **Blocks production?** No |

**Why it exists.** Command Center, entity drawer and family workspace were built
by different tracks at different times, each with its own recipient model.

**Consequence.** Three chances for recipient resolution to diverge; three places
to fix any composer bug. This is the largest single duplication in the platform.

**Fix.** `ComposerV2` + `composerModel` become the one runtime; the family
workspace and drawer become callers, not implementations.

---

### D-7 · Three thread-loading paths and three prefetch caches

| | |
| --- | --- |
| **Priority** | P2 · **Owner** Phase 2 · **Blocks production?** No |

**Why it exists.** Same cause as D-6, on the read side.

**Consequence.** The same thread can present differently depending on which
surface loaded it. Lower risk than D-6 because reads do not mutate.

**Fix.** One thread-loading service; surfaces select projections from it.

---

### D-8 · Legacy dispatch guard state is process-local

| | |
| --- | --- |
| **Priority** | P2 · **Owner** legacy vertical · **Blocks production?** **Yes if revived** |

**Why it exists.** Phase 0 contained a dormant integration. Durable guard state
would have been speculative engineering on code recommended for deletion.

**Consequence.** Lockout, rate limiting and idempotency are all defeated by a
multi-instance deployment. Adequate for a dormant route; **inadequate the moment
the vertical is revived.**

**Fix.** Decommission (preferred — see the recommendation), or treat revival as a
platform onboarding project, not a patch.

---

### D-9 · `OPTIONAL_TOKEN_PATHS` is a hard-coded list

| | |
| --- | --- |
| **Priority** | P2 · **Owner** WS12 / Phase 3 · **Blocks production?** No |

**Why it exists.** The renderer needed to know which tokens may be absent without
failing the render. The catalogue had no optionality concept, so Phase 0 used a
literal list.

**Fix.** Declare optionality in the token catalogue; delete the list (R-8).

---

## P3 — cleanup

### D-10 · Six unowned legacy vendor storage objects

**Priority** P3 · **Owner** Kelly (disposition) · **Blocks production?** No

All six lack `documents` rows and all three vendor ids lack `vendors` rows, so
they fail closed and are already unreachable now that signing is row-driven. The
remediation script exists, defaults to dry-run, and requires explicit
authorization to mutate. This is tidiness, not exposure.

---

### D-11 · 25 pre-existing communications test failures

**Priority** P3 · **Owner** unowned · **Blocks production?** No

Thirteen files of `readFileSync` source-shape assertions. At least one is a
**verified false positive** — `DROP POLICY IF EXISTS` flagged as destructive DDL.
They predate Phase 0 and none are Phase 0's.

They are worth addressing because a permanently red suite trains people to ignore
red. That is a testing-strategy decision, not a defect fix.

---

### D-12 · Live hazard in a dev script

**Priority** P3 · **Owner** unowned · **Blocks production?** No

`scripts/dev/communications-resend-smoke-enqueue.sql` enqueues `status='queued'`
with a hard-coded real org UUID and a real personal email address. Running it
dispatches a real message. It is a developer footgun, not a code path.

**Fix.** Parameterize it, or delete it.

---

### D-13 · `render_blocked` sends persist nothing — ownership undecided

**Priority** P2 · **Owner** UNDECIDED — see below · **Blocks production?** No ·
**Blocks the blocked-send PR?** No

**Where rendering fails.** `web/lib/communications/render/renderOutboundMessage.ts`
returns `{ ok: false, block }` with one of nine codes: `TEMPLATE_UNRESOLVED`,
`CONTEXT_MISSING`, `TOKEN_UNSUPPORTED`, `TOKEN_UNRESOLVED`, `EMPTY_OUTPUT`,
`CHANNEL_VIOLATION`, `UNSAFE_MARKUP`, `PREVIEW_STALE`, `LINEAGE_INCONSISTENT`.
`enqueueCanonicalOutboundMessage` turns that into
`skippedReason: render_blocked:<CODE>` and returns.

**Is there a validated message artifact?** **No** — and that is the whole
difference from an eligibility block. An eligibility refusal happens *after* a
successful render, so there is a validated body, a `rendered_snapshot` and a
fingerprint to persist, and an operator can see exactly what would have gone out.
A render refusal has none of that. Persisting the raw body would put unresolved
`{{tokens}}` into a table whose every other row is render-validated, with a null
`rendered_snapshot`.

**Current observable behavior.** A `console.warn` on the server. No message row,
no workflow event, no operator surface — identical to the eligibility hole before
it was closed.

**Candidate canonical owner.** Template Platform (WS12), not Conversation
Runtime. A render block is an **authoring** defect — a template referencing a
token the record cannot supply — not a fact about a recipient. Filing it on a
family's timeline tells an operator something they cannot act on; a template
health surface tells the person who can. The counter-argument is real: from the
family's record, "we tried to reach you and could not" is true regardless of
cause, and splitting refusals across two surfaces means an operator must look in
two places to answer "did this family hear from us".

**Does it affect Interactive Tour?** **No.** All six parent-facing Tour templates
— invitation, confirmation, reminder, reschedule, cancel, no-show follow-up —
clear `renderOutboundMessage` on both email and SMS. Proven in
`web/tests/tours/tourCommsTemplates.test.ts`, which drives each template through
the real renderer rather than asserting on template text.

**Do not make it symmetric with eligibility blocking without an approved
ownership decision.**

---

## Deliberately deferred — recorded so it is not rediscovered as a surprise

| Item | Why deferred | Phase |
| --- | --- | --- |
| Conversation entity above Thread | needs the message model settled first | 1 |
| Open/click tracking | needs the provider boundary stable | 4 |
| Message attachments (WS11) | needs document authorization settled — Phase 0 did that half | 4 |
| Inbound email ingestion (WS3) | needs identity resolution proven on SMS first | 5 |
| Internal conversations (WS7) | `audience='internal'` exists; no surface consumes it | 5 |
| Conversation analytics (WS13) | needs telemetry to exist | 5 |
| DB trigger as eligibility floor | **open architecture question for Kelly** — it is the only thing covering raw SQL, but relocates an executable invariant into the database | undecided |

---

## Rollup

| Priority | Count | Blocking production |
| --- | --- | --- |
| P1 | 4 | 2 (D-2 with real opt-outs, D-4 at >1 worker) |
| P2 | 6 | 1 (D-8, only if the legacy vertical is revived) |
| P3 | 3 | 0 |

**Nothing blocks Phase 1 from starting.** D-1 through D-4 are Phase 1 and Phase 2
*content*, not prerequisites.

**D-13 needs a decision, not a fix.** It is the only open item whose remedy
depends on an ownership call rather than engineering effort.

---

## Closed since this register was written

| Item | Closed by |
| --- | --- |
| Enqueue-time eligibility refusals persisted nothing | durable `status='blocked'` row + `message_blocked` event — see [`../BLOCKED-SEND-VISIBILITY.md`](../BLOCKED-SEND-VISIBILITY.md) §2–3 |
| `message_blocked` / `message_deferred` reached operators as raw event keys | channel-aware labels, channel enrichment, reason-as-detail — §4 |
| Dispatcher filed policy events under `entity_id = org_id`, unreachable by every record | subject resolved at the canonical producer from the thread — §5 |
