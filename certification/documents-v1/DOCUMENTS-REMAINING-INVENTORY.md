# Documents V1: what is still required (inventory, 2026-11-09)

Snapshot against staging `5db26b46` (PR #1637), migration ledger head `20261221100000` (556). It extends
`DOCUMENTS-COMPLETION-PLAN.md` (last updated at `841035a3f`), which stays the plan of record. "Proven" means a receipt.

## Closed since the plan's last update

| Item | Evidence |
|---|---|
| Reinstall after disconnect (blocked every second D9 run) | PR #1637 merged `5db26b46` (`gar_cd2f139aca676a`); migration `20261221100000` on the deployed primary (census `gar_7d515998fe2afe`); rollback restores the full indexes only until the first reinstall, and that happened in `qar_143a8fbcad49`, so code-only rollback from here |
| D9-H1 hosted read proof | `qar_143a8fbcad49`: 41 passed / 2 failed; cases 6, 11, 12, 14 pass; ZERO_RESIDUE (`gar_b0efd299bb98ba`). Earlier records `qar_7d7ec3d86bdd` (35/5) and `qar_31100f9d04e5` (blocked) unchanged |

## Still required

| # | Item | State / evidence | Missing | Owner | Blocks on |
|---|---|---|---|---|---|
| 1 | **D9-H1 case 10** (download link ×2) | Status 200, document, host, no path all held; failed only the driver's cross-clock `ttl <= 600` (600.13 / 600.27 s, server clock leads) | Either accept case 10 as proven on the held conditions, or make the bound clock-independent (driver change → re-pin → plan-bytes approval → one more hosted run) | Kelly decides; Documents implements if asked | **Kelly** |
| 2 | **D9-H2 write proof**: D9.2 W-* (writes, 24 h handoff), D9.3 W-RV / W-AR (archive, restore) | D9.2/D9.3 deployed (#1630, `20261217090000`); certenv proof `gar_46d2274f98232f`, `gar_b55de8a1627166`; the shared residue census already asserts the `d9w_zr_*` checks | No hosted write driver or run order (Documents); the three write applications (`d9-documents-write-cert`, `-review-cert`, `-write-scope-cert`) are not registered; no `documents_d9_write_v1` plan in the toolkit (Host Capacity); then a plan-bytes approval and DEC-2 | Documents → Host Capacity → Kelly | Documents work first (unblocked) |
| 3 | **Q2 on hosted**: unsafe release / restore, archived restore refused | SQL cases 2–5 and route tests (409 `MALWARE_UNSAFE` / `MALWARE_SCAN_PENDING`, 503 fail-closed) | Unreachable on hosted without a verdict writer: the O2 scanner-writer role, or a registered verdict fixture | Kelly (accept as SQL/route-proven, or approve a verdict fixture via Host Capacity) | **Kelly** |
| 4 | **Final hosted regression** of D1–D8 on the final staging SHA | Last full regression `qar_446cbc230b86` and R2/R5 `qar_b74d93c3d853` predate #1630–#1637 | One `authz_q1` run on the final SHA (DEC-2 card) | Documents | Run once the SHA is final (after item 2) |
| 5 | **Browser walks** | D7/D8 17/17 on `bce11ed7`. The D6 walk was 2/6 on `bce11ed7` (5/8 on `1492a2dd`) because its setup precondition is not scripted | Script the D6 walk setup, then rerun it in a hosted run (it can share item 4's run) | Documents | Unblocked locally |
| 6 | **D7.4 Focus Panel child Documents card** | Recorded as a finding (`D6-DOCUMENT-REQUIREMENTS.md:192`) | A Human-QA decision: include it or defer | Kelly | **Kelly** |
| 7 | **D4 orphaned guardian** | Reproduced on `bce11ed7` (`d4_hosted_orphan_sweep_results.qar_b74d93c3d853.json`); CRM lead deletion, not Documents | Fix in CRM | CRM lane | Not Documents |
| 8 | **D10 scanner and inbound retrieval** (M2 engine, O2 writer, F1 fetcher, V1/H1) | Gates merged and applied (#1634); scanner, retrieval and provider traffic OFF | DEC-6 engine/host; A&I review then role and persistent-access approvals for O2; DEC-8 retrieval | Kelly; A&I; Communications | **Kelly** (outside the read/write MVP unless Kelly includes it) |
| 9 | **Director closes** of reconciled obligations | `…E460BCD09185` R4, `…A1EE0FDEF21C` R2/R4/R5, `…12706A6E51FA` fixture repair: done; `…6A4F60B1555E`: superseded (plan §2) | Accept/Close | Director | **Kelly** |
| 10 | **Staging tests failing for other lanes** | Plan §4 (Financials, CRM, A&I, Fields, Communications) | Their owners' fixes; full validation is not clean until then | Other lanes | Not Documents |
| 11 | **Records hygiene** | `D1A-CERTIFICATION.md` header still PARTIAL; `docs/context/alloy-platform-synthesis.md:74` still says D6 residue "open debt"; `D9-WRITE-CONTRACT-PROPOSAL.md` header predates the D9.2 build; this lane's D9-H1 records are on `agent/documents` only (not on staging) | Corrections plus one docs-only PR | Documents | Unblocked |
| 12 | **Local `alloy-cert` indexes** (incident 2026-11-09) | A Documents harness error half-applied `20261221100000` on the shared LOCAL stack: `uq_app_installations_producer_key_live` present, both full unique indexes dropped. Hosted unaffected | Run `.vacilando-payloads/ri-LOCAL-CERT-RESTORE.sql` (the lane's repair was denied as a shared-resource change) | Kelly | **Kelly** |

Scope decisions outside the MVP unless Kelly decides: DEC-10 (10 MB uploads), DEC-9 (paperwork accountability).
