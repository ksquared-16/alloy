---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Conversation Code Retirement Ledger

**Permanent document.** Supersedes the interim ledger written during Phase 0.

Two halves:

- **Part A — Retired paths.** What was removed, what replaced it, why, the commit,
  and the evidence that it is actually gone.
- **Part B — Retained compatibility adapters.** What still exists, who calls it,
  and the condition under which it may be deleted.

The purpose of Part B is that **no shim is permanent by default.** A compatibility
layer without a stated deletion condition becomes architecture by accident.

---

# Part A — Retired paths

### A-1 · Path-driven document authorization

| | |
| --- | --- |
| **Old** | Signing authorized on the storage path; a caller who could shape a plausible path could obtain a signed URL |
| **New** | `assertDocumentAccess` — the `documents` **row** is authority; the path must match the row |
| **Reason** | A path is a guess; a row is a fact. Path-shaped guesses now fail closed. |
| **Commit** | `6bb7b866c` |
| **Evidence** | `tests/documents/documentAccessAuthorization.test.ts`; decision type is `allowed` \| `blocked` \| `not_found` with no permissive default |

### A-2 · Permissive authorization on the two remaining signing routes

| | |
| --- | --- |
| **Old** | Two of three signing routes still used the pre-6A permissive path |
| **New** | All three route through `assertDocumentAccess` |
| **Reason** | Commit 6 was explicitly not complete while two routes bypassed the canonical decision |
| **Commit** | `3c0a42d92` |
| **Evidence** | `tests/documents/signerConvergence.test.ts` asserts every signer references `assertDocumentAccess` |

### A-3 · Seven-day signed URLs

| | |
| --- | --- |
| **Old** | `60 * 60 * 24 * 7` — a week-long bearer credential, including on children's photographs |
| **New** | `signedUrlExpirySeconds(op)`, capped at 15 minutes for every operation |
| **Reason** | A week-long signed URL outlives every revocation the platform can perform |
| **Commit** | `6bb7b866c`, completed by `6c4089e7c` |
| **Evidence** | `signerConvergence.test.ts` — "no seven-day expiry literal left in any signer" (comment-stripped scan, because several files deliberately quote the old value while explaining its removal) |

### A-4 · Signed URLs persisted into person metadata

| | |
| --- | --- |
| **Old** | `persons.metadata.photo_url` stored a signed URL, making one actor's expiry-bound credential durable metadata readable by every other actor — and the reason a seven-day expiry was needed to stay useful |
| **New** | Only `profile_photo_document_id` is persisted; URLs resolve per request, per actor via `resolveProfilePhotosForActor` |
| **Reason** | A signed URL is authorization material, not data. Caching it across actors is a category error. |
| **Commit** | `d32cbc160` |
| **Evidence** | `assertNoCredentialInMetadata` throws on any signed value; `tests/documents/profilePhotoPresentation.test.ts` proves actor A's URL is never reused for actor B |

### A-5 · Sign-then-authorize on the profile-photo route

| | |
| --- | --- |
| **Old** | `resolveLatestProfilePhotoDocumentForPerson` queried **and signed** a seven-day URL; the route called `assertDocumentAccess` afterwards |
| **New** | `findCanonicalProfilePhotoDocumentForPerson` is query-only; the route signs after the guard, at 15 minutes |
| **Reason** | The route passed review and returned errors to unauthorized callers, so the defect was invisible at commit level: the credential was minted regardless of the decision, and when allowed it outlived that decision by a week |
| **Commit** | `6c4089e7c` |
| **Evidence** | `signerConvergence.test.ts` — "authorizes before the first createSignedUrl", and "keeps the person photo lookup a query, with no signing of its own" |

> **This is the entry to read if you read only one.** Two of Phase 0's own
> published claims were false when the closeout inventory ran. The fix was cheap;
> the lesson is that convergence claims must be enforced by tests, not asserted
> during review.

### A-6 · Six unauthenticated rejection-branch SMS sends

| | |
| --- | --- |
| **Old** | Six of nine send sites in `dispatch.py` fired on **rejection** branches — supplying only a `contact_id` produced an SMS with no validation having succeeded |
| **New** | Rejection branches send nothing and record `audit("validation_failed", …)` |
| **Reason** | It was an unauthenticated SMS oracle: an attacker could send messages and confirm contact existence without any credential |
| **Commit** | `cc990544f` |
| **Evidence** | `backend/tests/test_legacy_dispatch_containment.py::TestRejectionBranchesSendNothing` names each removed call site |

### A-7 · Home-access disclosure over SMS

