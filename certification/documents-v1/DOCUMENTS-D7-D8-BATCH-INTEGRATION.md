# Documents V1 — D7/D8 batch: base integration, product gaps B1–B6, local integration certification

**Status: `DOCUMENTS_V1_D7_D8_LOCAL_BATCH_READY_FOR_DIRECTOR_REVIEW`.** This is local certification only. Nothing has been pushed, merged or deployed, and nothing is hosted-certified. Migrations `20261213090000` (D7) and `20261214090000` (D8) have not been applied to any shared environment. D9 and D10 have not started. D6 stays **73/74** until the review-history repair is proven on deployed code.

Sprint: `OPWORK_AA660DC9554D_SPRINT_6389E3AA927A`. Run: `erun2_a7a8894b78124e3c`, attributed to that sprint.

## B0 — Base integration

- Merge `ec79d9257` brings staging `317eafa5` into `agent/documents`. Its parents are `70fc82656` (lane) and `317eafa5b` (staging). The merge is `--no-ff`, with no rebase and no rewritten lane commits.
- The governed `repository.integrate_base` executor merges only when there is no conflict. On a conflict it returns `integration_conflicts`: "the lane resolves them" (`lib/trusted-host-base-integration.mjs`). The lane therefore made the merge and resolved the conflict, as the Director authorized.
- **Conflict:** `docs/platform/modules/documents-and-forms.md`. Both sides had appended sections after the D6 section. Resolution kept:
  - the D0–D6 doctrine;
  - the D7 and D8 sections;
  - PR #1609's "Forms Studio — layers" section, Integration points and Related lists, verbatim.
  Two D7/D8 integration bullets were added. `git diff 317eafa5 HEAD` on that file shows additions only.
- Historical evidence is untouched: no file under `certification/` changed in the merge. The D6 ZERO_RESIDUE attachment (`d6_zero_residue_supplemental_attach.qar_af1c638fd52a.json`, `gar_a6359b4f860c8b`) is preserved.

## B1–B6 — Product gaps

| Gap | Commit | Resolution |
|---|---|---|
| B1 Child Documents navigation | `8f2a4b774` | **Cause:** a durable child is composed of `[children]` only, so `card=documents` targeted a card that was never composed (the D6 hosted walk). **Fix:** the durable record surface now mounts the library for its own subject, narrowed to the child or person, when opened for documents. No layout, registry or published-surface change. |
| B2 Event-relative validity | `3817d4b54` | **Birthday:** expires the day before the first birthday after the anchor (`customer_members.dob` / `persons.date_of_birth`). **Enrollment start:** a document covers one enrollment and expires the day before the next start (`child_enrollment_agreements`, service statuses; voided and canceled excluded). **Program year:** no source, so *date missing* with `event_source_unavailable`. Every unresolvable case carries its reason. |
| B3 Attention truncation | `16c5a5952` | **Was:** a 1,000-document cap that also counted invisible documents. **Now:** keyset pages over all tracked documents, a bounded 20,000 window per request, pages of at most 500 rows, a cursor and `documents_complete`. Processing offers "Show more". |
| B4 EN-FI-01 | `d34f21b80` | See EN-FI-01 below. |
| B5 EN-FI-09 | `b94e84454` | All four health types verified through the existing D6 evaluator and Business Process authority. No product change was needed. |
| B6 EN-FI-10 | `1a2b274e4` | Five evidence layers kept separate. `health_fact.verify_immunization` (`health.manage`) is the only writer of `confirmed_at`. |

Supporting commits:
- `1cdb3918d`: live suites updated for the Health card's new `documentActor` argument.
- `70e8cea12`: module and security-model documentation.

## EN-FI-01 — Medical document security census

**Census scope.** Every Documents admin read, preview, download, metadata and generated-document path. The full table is in `docs/platform/governance/document-security-model.md` §7f.

**Already correct.** The Documents routes apply admission, scope and clearance together:
- list, signed URL, source preview, history, versions, subjects, validity and review;
- library, readiness, work and waivers;
- screening, POS list, extracted text and the filing queue;
- the drawer entity route.

**Confirmed exposure, deployed.** These files are byte-identical on staging `317eafa5`. Titles, original file names and types of medical documents (e.g. `Immunization_Record_<child>.pdf`) reached staff who lack `health.view` or Documents admission:

| Surface | Gate on staging | Exposure |
|---|---|---|
| Processing queue and case | admin session only | medical document labels |
| `GET forms/submissions/[id]` | admin session only | `linked_documents` labels |
| Packet review rollup and insight; opportunity enrollment packets | admin\|ops only | generated-PDF titles |
| `PATCH documents/[id]` | no sensitivity clearance | returns the full medical row to a writer without `health.view` |
| POS rename and delete | `processing.documents.manage` alone | can rename and read back, or delete, a medical document |
| Health card | `health.view` only | lists every child document, including quarantined ones |

- **Severity: medium.** This is in-organization disclosure of medical *metadata* to authenticated staff. No file content, no signed URL and no other organization is involved. The POS delete is a medical-record integrity risk, limited to holders of a privileged Processing capability.
- **Exercised hosted?** No. The exposure is established from the deployed source, not from a hosted probe.
- **Recommendation:** an **isolated security release** of `d34f21b80`, which is self-contained and has no migration, rather than holding it for the combined D7/D8 batch.
- **Fix:** one helper, `disclosableDocumentIds`, requiring admission, scope and clearance, and failing closed.
- **Proof:** 20 tests covering a Documents operator, a Medical-authorized actor, `health.view` without Documents admission, an out-of-scope actor, a cross-organization actor and an anonymous caller.
  - Mutation, sensitivity gate removed: 5 tests fail.
  - Mutation, admission gate removed: 2 tests fail.

