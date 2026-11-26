# Enrollment V0.5 — pre-QA stabilization: plans awaiting decision

Three items need a decision from the Director, or separate approval, before anyone mutates data. None of
them is executed here.

All figures come from deployed-database censuses (`alloy_deployed_primary`), dated 2026-10-18. The census queries named below are lane evidence and are not committed with this plan.

---

## 1. Admin access "see all" fallback (item 3) — Director decision

**What it is.** `web/lib/admin/resolveAdminAccessCore.ts:88` sets `ABSENT_PROFILE_ENFORCEMENT = "legacy-all"`.
- **When it fires:** a membership (`user_roles`) has no `user_access_profiles` row.
- **What it grants:** the operator's department and site scope become *all*, within their own
  organization.
- **What it does not grant:**
  - capabilities — those always come from `role_permission_grants`;
  - access to another organization, because memberships spanning several organizations are refused.
- **Where it applies:** reads and writes on every department- or site-scoped admin route (about 62
  files filter on these scopes).

**Census** (`certification/access/stabilize-legacy-all-census.sql`, gar_cff0228dc192e7):

| Org | Memberships (user, org) | With profile | On the fallback |
|---|---|---|---|
| alloy-bend | 2 | 2 | 0 |
| demo-childcare-co | 11 | 4 | **7** (all `admin`, portal-admitted, one active today) |

**Why the backfill did not stick.** The original backfill, M1 (`20260807140000`), is in the deployed
ledger and did run. All 7 memberships were created *after* it. Seed and QA writers still insert
memberships with no profile:
- `web/scripts/seedRealisticChildcareDemoData.ts:1338`
- `web/scripts/seedAccessValidationDemo.ts:565`
- `web/tests/financials/live/w7DirectMoneyMutation.live.test.ts:57`

**Unsafe now.** Switching to `deny` today would remove department and site data from 7 active admins.

**Safe sequence.** Each step is gated on the one before it.
1. **Decision needed: close the invariant.** Pick one:
   - (a) a database guarantee that every membership has a profile, such as a trigger on `user_roles`;
   - (b) route the seed and QA writers through `create_membership_with_access_profile`.

   Without one of these, any backfill is undone by the next seed run.
2. **Backfill the 7 memberships** with a *new* data-only migration: the same body as M1, setting
   all/all with `ON CONFLICT DO NOTHING`. Re-applying M1 would be skipped, because it is already in the
   ledger. The migration is filed as a governed `database.apply_migration`. Nobody's access changes:
   all/all is exactly what the fallback grants today.
3. **Verify** with the same census: zero memberships without a profile.
4. **Flip** the constant to `deny`, deployed only after step 3 passes. Its tests are in
   `web/tests/admin/resolveAdminAccessCore.absentProfileDenies.test.ts`.

---

## 2. Payerless Enrollment links (item 7) — remediation mechanism, approval required

**Current count** (`certification/enrollment/v05-payerless-links-census-2.sql`, gar_03e94e39880086).
These are links created by `enrollment_start` with no `metadata.recipient_person_id`:
- **26 for real households.** Only **3 are active**, all with in-progress sessions:
  - 2 on journeys that are enrolling;
  - 1 with no journey.
- 23 are inactive:
  - 8 completed;
  - 15 in progress, of which 6 are on journeys that are not enrolling.
- The 3 active links belong to at most 4 households. **One of those households has two primary
  contacts**, so its recipient is ambiguous.
- 342 inactive historical links name no household. They stay untouched.

The earlier figure of "19" counted links on live journeys, which is a different definition.

**Why a reissue will not work.** A journey with an open session gets its existing link back from
`launchParticipantEnrollment.ts:216-241`. So re-launching hands the same payerless link back.

**Recommended: amend one link at a time, with operator approval.** This would be a new governed action,
`enrollment.bind_link_payer`, built only once approved. For each link it would:
1. Re-check that the link is active, its session is open, and it has no recipient yet.
2. Resolve the recipient with the same `resolveEnrollmentLaunchRecipient` that launch uses, and
   re-check the household relationship.
3. Stop if there is more than one candidate, such as the two-primary-contact household. The operator
   chooses.
4. Write the payer as a compare-and-set: only when none is set. An existing payer is never reassigned.
5. Record `recipient_bound_at`, `recipient_bound_by` (the governed request id) and
   `recipient_bound_via`.
6. Keep the same link and session. Nothing is deleted, and no notice to the family is needed.

**When reissue is right instead:** only for a compromised link. Deactivate it (`is_active = false`), mint
a new link, re-anchor the session, and send the new link through the existing send path.

**Why not a migration.** Binding a payer grants payment authority, so each link needs its own approval.
Only the dry-run census and the after-census run in bulk.

---

## 2a. Payerless links — EXECUTION PLAN (requires Director approval; nothing executed)

