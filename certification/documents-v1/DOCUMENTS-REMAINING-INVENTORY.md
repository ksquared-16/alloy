# Documents V1: what is still required (inventory, 2026-11-09)

Snapshot against staging `5db26b46` (PR #1637), migration ledger head `20261221100000` (556). It extends
`DOCUMENTS-COMPLETION-PLAN.md` (last updated at `841035a3f`), which stays the plan of record. "Proven" means a receipt.

## Closed since the plan's last update

| Item | Evidence |
|---|---|
| Reinstall after disconnect (blocked every second D9 run) | PR #1637 merged `5db26b46` (`gar_cd2f139aca676a`); migration `20261221100000` on the deployed primary (census `gar_7d515998fe2afe`); rollback restores the full indexes only until the first reinstall, and that happened in `qar_143a8fbcad49`, so code-only rollback from here |
| D9-H1 case 10 (download link ×2) and the full read matrix | `qar_242c9c123886` on driver `21bfb673` (approval `gar_7469e66d7d36bd`, toolkit `6c9eb3564fe7`): **43 passed / 0 failed**; case 10 enforced lifetime 600 s ×2, declared vs server `Date` 600.60 / 600.42 s; case 11 `CASE_11_PASS`; ZERO_RESIDUE (`gar_65ca85e4aebbd8`). Record `d9-hosted/D9-H1-HOSTED-RUN-RECORD.qar_242c9c123886.md` |
| D9-H1 hosted read proof (rerun 2, kept as recorded) | `qar_143a8fbcad49`: 41 passed / 2 failed; cases 6, 11, 12, 14 pass; ZERO_RESIDUE (`gar_b0efd299bb98ba`). Earlier records `qar_7d7ec3d86bdd` (35/5) and `qar_31100f9d04e5` (blocked) unchanged |

## Still required

| # | Item | State / evidence | Missing | Owner | Blocks on |
|---|---|---|---|---|---|
| 2 | **D9-H2 write proof**: D9.2 W-* (writes, 24 h handoff), D9.3 W-RV / W-AR (archive, restore) | D9.2/D9.3 deployed (#1630); **P4 and P5 hold on the deployed primary** (census `gar_d394ba319fd7ab`: archive and atomic-open functions and ledger rows present), so W-AR and W-ES run live. `d9-documents-write-cert` registered (`gar_4b09e820576d7a`, `abb37073…`); `d9-documents-review-cert` registered on refile (`gar_c63c05a46dcced`, run `erun2_c623dd5580480299`, `12c6e113…`). See `d9-hosted/D9-H2-GROUNDWORK.md` | Write-scope-cert registration **did not run** (`gar_d25b3589552809` replayed the write-cert execution; so did `gar_22a599230c3281`, since refiled); refile it from its own run. Then the write driver, run order, `qa_d9_aged_upload_*` SQL (Documents) → Host Capacity plan → plan-bytes approval → DEC-2 | Kelly (1 registration card, in a new run), Documents, Host Capacity | Documents work (unblocked) and the 2 registrations |
| 3 | **Q2 on hosted**: unsafe release / restore, archived restore refused | SQL cases 2–5 and route tests (409 `MALWARE_UNSAFE` / `MALWARE_SCAN_PENDING`, 503 fail-closed) | Unreachable on hosted without a verdict writer: the O2 scanner-writer role, or a registered verdict fixture | Kelly (accept as SQL/route-proven, or approve a verdict fixture via Host Capacity) | **Kelly** |
| 4 | **Final hosted regression** of D1–D8 on the final staging SHA | Last full regression `qar_446cbc230b86` and R2/R5 `qar_b74d93c3d853` predate #1630–#1637 | One `authz_q1` run on the final SHA (DEC-2 card) | Documents | Run once the SHA is final (after item 2) |
| 5 | **Browser walks** | D7/D8 17/17 on `bce11ed7`. D6 walk 2/6 on `bce11ed7` (5/8 on `1492a2dd`); those records stand. **Setup scripted `27f33de81`**: `d6_hosted_requirements_cert.py walk-seed` publishes a run-keyed required "enrollment form (browser)" v3 (Kid One satisfied, Kid Two missing); order ensure → certify → walk-seed → walk → reset; checked against a fake HTTP layer only | Run it inside item 4's `authz_q1` run. W5 (Focus Panel card) is expected to fail regardless (D7.4, item 6). The walk overwrites the root `d6-human-qa/*.png` screenshots by name | Documents | Item 4's run (Kelly's DEC-2 card, on the final SHA) |
| 6 | **D7.4 Focus Panel child Documents card** | Recorded as a finding (`D6-DOCUMENT-REQUIREMENTS.md:192`) | A Human-QA decision: include it or defer | Kelly | **Kelly** |
| 7 | **D4 orphaned guardian** | Reproduced on `bce11ed7` (`d4_hosted_orphan_sweep_results.qar_b74d93c3d853.json`); CRM lead deletion, not Documents | Fix in CRM | CRM lane | Not Documents |
| 8 | **D10 scanner and inbound retrieval** (M2 engine, O2 writer, F1 fetcher, V1/H1) | Gates merged and applied (#1634); scanner, retrieval and provider traffic OFF | DEC-6 engine/host; A&I review then role and persistent-access approvals for O2; DEC-8 retrieval | Kelly; A&I; Communications | **Kelly** (outside the read/write MVP unless Kelly includes it) |
| 9 | **Director closes** of reconciled obligations | `…E460BCD09185` R4, `…A1EE0FDEF21C` R2/R4/R5, `…12706A6E51FA` fixture repair: done; `…6A4F60B1555E`: superseded (plan §2) | Accept/Close | Director | **Kelly** |
| 10 | **Staging tests failing for other lanes** | Plan §4 (Financials, CRM, A&I, Fields, Communications) | Their owners' fixes; full validation is not clean until then | Other lanes | Not Documents |
| 11 | **Records hygiene** | **Done `ba46ece43`**: D1a header superseded by the Q1 record, write-proposal header updated, synthesis row corrected. Remaining: this lane's D9-H1/reinstall records are on `agent/documents` only | One docs-only PR | Documents | Unblocked |
| 12 | **Local `alloy-cert` indexes** (incident 2026-11-09) | **Repaired by Kelly**: both original full unique indexes restored, all five rows unchanged; hosted untouched | — | — | Closed |

Scope decisions outside the MVP unless Kelly decides: DEC-10 (10 MB uploads), DEC-9 (paperwork accountability).