**Suspected, not confirmed or changed:**
- The related-records route lists documents with sensitivity applied but no document subject-scope filter.
- `generate-document` accepts a caller-supplied `generated_from_document_id` without an organization check on the idempotency lookup.
- The env-gated p076 prototype exposes per-child document counts.

## EN-FI-09 and EN-FI-10

**EN-FI-09.** The test reads `physical`, `health_care_plan`, `medication_authorization` and `immunization_record` from the D3 seed. For each type it shows:
- it is a reviewed, medical, child-only type with tracked validity;
- requirement authoring accepts a child requirement and refuses a household one;
- a Business Process stage can name it;
- the single D6 evaluator moves through missing → pending review → satisfied → expired under the seeded validity;
- a requirement on it carries the medical class.

The SQL and both TypeScript medical vocabularies agree. The stale `child-health-information-architecture.md` gap D1 is closed. There is no second requirement engine.

**EN-FI-10.** The five layers are read by `classifyImmunizationEvidence`, a pure function now surfaced on the Health card:

| Layer | Source |
|---|---|
| Reported | active immunization fact |
| Uploaded | `immunization_record` document |
| Reviewed | D7 review decision |
| Accepted / rejected evidence | the Documents review outcome |
| Verified | `confirmed_at`, set only by the verify action |

- An accepted certificate beside a reported fact is `certificate_accepted_unverified`, never verified.
- Verification requires `health.manage` and a stated basis. A cited certificate must be the child's own immunization record, with its current version **accepted**.
- Verification does not change what the fact says. On the real database the immutability trigger accepted the stamp and still refused a payload change (rolled back).
- Source guards: there is exactly one writer of `confirmed_at`, and Documents review and Forms capture never touch `person_health_facts`.
- Oregon nonmedical exemption remains deferred.

## Local integration certification (code-final `70e8cea12`; this record follows it)

| Gate | Result |
|---|---|
| Change class | `build_sensitive`: a new route plus the D7/D8 migrations (`vac validation-classify`). |
| Batch suites | B1 4, EN-FI-01 20, B2 21, B3 5, EN-FI-09 21, EN-FI-10 20. Each repair was mutation-checked. |
| Documents suite | 536/536 (30 files). |
| Regression sweep | 16 areas: documents, health, enrollment, forms, Business Processes, POS, Work Items, Focus Panel, operator, presentation, adminV2, lifecycle, records, API, surfaces, runtime. 15,197 tests: 14,437 pass and 633 fail. **0 new reds:** the 641 failing entries (633 tests plus file-level errors) are identical, name for name, on the base `ec79d9257`, run on the same 286 files with the same runner. |
| Test harness | `InMemorySupabase` gained `gt`/`gte`/`lt`/`lte` and a real `order()`. All 13 suites that use it are green (359 tests). |
| Typecheck | `vac run typecheck` passed; `vac run typecheck:tests` passed. |
| Prebuild guards | All passed: module imports, service-client principal, unauthenticated side effects, route capabilities, runtime-mode audience, governed documents. |
| Production build | `vac run build` on `70e8cea12`: rc=0, peak 8.39 GB. |
| Postgres invariants | `run-d7-d8-local.sh` on the shared alloy-cert stack (leased, rolled back): D2 → D8 applied with D7 and D8 each twice; **D7 10/10, D8 7/7**. Nothing persisted. |
| Real-database checks | B6 verification stamp accepted by the immutability trigger; payload change refused. B2 source columns present. Rolled back. |
| Migration compatibility | Staging's ledger head is `20261212090000` (unchanged at `317eafa5`). D7 and D8 sort after it, and no `origin/*` branch carries a later migration. Neither migration has been applied to shared staging. |
| Local browser | **Not run.** A signed-in local session needs an operator-approved browser-auth restore. B1 is proven by rendering the real `DurableRecordSurface` from the operator's `card=documents` focus. The hosted Human-QA walkthrough in `DOCUMENTS-D7-D8-BATCH.md` gains step B1 (open a child's requirement row, then the record's Documents). |

## Unresolved

1. **Hosted:** none of D7, D8 or this batch has been exercised on staging. D6 stays 73/74.
2. **Work Items** carries the first, most urgent page of document attention (200 rows). The rest is reachable through Processing → Work → Documents. Requirement work keeps its own `truncated` flag (`REQUIREMENT_POPULATION_LIMIT`), which this batch did not change.
3. **Program-year renewal** has no authoritative source. It needs a Director or Configuration decision on what a program year is.
4. **EN-FI-01 suspected items** are listed above. The Processing routes are still `pending` in the route-capability backlog, which tracks capability declarations; the document-label gate is now enforced either way.
5. **Pre-existing reds:** 633 tests in the swept areas, all present on the base.

## Director recommendation

1. **Isolated security release of EN-FI-01** (`d34f21b80`), ahead of the batch, because the exposure is deployed today.
2. Then the combined D7/D8 batch: Director release of this checkpoint, one protected PR, CI, merge, then the governed migration applies (`20261213090000`, then `20261214090000`).
3. Then hosted certification:
   - the D6 driver rerun (review-history check, with D7 semantics since `aea79724c`);
   - D7/D8 hosted;
   - EN-FI-01 hosted probes per persona;
   - ZERO_RESIDUE through the registered 15-check census.