The workflow is built (closeout PR): `GET /api/admin/enrollment/links/{linkId}/payer` previews, and
`POST` with `{ person_id, confirm: true }` binds. The authority is `web/lib/enrollment/participantLaunch/linkPayerBinding.ts`,
gated on Enrollment decision authority (`enrollment.decide`).

**What the workflow refuses:**
- a link that is not an Enrollment link;
- an inactive or expired link;
- a link whose paperwork is not open;
- a link that already has a payer;
- a household with no primary contact;
- a person who is not this household's primary contact;
- a bind without confirmation.

**How it writes:**
- The write is compare-and-set on "no payer yet", so a payer is never replaced.
- It records `recipient_bound_at`, `recipient_bound_by` and `recipient_bound_via` on the link, and an
  `enrollment_link_payer_bound` workflow event.
- It keeps the same link and session, with no notification.

**Per real link, once approved:**
1. A census reads the 3 active payerless links (ids only), their open sessions and the household
   primary-contact count.
2. For each link the operator opens the preview.
   - If there is one candidate, the operator confirms that person.
   - If there are several candidates (one household has two primary contacts), the operator names the
     right one. That needs the Director's or the family's answer first, so the link is held until then.
3. The bind runs, one governed approval per link.
4. A census afterwards checks that each link names a payer of its own household, that no other link
   changed, and that the participant payment screen now offers payment.

---

## 2b. Child-specific paperwork eligibility (bf7bb266) — finding

The real child `bf7bb266` had paperwork while still `new_inquiry`. That paperwork was a **manual packet
share** from the Forms/Processing packet builder (`/api/admin/forms/packet-links` →
`mintPacketPublicLinkForAdmin`, `launch_from_entity` on 2026-09-17). It was not an Enrollment launch:
- no `created_via=enrollment_start`;
- no stage;
- no journey link;
- no payer.

The sibling's live journey did not let it through, so it is a **historical exception**. The path is still
open, though. Restricting the generic packet share for Enrollment packets is a **Director decision**,
because the same route serves non-Enrollment packets.

**Separately, the real gap is closed in this PR.** Start Enrollment skipped its admission check whenever
the family had a live episode. Today it would have sent a `new_inquiry` or waitlisted sibling the
Enrolling paperwork. The check now runs whatever the episode state.

**Side finding (not touched):** the same real household (`0658832a`) holds 15 more children with
stageless `enrollment_start` journeys and derived-packet sessions dated 2026-08-18 to 2026-08-21. These
look like build-out test debris on a real family and need their own review.

---

## 3. Disposable QA data (item 10) — inventory and cleanup plan (PLAN ONLY — NOTHING DELETED)

**Inventory** (`certification/enrollment/v05-qa-cleanup-inventory-census.sql`, gar_7b20f1b121fecc).
QA records are tagged `ZZQA…`; the tags run from ZZQA1416 to ZZQA1496R.

| Record | Count |
|---|---|
| Households | 39 |
| Children | 63 |
| Persons | 71 |
| Opportunities | 39 |
| Process instances | 35 |
| Packet sessions (household-linked; a lower bound) | 12 |
| Links | 12 |
| Processing cases | 8 |
| QA forms (all active) | 3 |
| QA packet definitions | 1 |
| Charges (all posted) | 8 |
| Payments (Stripe test mode, posted) | 3 |

The 3 QA forms are `zzqa1492_conventional_intake_disposable`, `packet_step_document_acknowledgment_mu1tpc3u`
and `packet_step_document_upload_mu1tpout`.

**Keep as certification evidence:**

| Family | Household |
|---|---|
| ZZQA1496Q | `969ef0ab` |
| ZZQA1496R | `0f478c42` |
| ZZQA1476ZMU7 | `ee5e2309` |
| ZZQA1477A1001 | `281e4b26` |
| Family C — ZZQA1467FAMC | `350ef2ea` |
| Family C — FAMB | `9867a5a0` |
| Family C — X4F9 | `a69f9525` |
| ZZQA1499G (closeout acceptance: launch guard, Offers refresh) | `e68d61c5` |

**Order of operations.** Each step is its own governed approval, and nothing is hard-deleted.
1. Freeze the keep-list, and census-snapshot it.
2. Deactivate the QA links (`is_active = false`).
3. Close the QA packet sessions and Processing cases through their own status transitions.
4. Withdraw QA opportunities and journeys to a terminal state.
5. **Money is never deleted.** Two options:
   - void or credit the 8 charges, and refund or reverse the 3 test payments through the ledger, after
     confirming the payments are test-mode;
   - or leave them, and filter by tag.
6. Archive the 3 QA forms and the packet definition (`archiveFormDefinitionForAdmin`).
7. Soft-archive the households, children and persons last.

The existing developer cleanup tool (`web/lib/pos/processingDevCleanup.ts`) refuses production-like
databases, so it cannot be reused here.
