# D9 / D10 — owner handoffs (paste-ready; Documents does not dispatch these)

Objective `OPWORK_AA660DC9554D_SPRINT_AFD07879C606`, lane `lane_aa660dc9554d`, 2026-11-03.
- Documents owns the completion checklist (`D9-D10-COMPLETION-PLAN.md`). Each owner below delivers one bounded thing.
- None of these grants credentials, access, hosted writes, migration applies or provider activation. Each of those stays its own operator approval.

## H1 — Host Capacity: isolated two-session race fixture (D10-A2)

> Documents (lane_aa660dc9554d, OPWORK_AA660DC9554D_SPRINT_AFD07879C606) needs one QA-bound isolated fixture registered in the toolkit's `lib/certification-fixture.mjs` (`qa_bound: true`), with **no new executor**. It is reached through the existing `vac certify-fixture <name> run --lane --qa-run --persona --candidate --script-sha256 --request-id` path, on an open QA run over a leased, non-shared certenv.
>
> - **Name:** `processing_atomic_open_race`.
> - **Script:** Documents owns and pins it. Two independent Postgres connections (via `web/scripts/lib/resolvePostgresClient.mjs`, as Financials and Analytics already do) call `open_processing_case_with_primary_source` concurrently on one source: at least 20 rounds of 2 callers, and 5 rounds of 5 callers.
> - **Precondition:** the certenv is built from the staging tip (`environment.build_certification_baseline`), then migration `20261215093000` is applied with `database.apply_migration` (certenv target) from a pushed `agent/**` commit that carries it in `supabase/migrations`.
>   - Two sessions must each see a **committed** function, so this race needs an apply. It goes to the isolated certenv, never staging.
>   - The single-session half no longer needs one: `processing-open-case-atomic-preapply.sql` runs the migration inside the rollback.
>   - Documents will provide the `agent/**` commit carrying the migration on request. It is not part of the staging candidate.
>
> **Acceptance:**
> 1. Every round ends with exactly one case and one primary source per source. All callers get the same case id. No `processing_cases` row is left without a source.
> 2. It prints `tests passed=<n> failed=0`, and the receipt is secret-blind.
> 3. Cleanup prints `reset namespace=… removed=<n>`.
>
> **Not acceptable substitutes:**
> - the shared `alloy-cert` stack (also measured 47 committed migrations behind on 2026-11-03);
> - the host-environment fixture path;
> - `database.run_rollback_invariant_test`, which is single-session, rolls back, and refuses dblink and session locks;
> - the in-memory unit test.
>
> Reply with the registered fixture name, toolkit release and install.

## H2 — Host Capacity (QA plan registry), with Developer Platform: hosted D9 API credential path (D9-H1 / D9-H2)

> Only step 1 of the supported credential sequence is governed: `platform.register_developer_application`. The remaining steps have no governed or QA-plan path:
> - installation: `POST /api/admin/integrations/installations` with `grantedScopes`, `boundaryMode` and `locationIds`;
> - credential: `POST /api/admin/integrations/installations/{id}/credentials`, where the secret is shown once;
> - scope change: `PATCH`.
>
> Each needs an admin session holding `integrations.manage`. Scopes attach **per installation**, and there is **one installation per application per org** (`uq_app_installations_app_org`). So `documents.read` and a future `documents.write` must be separate applications.
>
> Documents needs a registered hosted QA plan (proposed `documents_d9_read_v1`, or a re-approved `authz_q1` revision) on `alloy_staging_web`. It must provide:
> 1. **Admin sessions:** `fixture_admin` (`qa_shared`) and `cross_org_admin` (`qa_secondary`), each holding `integrations.manage`.
> 2. **Installations** of two applications (`d9-documents-read-cert`, `d9-documents-scope-cert`):
>    - `T_A`: org-wide in `qa_shared`, `documents.read`;
>    - `T_B`: org-wide in `qa_secondary`, `documents.read`;
>    - `T_L`: `locations` = `qa_north`, `documents.read`;
>    - `T_N`: `children.read` only, for the 403 case.
> 3. **Credentials:** one per installation, captured inside the harness and never printed.
> 4. **Fixtures:** pinned reconciliations `qa_d9_external_fixture_ensure` / `qa_d9_external_fixture_reset`. Documents authors their SQL.
> 5. **Close:** revoke the credentials, disconnect the installations, then run the residue census extended by the five D9 checks.
>
> The plan and fixture matrix are in `certification/documents-v1/D9-1-HOSTED-QA-PLAN.md`. **Do not** reuse the Gate 2 `alloy-cert-sandbox` installation (`5bdc7c1e-…`). Reply with the plan id and its release.
>
> **Extension for D9.2 / D9.3** (`certification/documents-v1/D9-2-3-HOSTED-QA-PLAN.md` §2):
> - Three more applications: `d9-documents-write-cert`, `d9-documents-review-cert` and `d9-documents-write-scope-cert`.
> - Four more installations, **each with exactly one documents scope**:
>   - `T_W`: `qa_shared`, org-wide, `documents.write`;
>   - `T_WB`: `qa_secondary`, `documents.write`;
>   - `T_WL`: `qa_shared`, `locations` = `qa_north`, `documents.write`;
>   - `T_R`: `qa_shared`, `documents.review`.
> - Two more pinned reconciliations: `qa_d9_aged_upload_ensure` / `qa_d9_aged_upload_reset` (Documents authors the SQL).
> - Five more residue checks (`d9w_zr_*`).
>
> One plan revision can carry D9.1 and D9.2 / D9.3. The write installations are created only after `documents.write` and `documents.review` are deployed.