| | |
| --- | --- |
| **Old** | The assignment confirmation contained customer phone, full street address, entry method and access notes — gated only by a 5-digit code with no attempt limit |
| **New** | `build_assignment_confirmation` — date/time and customer name only; states that access details are not sent by text |
| **Reason** | A 5-digit code (~90k keyspace) is not authorization to disclose how to enter someone's home |
| **Commit** | `cc990544f` |
| **Evidence** | `TestSensitiveDataMinimisation` scans the built message and the route source for every forbidden field |

### A-8 · Unauthenticated dispatch and payment routes

| | |
| --- | --- |
| **Old** | `POST /dispatch`, `POST /contractor-reply` and `POST /admin/payments/run` accepted any caller |
| **New** | Workflow secret / dedicated payment secret, `hmac.compare_digest`, checked before any lookup, failing closed (503) when unconfigured |
| **Reason** | One could send SMS; one could charge a card |
| **Commit** | `cc990544f` (dispatch), `772103aee` (payments) |
| **Evidence** | `test_legacy_dispatch_containment.py::TestAuthentication`, `test_payment_executor_auth.py` |

> **Why two different secrets.** Dispatch uses `GHL_WORKFLOW_SECRET` because
> GoHighLevel is the legitimate caller and already holds it. The payment executor
> got a **dedicated** secret: a card-charging endpoint must not be reachable with a
> credential that lives in an external automation platform.

### A-9 · Client-supplied rendered output

| | |
| --- | --- |
| **Old** | Rendered content could originate client-side |
| **New** | `renderOutboundMessage` is server-authoritative; `rendered_snapshot` records what was produced |
| **Reason** | Rendering is where tokens resolve against real records; a client-supplied render is unverifiable |
| **Commit** | `3f9a42e29` |
| **Evidence** | `tests/communications/canonicalRenderer.test.ts` |

**Secondary benefit, worth recording:** the canonical renderer owns its
substitution (`substituteTokens`) rather than delegating to the older engine's
nested dot-path traversal. That was originally a bug fix, and it also removed
arbitrary object traversal from the render path.

### A-10 · The inert eligibility gate

| | |
| --- | --- |
| **Old** | `executeCommunicationsSend` appeared to gate sends; its check was inert for four independent reasons — most simply, `/send` accepts a free-text `to` with no person reference, so there is no consent to check |
| **New** | Enforcement at `enqueueCanonicalOutboundMessage`, covering 10 of 14 send paths |
| **Reason** | The gate everyone believed in did not gate |
| **Commit** | `f004948e5` |
| **Evidence** | `tests/communications/canonicalEnqueueEligibilityGate.test.ts` |
| **Not complete** | 4 paths still bypass — Debt D-2, Phase 1 |

### A-11 · Non-canonical `announcement_targets` shape

| | |
| --- | --- |
| **Old** | The live table had only `target_spec`; the API wrote `target_type`/`target_ref`/`rule`, which did not exist. Both migrations were recorded applied — a `CREATE TABLE IF NOT EXISTS` had silently no-opped |
| **New** | Canonical shape present |
| **Reason** | P0-4: the one defect live verification found **actively broken**. Zero rows existed because it had never worked |
| **Commit** | `735c126fb` |
| **Evidence** | `announcementTargetsCanonicalShape.test.ts`; verified post-replay in the certification DB |

### A-12 · Ignored inbound SMS keywords

| | |
| --- | --- |
| **Old** | STOP / START / HELP were not processed |
| **New** | `sms_keywords.py` + `inbound_keyword_handler.py`, driven by `contracts/communications/sms-keywords.json` |
| **Reason** | Statutory. Ignoring STOP is not a feature gap. |
| **Commit** | `d0777b656` |
| **Evidence** | `backend/tests/test_inbound_sms_keywords.py`; parity test on the TS side |

> **Deliberate omission:** `"yes"` was **removed** from the START vocabulary.
> "Yes" is a common reply to an unrelated question; treating it as consent
> restoration manufactures consent.

### A-13 · The unscoped tour public-booking-link creator (Interactive Tour, Slice C)

