# BP V2 D4: hosted proof in QA Shared

| | |
|---|---|
| Deployed build | `17991d6d4768` (PR #1578 squash; `/api/build-info` at 12:42:47Z) |
| QA run | `qar_83fecf2e96b1`, plan `bp_v2`. Opened by `gar_1973a38e7339e4`, closed by `gar_a80476b7efe3a6` → **QUIESCED_RETAINED**, `access_clean: true`, all four identities signed out |
| Residue census | `gar_8668478b99adf3` (12:47Z, after the 12:46Z close), **13/13**; bound by `gar_515d0ba61f118b` |
| Evidence | `hosted-qar_83fecf2e96b1/probe.json`, census results, screenshots |

**Actor scopes.**

| Persona | Scope |
|---|---|
| `admin` | org-wide |
| `director` | org-wide; `fin.read` / `billing.*` |
| `restricted_operator` | QA North only |
| `no_finance_operator` | no `fin.read` |

**Targets.** These are the records that leaked in `qar_58463703cedd`. The Walk 584637 household (`23865933…`) has agreements at QA North (Ben, Cara) and QA South (Eve), plus household-sourced (org-scoped) charges.

## Results

| Read | admin | director | restricted (QA North) | no_finance |
|---|---|---|---|---|
| `charge/1312c61e` (household-sourced; leaked in 8B-2) | 200 | 200 | **404** `{"ok":false,"error":"No such charge."}`, no amount or name | 403 `fin.read` |
| `card?customer_id=<Walk household>` (leaked in 8B-2) | 200 | 200 | **404** `{"error":"Not found"}` | 403 |
| `card?customer_member_id=<Ben>` | 200 | 200 | **404** | 403 |
| `payment-methods?customer_id=<Walk household>` | 200 | 200 | **404** | 403 |
| **Same-site:** `charge/30fdf69b` (agreement-sourced, Ben's QA North agreement) | 200 | 200 | **200 with detail** | 403 |

**Fixture.** `charge.add` (review template, `customer_member_id` Ben) created draft `30fdf69b…`, `billable_source_type = enrollment_agreement`. After the reads it was cancelled with `charge.cancel_draft` → `void` (retained, immutable).

**Browser.** Each persona opened the Walk family's Focus Panel (`/workspace/work-unit/all?subject_id=d9b1fbfb…`). All non-GET requests were aborted; none were attempted.
- **admin:** panel `record`; Financials shows amounts; `/api/admin/financials/card` 200.
- **restricted operator:** panel `record` (Enrollment, Household and Children render); Financials heading present with **no amount**; `/card` **404**; drawer view-model 200 (`walk-family-restricted_operator.png`).

**Not re-walked on hosted.** The five Billing views. Billing's projection code is unchanged, its tests are in the green regression set, and the 8B-2 charges are quiesced (the views read 0 rows).

**Census.**
- All 13 checks are true: pool access, zero sent, org present, and the 10 financial checks.
- Retained by design: 5 charges (posted 3, void 2: the 8B-2 review draft and this D4 fixture), 1 reversal and 1 payment.