## H3 — Communications (WS11 owner), with DB: attachment link, access rules, fetcher wiring (D10-S1 / D10-F1)

> **Already done on the Documents side** (local, synthetic proof), in `web/lib/documents/inbound/ws11AttachmentStorage.ts`:
> - inbound attachment bytes are stored as `documents` rows through the existing upload sequence;
> - each attachment gets a **stable document id** per (org, message, provider attachment), so storage is idempotent without a new table;
> - the Resend attachment adapter exists (`web/lib/documents/inbound/resendAttachmentContentFetcher.ts`, 39/39 on a fake transport) and is **not wired**.
>
> **Communications deliverables:**
> 1. **`communication_message_attachments`** as an owned migration, starting from `certification/documents-v1/D10-WS11-ATTACHMENT-STORAGE-DRAFT.sql`.
>    - Accept or reject the `provider_attachment_id` column.
>    - Delivered on a branch, not applied. Its apply is a separate approval.
> 2. **Access rules:** RLS for the table, plus confirmation that the `org_documents` bucket policy and the D2 insert trigger (explicit `current_version_id`) admit the service-role system writer. Real-DB proof belongs on the isolated certenv.
> 3. **Fetcher wiring (implementation only):**
>    - wire `resolveInboundRetrievalCredential` (org's own binding credential) into `makeResendAttachmentContentFetcher`;
>    - pass the fetcher to `makeInboundAttachmentFilingDeps` **behind a disabled flag**.
>    - The production default stays "no fetcher", so D10 keeps holding.
> 4. **Activation is NOT part of this handoff.** Enabling real Resend attachment requests is a separate operator decision (DEC-8). It comes after hosted proof of storage, scanning (D1c-2) and the atomic open (migration `20261215093000` applied).
>
> Reply with the branch and commit. Documents then runs the composed pipeline suite against it.

## H4 — Documents security (D1c-2): review the verdict store and scanner integration (D10-M1 / D10-M2)

> Authored by Documents, not applied and not enabled:
> - `certification/documents-v1/pending-migrations/20261219090000_documents_malware_verdicts.sql` (revised 2026-11-04 for the review; was `20261216090000`)
> - `certification/invariants/documents-malware-verdicts.sql` (9 rollback cases, not run)
> - `web/lib/documents/malware/malwareVerdictStore.ts`, `malwareScan.ts`, `clamdEngine.ts`
>
> **Please review against `D10-MALWARE-VERDICT-STORE-DESIGN.md`:**
> - I1–I6;
> - verdicts recorded only by `malware_scan_worker`, which is a proposed audit identity and grants nothing;
> - revocations by a user only;
> - unsafe dominates;
> - re-hash before scan.
>
> **Recommendation:** deployment option C1, a ClamAV daemon (open source, no vendor account, no DPA) on an operator-owned private host. Alloy orchestrates the scan from its existing scheduled-work wake and records verdicts in-process, so the scanner holds **no Alloy credential**.
>
> **What is unknown:** the host provider, its cost and the private-network arrangement. No container host exists today (Vercel serverless only).
>
> Reply with review findings and the engine and host decision for the operator.

## H6 — Operator (Needs You): isolated certification database and the three rollback proofs

Not a lane handoff. These are governed cards Documents files, and each needs an operator approval. Payloads are under
`.vacilando-payloads/d9d10-*.json` in the lane worktree.

> 1. `repository.push`: `agent/documents` at the certified candidate. A rollback source must be published on a
>    sanctioned certification ref. Not a PR or a merge.
> 2. `environment.build_certification_baseline`: `ksquared-16/alloy` `staging` at `7e9b242c`, 24 h lease to
>    `lane_aa660dc9554d`. This is the isolated database. Shared `alloy-cert` is not used.
> 3. Three `database.run_rollback_invariant_test` cards on that certenv:
>    - `documents-d9-application-filing.sql`;
>    - `documents-d9-3-archive-preapply.sql`;
>    - `processing-open-case-atomic-preapply.sql`.
>    Each runs in a discarded transaction, so nothing is applied.
>
> The rollback proofs do not need H1. The race does.

## H5 — Enrollment / BP configuration owner: paperwork accountability (prep §3)

> The design only is in `D9-D10-ACCEPTANCE-PREPARATION.md` §3. Four open questions:
> 1. Who owns each requirement type per org.
> 2. Reminder cadence and escalation targets.
> 3. Whether guardian-facing reminders (external sends) are in scope.
> 4. The immunization enforcement question.
>
> Documents recommends tracking this as its own objective (DEC-9). It stays listed as an open, owned item on the D9/D10 checklist and is not silently dropped.

## Notice — Walden / Host Capacity: `alloy-stack` stop path cannot find its ownership guard (corrected 2026-11-03)

> - **Installed:** `20261103-9400e46dbb25` (source `ksquared-16/vacilando@9400e46dbb25`, installed 2026-11-03T02:43:42Z). The previous `1f3589dd4f5e` has the same defect.
> - **Defect:** `bin/alloy-stack:189` resolves `${BASH_SOURCE[0]%/*}/lib/cert-ownership.sh`, which is `<toolkit>/bin/lib/cert-ownership.sh`. The file ships at `<toolkit>/lib/cert-ownership.sh`. Every stop path (release-as-last-holder, reap, doctor rebuild) therefore refuses.
> - **What happened:** `alloy-stack release` (holder `documents-ecv2_claude_ee78ec31`) deleted its lease record, then refused to stop the stack.
> - **Correction:** an earlier note said this lease was "still held". It is not. `~/.local/state/alloy/stack/leases/` is empty, and `alloy-cert` (10 containers) is up with **no lease**.