| | |
| --- | --- |
| **Old** | `POST /api/admin/tours/public-booking-links` minted a tour link scoped to org + opportunity + location only. It bound no recipient, carried no action kind, and was neither single-use nor use-counted — so possession of the token was the entire authority, and one token could view, book, reschedule, confirm and cancel |
| **New** | `mintTourInvitation` — the single creator. Every link it issues carries `invitation_id`, `recipient_person_id` and one `action_kind` from a closed 7-kind vocabulary, with `consumed_at` for single-use kinds and `max_uses`/`use_count` for reusable ones |
| **Reason** | An unscoped minter makes the scoping guarantee a convention rather than a property. While it existed, a scoped authorizer could be bypassed simply by minting through the old door — so the authorizer could not be relied upon. Deleted outright rather than deprecated: it had zero callers, so no tombstone was warranted |
| **Commit** | `fc7e9aa84` (was `6ca61e346` before the 2026-08-03 rebase onto `db212fe1c`) |
| **Evidence** | 78 lines deleted, whole file. **Zero callers** — `grep -rn 'public-booking-links' web/ --include='*.ts*'` returns nothing. **Exactly one INSERT** into `tour_public_booking_links` remains platform-wide, at `web/lib/tours/invitation/mintTourInvitation.ts:256`; the other three readers of the table (`authorizeTourAction`, `resolveTourPublicBookingLink`, `deleteOpportunityLead`) never insert. Unscoped links are refused by the **database**, not by convention: CHECK `tour_public_booking_links_scoped_complete_chk` in `supabase/migrations/20260801120000_tour_invitation_and_scoped_public_actions.sql`. Behaviour covered by `web/tests/tours/mintTourInvitation.test.ts` and `web/tests/tours/authorizeTourAction.test.ts` |

> **Certification note — CLOSED 2026-08-03.** The DB-level assertions behind this
> entry were re-run after the rebase, under an exclusive lease on the sanctioned
> shared stack: 307 migrations replayed clean in full chain, the migration
> re-applied twice on a live database without error, and 11/11 assertions passed
> against real FK-backed fixtures both before and after the re-apply. Every
> rejection names the constraint that fired, so the CHECK — not a foreign key —
> is what refused each incomplete scoped link. Script and evidence:
> `certification/interactive-tour/`.

---

# Part B — Retained compatibility adapters

Each has a **named removal condition**. None is permanent.

### R-1 · `resolveIdentityPhotoUrl.ts` — legacy photo compatibility adapter

- **Why it still exists.** Historical `persons.metadata` rows still carry legacy photo URLs. Returning one would hand a caller a stale bearer credential outliving its authorization.
- **Who calls it.** Every photo-reading path, directly or via `resolveChildPhotoUrl` — roughly twelve view-model builders.
- **Removal condition.** (a) No `persons.metadata` row carries a legacy photo URL, verified by the coordinated data migration, **and** (b) every consumer reads a field populated by `resolveProfilePhotosForActor`.
- **Target phase.** Phase 2 + a data migration.
- **Commit.** `7bec5f881`

### R-2 · `RESOLVED_PHOTO_URL_KEY` / `applyResolvedPhotoUrls`

- **Why it still exists.** Resolver output must be distinguishable from values found in storage. A resolver-produced URL *is* a signed URL, so shape-filtering would reject exactly the value just authorized. Trust is by **provenance**, not shape — hence a distinct key.
- **Who calls it.** Server-side list projections that batch-resolve photos.
- **Removal condition.** View models take a resolved photo field directly from the resolver instead of being patched post-hoc.
- **Target phase.** Phase 2.

### R-3 · `classifyLegacyPhotoUrl` + the `external_stable_url` allowance

- **Why it still exists.** Some legacy metadata values are genuine external images that should keep rendering. Blanket erasure would delete valid data.
- **Who calls it.** `resolveIdentityPhotoUrl`, the profile-photo route's fallback branch.
- **Removal condition.** No person metadata carries any URL — only `profile_photo_document_id`.
- **Target phase.** after the data migration.

### R-4 · `backend/app/services/legacy_dispatch_guard.py`

- **Why it still exists.** It contains two live-but-dormant routes. Written to be disposable.
- **Who calls it.** `backend/app/routes/dispatch.py`, both routes.
- **Removal condition.** Decommissioning of the GHL cleaning vertical.
- **Target phase.** Decommission — gated on one operational check inside GoHighLevel that cannot be answered from the repository.
- **Known limitation.** Guard state is process-local, so lockout/rate-limit/idempotency are defeated by multi-instance deployment. Adequate for a dormant route; inadequate if revived (Debt D-8).

### R-5 · `backend/app/routes/dispatch.py`

- **Why it still exists.** The cleaning vertical's state machine lives in GoHighLevel, not Alloy. Migrating it would import four foreign models — a GHL-owned identity namespace, an unowned job state machine, an untelemetered provider path, and an SMS-code auth scheme — into the Conversation Runtime.
- **Removal condition / phase.** Same as R-4.

### R-6 · `web/scripts/vendorObjectPathRemediation.ts`

