# Mygrant Family — W7 test charges: what exists, and the only canonical cleanup

Census `w7-parity-identity-mygrant-census.sql` on the deployed primary (2026-10-12), all three rows
created 2026-10-09 by the managed QA login `a92a0f18…` during earlier W7 runs:

| Charge | What | Status | Disposition |
|---|---|---|---|
| `be3c16f3-c724-480f-8ecd-41b8bc6d8f71` | Field trip $40.00, service Oct 9, 2026 (current-period) | posted | **Already neutralized** — reversed by `01590d6e` |
| `01590d6e-52b1-42f0-8e48-c5d867c3ab84` | Credit −$40.00, "reversal of charge be3c16f3…" | posted | The correction itself; history preserved |
| `72b98081-38e0-4e85-b462-1ae5bd1ed90c` | Field trip $40.00, service Nov 5, 2026 (future-period) | draft, invoiced Oct 25 | **Open** — see below |

Net effect on Mygrant today: $0.00 owed from these rows. The W7 walkthrough no longer uses Mygrant;
every scenario names a W7 QA household.

## The future-period draft

There is no operator-facing canonical path that voids a manually added draft:

* `charge.reverse` corrects POSTED charges only (`only posted childcare charges are corrected via
  source_charge_id`).
* Draft void-in-place exists only inside `reconcile_consumption_correction`, for obligations
  superseded by Operational Consumption — not for a manual Add.
* `charge.post` refuses a future-period draft until its period begins (W7-F001).

A direct `UPDATE` would be the hard, unattributed write the Director ruled out. So the draft is left
exactly as it is. **It posts itself on Nov 1, 2026**, when its billing period begins. The canonical
cleanup is then `charge.reverse` on `72b98081` — append a reversal, keep both rows — through the
Financials card by a named operator.

Nothing in Vacilando can schedule that for Nov 1 (a governed wait needs a ref something observes),
so this file is the record and the reminder. If a product draft-void action is later added, it
replaces the reversal step.
