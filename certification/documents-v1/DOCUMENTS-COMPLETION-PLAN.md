# Documents V1 — itemized completion plan (D1–D10)

Lane `lane_aa660dc9554d`. Maintained by Documents. Started 2026-11-04 against staging `98fdf5c9b217` (PR #1633; ledger
head `20261219090000`, 554 migrations, census `gar_c36ad46bf0a7bf`). **Updated 2026-11-06: R2/R5 hosted proven on `qar_b74d93c3d853`.** **Updated 2026-11-05: staging `bce11ed7c1c0` (PR #1634,
D10 activation gates), ledger head `20261220090000`, 555 migrations (census `gar_4f6b6842b0990b`).** Sprint `OPWORK_AA660DC9554D_SPRINT_E514C44C24C0`
(successor to `…73A9D7625863`, which is VERIFIED and awaiting the Director's Accept/Close).

**Engineering proof is not acceptance.** "Proven" below means a receipt (QA run `qar_*`, governed request `gar_*`, or an
exact-commit test record) against the named deployment. Kelly's acceptance is a separate decision taken on the staging
review plan at the end of this file. Hosted proofs of D1–D8 predate the D9/D10 deployments (#1630–#1633 changed
`documentFiling.ts`, `documentAvailability.ts`, the library and Forms write routes), so they stand as history and are
re-checked by one final hosted regression on the final staging SHA — not rebuilt item by item.

## 1. Items

| Item | Deployed on staging | Proven (receipt, against) | Missing | Owner | Next action |
|---|---|---|---|---|---|
| Q1 / D1a access | yes | Q1 90/90 `qar_99a8d9bf95e6` (`8bb731ea`); re-run on `qar_4246ac22ece0`, `qar_8fb0e1ffabcf` | `D1A-CERTIFICATION.md` header still says PARTIAL (stale) | Documents | Correct the header; final regression |
| D1b / D1c-1 hardening, screening | yes | 37/37 `qar_efe9bd0d1d9c` (`ead89222`), ZERO_RESIDUE | — | Documents | Final regression |
| D2 / D3 | yes | 40/40 each `qar_32891f09f872` (`7e7019c4`), `qar_ad7ca37df52f` | — | Documents | Final regression |
| D4 / D4.7 library | yes (#1597, #1599) | 41/41; D4.7 `qar_da541c487abf`, ZERO_RESIDUE | — | Documents | Final regression |
| D5 filing | yes | 59/59 `qar_c6e20cc02979`; also `qar_4246ac22ece0` | — | Documents | Final regression |
| D6 requirements | yes | 75/75 `qar_4246ac22ece0`; census `gar_53d6744eb1cf1a` | BP stage readiness not hosted (BP lane); context doc calls residue "open debt" though closed | Documents; BP lane | Correct the context doc; final regression |
| D7 / D8 review, forms evidence | yes (#1611, #1612) | R1 158/158, D8 59/59, browser 19/19 `qar_8fb0e1ffabcf` (`7d7c8037`); D7 invariant `gar_3c51d48448eba3`; **R2/R5 hosted 65/65, D7 116/116, D8 59/59, D7/D8 browser 17/17 `qar_b74d93c3d853` (`bce11ed7`), ZERO_RESIDUE** | D6 browser walk precondition unscripted (2/6) | Documents | Script the D6 walk setup |
| D9.1 read API | yes (#1627) | local only | **D9-H1 never run**: no developer application registered, no D9 QA plan | Host Capacity (H2 plan `documents_d9_read_v1`); Kelly (DEC-1, DEC-2) | Register plan and app; hosted QA run |
| D9.2 writes + 24 h handoff | yes (#1630) | certenv `gar_46d2274f98232f`; atomic-open `gar_6bf71cba9a81ce` | **D9-H2** hosted W-* cases | Host Capacity, then Documents | After D9-H1 |
| D9.3 archive / restore | yes; `20261217090000` applied | `gar_b55de8a1627166` | Hosted W-RV / W-AR; Q2 restore guard (this sprint) | Documents | Q2 below; hosted with D9-H2 |
| D10-Q1 filing queue / S2 | yes (#1627) | synthetic | — | Documents | Final regression |
| D10-A1/A2/A3 atomic open | yes, applied | `gar_6bf71cba9a81ce`; race `ifx_3672b4b0fb183df0` 25/0 | Hosted proof | Documents | With D10-H1 |
| D10-S1 WS11 storage | yes (#1632), applied | `gar_fbb1fdb3499e5f` 6/6; `gar_6f9472d3f5af95` | W1, W2, W3 (this sprint); hosted | Communications + Documents | §3 |
| D10-M1 verdict store | yes (#1633), applied | `gar_ef4740bcc76a23` 16/0; A&I re-review 2 `c67a9fe74fec` | O2 and Q1/case-13/banner follow-ups | Documents security, A&I | §3 |
| D10-M2 scanner engine | code only, unwired | unit only | Engine and host (DEC-6); N5 host clock; N8; N7 | Kelly (DEC-6), Documents | §3 |
| D10-F1 Resend fetcher | wired, flag OFF | 39/39 fake transport | Activation (DEC-8) after M2 | Communications, Kelly | After scanner gates |
| D10-V1 / D10-H1 integrated + hosted provider flow | — | — | Everything; needs DEC-6 and DEC-8 | Documents + Communications | After activation approvals |

## 2. Older obligations reconciled against receipts

| Obligation | State in receipts | Action |
|---|---|---|
| `…E460BCD09185` R4 hosted | **Done**: R4 35/35 `qar_bc811ffc7da1`; D7 invariant `gar_3c51d48448eba3`; residue reset `gar_14477ac6a0bcd8`; census 20/20 `gar_bcf58ca61c3f22` bound by `gar_6c56f9fdac73a5`. Conditions never marked | Record the evidence and close (Director); regression covers later Forms changes |
| `…A1EE0FDEF21C` Revision 4 R2/R4/R5 hosted | **Proven 2026-11-06**: R2/R5 65/65 on `qar_b74d93c3d853` (staging `bce11ed7`; open `gar_0a6cebb096f26c`; receipt `hosted_r2r5_regression.qar_b74d93c3d853.json`); R4 35/35 `qar_446cbc230b86`. Closed ZERO_RESIDUE (census `gar_80c1d40f2f1658` 20/20, R5 census `gar_749deee090760c` 6/6, bind `gar_24c310d8901470`) | Record the evidence and close (Director) |
| `…12706A6E51FA` fixture repair | c1–c3 satisfied; repair shipped #1625 (`530ba383`). **R5 invariant PASSED 5/5 `gar_344131761fa15c`** (isolated certenv at staging `98fdf5c9`; receipt `r5-shared-child-rollback-receipt.gar_344131761fa15c.json`). Re-pin **verified**: toolkit `9b96a0e02283` pins `5942fb82` at `bce11ed7`; first hosted ensure `gar_fc15d0c02f072d` seeded | Close (Director) |
| `…6A4F60B1555E` preparation | Deliverables exist; superseded by `…AFD07879C606` | Close as superseded |
| D9-H1 / D9-H2 | Never run (not stale; undone). The race fixture H1 is done (`ifx_3672b4b0fb183df0`); the D9 QA plan / credential path (Host Capacity H2) is open and blocks both | Host Capacity registers the plan; Kelly DEC-1/DEC-2 |

## 3. Scanner and inbound-attachment gates (this sprint)

Migration `supabase/migrations/20261220090000_documents_d10_activation_gates.sql` (sha256 `1196606e…`, hash-locked by
`preapplyInvariantParity.test.ts`), invariant `certification/invariants/documents-d10-activation-gates.sql` (11 cases).
**Proven:** `gar_550ba1d16c11d8` PASSED 11/0, rolled back, on `certenv-e88b6e0070` (staging `98fdf5c9`, 554), pinned to
`ac423e463` (receipt `d10-gates-rollback-receipt.gar_550ba1d16c11d8.json`); the first card `gar_9825da434a1cf6` was refused
by the static analyzer (ALTER FUNCTION, DO UPDATE, TRUNCATE privilege list) and fixed without behaviour change. Moved
byte-identically into `supabase/migrations` at `0aecec1ce`. **Merged in PR #1634 (`bce11ed7c1c0`, `gar_dd4ed126659626`) and applied to staging** (census `gar_4f6b6842b0990b`: head `20261220090000`, 555).

| Gate | Change | Kind | State |
|---|---|---|---|
| Q2 release honours verdicts (incl. D9.3 restore) | DB trigger refuses quarantined/archived → available while any version is unsafe; routes pre-check and map 409 | migration + TS | Done: SQL cases 2–5; routes `2563350d0` (409 MALWARE_UNSAFE / MALWARE_SCAN_PENDING, 503 fail-closed) |
| W2 no availability before a verdict | Inbound stored `quarantined` with `screening.malware_hold='awaiting_verdict'`; structural result kept in metadata; trigger needs a clean verdict on the current version | migration + TS | Done: SQL cases 6–7; TS `454f6e411`, `86432a8f1`; **Communications agreed** |
| N8 bounded rescans, terminal failure | Per-version attempt counter with doubling backoff (`note_document_malware_scan_attempt`); `object_missing` detail; terminal `failed` at the cap | migration + TS | Done: SQL case 8; TS `2563350d0` (maxAttempts 6, base 300 s, max 6 h) |
| N7 re-evaluation after a verdict | Scheduled-work handler re-runs the filing decision for scan-held inbound documents; inert while the scanner is off; no schedule row until activation | TS | Done `62ac95cf6`: handler body, unregistered and unscheduled; flag `DOCUMENTS_MALWARE_SCANNER_ENABLED` off |
| N5 host time | Engine requires `signatureClock: "UTC"` acknowledgement; DEC-6 runs clamd with `TZ=UTC` | TS + operator config | TS done `2563350d0`; host config is DEC-6 |
| W1 linked-document delete | Read links before audit; audit names them; delete links after audit, before the row; storage after commit; include `email_attachment` case sources; deletion marker stops ws11 re-creating a deleted attachment | TS | Done `454f6e411`, `c8f59030e`, `86432a8f1`; **Communications agreed**; residual: a delete landing between store's marker check and its INSERT (DB guard at DEC-8) |
| W3 (Communications) | WS11 trigger function: `search_path = public, pg_temp`; EXECUTE revoked from PUBLIC, anon, authenticated; case 11 proves the trigger still enforces | migration | Done; **Communications agreed** |
| Q1 follow-up | Verdict writer's quarantine predicate lower-cased; case 1 incl. `Archived` and `restricted` (the case-13 follow-up) | migration | Done |
| Banner follow-up | Garbled sentence in the applied migration's pre-apply banner | comment | Done `8c3aca28a` |
| O2 writer identity | Design: NOLOGIN `malware_scan_writer`, login member held by the scanner host, `pg_has_role(session_user, …)` assertion, direct Postgres connection; open design gaps: audit write without the service key, bytes without the service key, separate scanner runtime | design → migration later | Needs A&I review, then **role approval and persistent-access approval** (Kelly) before any role or credential exists |

Scanner, retrieval and provider traffic stay OFF until DEC-6 (engine/host), O2 approvals and DEC-8 (retrieval) are
granted. No role, credential or migration apply is created by this work without its own approval.

## 4. Known failing tests on staging (not caused by this work; full validation is not clean while they remain)

| Test | Owner | Cause |
|---|---|---|
| `historicalDraftCascadePreflight` | Financials | Pins `SCHEMA.head === "20261214090000"`; first broken by Documents `c0e8db847` (PR #1631) adding a later migration. Test-only fix proposed (same pattern as the WS11 test in #1633); needs Financials' agreement |
| `opportunityHeaderActionExposure` | CRM / Opportunity drawer | `0cf7c4a52` (2026-06-10) replaced `OpportunityDrawerHeaderActionsMenu` with `RecordDrawerManageMenu`; the test still expects the old name |
| `grantSeedEnumeration` (RL-8) | Access & Identity | Red before `530ba383`; expected 66 grants, got 61; cause not yet isolated |
| `childcareFieldCatalogDoctrine` | Fields / Configuration | Red before `530ba383`; 28 legacy fields visible; last input change `75702c0e7` (Staff) |
| `orgParameterizedRpcBoundary` (+ 12 more `tests/access` files, 21 tests) | Access & Identity (flags Medical #1560 `20261204090000`) | Identical on clean staging `98fdf5c9` |
| 13 `tests/communications` files (18 tests) | Communications | Identical on clean staging `98fdf5c9`; Communications routing to Kelly |

## 5. Scope decisions (not in the MVP unless Kelly decides)

- **DEC-10 upload size 10 MB** (`D9-UPLOAD-LIMIT-10MB-PATH.md`): today 4 MiB everywhere. Proposal only.
- **DEC-9 paperwork accountability** (`D9-D10-ACCEPTANCE-PREPARATION.md` §3): proposed as its own objective. Proposal only.

## 6. Final hosted residue check

Every closed Documents hosted run is bound ZERO_RESIDUE (`qar_8fb0e1ffabcf`, `qar_bc811ffc7da1`, `qar_b1cc8a9bbe81`, and
earlier). Final regression `qar_446cbc230b86` (bind `gar_fd4a1f452cf5d4`) and R2/R5 run `qar_b74d93c3d853` (bind `gar_24c310d8901470`,
R5 fixture census attached) are both ZERO_RESIDUE. Owed: D9-H1/H2 censuses, including the `d9w_zr_*` checks, once that plan is registered.

## 7. Remaining for the staging review

- **Q2 unsafe release / restore, archived restore**: unreachable on hosted until the scanner writer (O2 role + persistent-access
  approvals) or D9 credentials exist; or a registered verdict fixture (Host Capacity + approval). Proven by SQL cases 2–5 and route tests only.
- **D9**: Kelly decides the permanent QA Secondary site (QA Secondary has 0 locations, `gar_2b45ec486871f9`); then pin its id in the
  ensure → final hashes (ensure `6d03b12e…` changes; reset `87909bad…`, census `e7e8d3d1…` expected unchanged; invariant `f74ff3a8…`
  may change) → isolated rollback proof → Host Capacity registers plan and app (DEC-1/DEC-2) → D9-H1/H2 hosted.
- **D4 orphaned guardian** (CRM lead deletion, not Documents): reproduced on `bce11ed7` (`d4_hosted_orphan_sweep_results.qar_b74d93c3d853.json`).
- **Browser walks**: D7/D8 17/17 on `bce11ed7`; D6 walk needs its setup scripted; Focus Panel child Documents card is a Human-QA decision (D7.4).