- **Why it still exists.** Six legacy vendor objects violate the org-prefix convention. All six lack `documents` rows and all three vendor ids lack `vendors` rows, so they fail closed and are already unreachable now that signing is row-driven.
- **Who calls it.** Nobody automatically. Defaults to `dry-run`; mutating modes require explicit `authorizedToMutate`.
- **Removal condition.** The six objects are dispositioned.
- **Target phase.** On Kelly's decision. This is cleanup, not exposure.
- **Commit.** `770aabdfb`

### R-7 · `recordCategoryFallback`

- **Why it still exists.** Classification columns landed before any send path was *required* to populate them. This measures the gap rather than assuming it closed.
- **Who calls it.** The eligibility layer, whenever a category is defaulted.
- **Removal condition.** Zero fallbacks recorded over a full billing cycle.
- **Target phase.** Phase 1.

### R-8 · `OPTIONAL_TOKEN_PATHS`

- **Why it still exists.** The renderer must know which tokens may be absent without failing the render; the token catalogue has no optionality concept.
- **Who calls it.** `renderOutboundMessage`.
- **Removal condition.** Optionality is declared in the token catalogue.
- **Target phase.** Phase 3.

---

# Part C — Permanent by design

Recorded so they are never mistaken for debt and "cleaned up":

| Artifact | Why permanent |
| --- | --- |
| `contracts/communications/*.json` + parity tests | The cross-runtime seam. Two processes that cannot import each other need a data contract. |
| `assertDocumentAccess` | The single document authorization decision. |
| `enqueueCanonicalOutboundMessage` | The single enqueue choke point. |
| `evaluateEligibility` (pure, versioned) | Purity makes it replayable; versioning makes policy change diffable. |
| `eligibility_snapshot` on the message row | The audit record of what was authorized. Must not become recomputable. |
| `tests/documents/signerConvergence.test.ts` | Exists because review alone failed to catch A-5. |

---

# Part D — GoHighLevel retirement (2026-08-01)

**Final disposition**

```text
GoHighLevel integration: fully retired
Active runtime routes: 0
Active callers: 0
Active environment variables: 0
Active UI/configuration: 0
Supported reactivation path: none
Historical migration references: retained only for replay
```

Commits: `ea3eaf377` (backend + cleaning product), `<follow-up>` (browser-side GHL components).

## D-1 · Deleted routes

| Route | Prior purpose | Replacement |
| --- | --- | --- |
| `POST /dispatch` | Offer a cleaning job to contractors by SMS | none — vertical retired |
| `POST /contractor-reply` | Accept an offer via 5-digit code | none |
| `POST /stripe/charge` | Charge a card, authenticated by `GHL_WORKFLOW_SECRET` | `POST /admin/payments/run` (own dedicated secret) |
| `GET /stripe/card-status`, `POST /stripe/setup-intent`, `POST /stripe/webhook` | Cleaning funnel card capture | none |
| `routes/leads`, `quote`, `discounts`, `webhooks`, `debug` | Legacy cleaning product API | none |
| `web /book`, `/book-v2`, `/payment`, `/api/book-v2` | Cleaning booking + payment UI | none |

No tombstones were added: these were reachable only by GoHighLevel workflows, which are themselves retired, so a `410` would serve no caller.

## D-2 · Deleted services and helpers

`backend/app/ghl_client.py` (LeadConnector client) · `services/legacy_dispatch_guard.py` (Phase 0 containment, R-4 condition met) · `lead_processing.py` · `pricing.py` · `utils.py` reduced to `normalize_phone` (its only non-GHL caller).

## D-3 · Deleted browser-side GHL — found only by post-deletion build verification

| Artifact | Why it mattered |
| --- | --- |
| `components/GhlScript.tsx` | **Mounted in the root `app/layout.tsx`** — loaded `link.msgsndr.com/js/form_embed.js` and called `LeadConnector.init()` on *every page of the product* |
| `components/GhlBookingEmbed.tsx` | iframe to `api.leadconnectorhq.com/widget/booking/...`; zero consumers |
| `components/GhlEmbed.tsx` | GHL form embed |
| `components/CollapsibleQuoteForm.tsx` | Sole consumer of `GhlEmbed`; zero consumers of its own |

**This was the most active GHL integration in the product and the first inventory missed it**, because that sweep covered `web/app` and `web/lib` but not `web/components`. It surfaced only when the production build was run. Recorded here because the lesson generalises: an identifier inventory is only as good as its search roots, and `grep -i ghl` is additionally poisoned by the substring in "highlight".

## D-4 · Removed environment variables

`GHL_WORKFLOW_SECRET`, `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_API_VERSION`, `GHL_STAGE_ID_*`, `GHL_STRIPE_CUSTOMER_ID`, and every remaining `GHL_*` key, plus `JOB_STORE` / `OFFER_STORE` and the cleaning custom-field catalogue. Alloy no longer reads any GHL variable.

## D-5 · Shared code — GHL branch removed, behaviour preserved

`supabase_client.py`: removed the "Priority 2: GHL contact_id via external_mappings" branch inside the live `link_stripe_customer_to_supabase`, and the two now-dead `resolve_*_from_ghl` helpers. The payment executor depends on this module; its non-GHL resolution paths (direct UUID, email) are intact.

## D-6 · Deliberately retained

| Artifact | Why |
| --- | --- |
| `web/lib/booking.ts` | Builds a booking URL path from `NEXT_PUBLIC_BOOKING_PATH`. Contains no GHL call. Consumed by `CleaningQuoteForm`, `SpecialtyCleaningQuoteForm`, `FirstFreeTermsModal` and five public pages — deleting it would have been cleaning-product removal, out of scope. |
| `lib/booking*.ts`, `lib/pricing/*`, `lib/book-v2/*` | Shared with Create Lead, household primary contact, form intake and admin quote catalogue |
| `api/action-links/consume-accept-job` | Action-links infrastructure, retained by decision |
| 1 historical migration mentioning GHL | Required for clean replay; no runtime depends on it |

## D-7 · Verification evidence

`next build` green · web 25 failed / 785 passed (unchanged pre-existing baseline) · backend 93 tests / 2 errors (the pre-existing absent-package errors; count fell from 124 because the 31 containment tests were deleted with their routes) · migration preflight 302/302, 0 orphans, 0 pending, 0 migrations touched · route inventory: 3 routers mounted (stripe, messages_sender, sms_inbound) · import inventory clean · no `msgsndr`/`leadconnectorhq`/`LeadConnector` reference remains in `web`.

## D-8 · Known consequence, not repaired here

`getBookingPath()` still defaults to `/book`, and that route was deleted with the cleaning product. Four call sites (`FirstFreeTermsModal`, `CleaningQuoteForm`, and the cleaning marketing pages) therefore link to a removed route. This is a cleaning-product consequence, not a GHL one, and repairing it would mean deleting or rewriting those marketing pages — explicitly out of scope for this branch. **Flagged for a decision.**

## D-9 · `sync/` — the standalone GHL sync service (2026-08-01)

The last GHL artifact. A separate Python service that pulled from GoHighLevel
and upserted into Supabase.

| | |
| --- | --- |
| **Prior purpose** | GHL → Supabase sync of contacts, opportunities and jobs |
| **Replacement** | none — GoHighLevel is retired |
| **Deleted** | 784 files: 10 source/config files + a committed 774-file `.venv` |

**Caller evidence, verified before deletion:** no deployment manifest
(`vercel.json`, `Procfile`, `Dockerfile`, `docker-compose`, `railway`,
`render.yaml`, `fly.toml`) references it; no `package.json` script invokes it;
no CI workflow runs it; no module in `web/` or `backend/` imports it (the three
apparent hits were the unrelated word "synced" in comments).

**Nothing inside was non-GHL.** Every file in `sync/src` is GHL-laden, including
`supabase_db.py` (28 GHL references — it is the GHL-side writer, not a shared
Supabase client).

**Committed `.venv` was isolated:** python3.9, whereas `backend/.venv` is
python3.10. Its `requirements.txt` was only `python-dotenv` and `requests`, both
still used by `backend`, so **no shared root dependency was removed**.

**Documentation corrected** (claimed GHL was active): `backend/main.py`
docstring, root `README.md` (project tree, service list, and the "Sync
(optional)" setup section). `backend/README_refactor.md` is marked **HISTORICAL**
rather than rewritten, since it accurately describes prior work.

**Verification:** backend 93 tests / 2 errors (pre-existing absent-package only)
· migration preflight 302/302, 0 orphans, 0 pending · precise GHL search returns
only retirement docstrings · 0 committed GHL virtual environments.

```text
Active GHL application routes: 0
Active GHL services: 0
Active GHL callers: 0
Active GHL environment variables: 0
Active GHL deployment configuration: 0
Committed GHL virtual environments: 0
Supported GHL reactivation path: none
Historical migration references: 1, retained for replay
```

**Deferred cleaning debt, recorded not fixed:** `getBookingPath()` still defaults
to the deleted `/book` route (4 call sites). Not a GHL or Conversation Platform
blocker. See D-8.
