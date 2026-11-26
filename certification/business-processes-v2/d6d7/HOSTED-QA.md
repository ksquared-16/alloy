# BP V2 D6/D7: hosted certification (QA Shared)

| | |
|---|---|
| Run | `qar_08296c326232` (plan `bp_v2`, target `alloy_staging_web`), opened by `gar_b9e04f6623870d` at 17:22Z under `erun2_217a5642955c1874` |
| Deployed build | `/api/build-info` → `502d597537a753125c0e11d2f299cb134c60fb1b`. It contains the #1586 squash `484800c326e9963a36aeb2c42594e287ce191f00`; the one later commit (#1587) touches no D6/D7 file. Every evidence file records the same SHA |
| Org | QA Shared `4acc9386-c485-486f-aa1f-05d83499d142` only. Firefly was not touched |
| Close | `gar_e9013780c3d6d7` (17:38Z): access clean; 4 pool identities revoked (0 roles and 0 profiles remaining); sessions signed out |
| Residue census | `gar_daf258da13154c` (17:39Z, after the close), **13/13**. Configuration publication rows: 5, unchanged since D8 |
| Binding | `gar_af0313de9af64a` → run `CLOSED`, verdict **QUIESCED_RETAINED** |
| Fixtures | None created. The only non-GET requests in any walk were `POST /api/admin/queue-view-totals`, which is a read |
| Evidence | `hosted-qar_08296c326232/` |

**Lease history.** The run could open only after the Documents lane closed `qar_31a2b9da28cd` (`authz_q1`) at 17:20Z (`gar_22d5cdfc6b6029`, access clean), on Kelly's decision. This lane never touched that lease.

---

## D6: Scheduling card case identity. **PASS (hosted)**

The walk ran for admin and Director on Current Assignments (`walk-admin.json`, `walk-director.json`):
1. Open **Ben Walk 584637**: child `41ec45f8-5e69-4a4d-abb3-94d547fbf4d8`, site QA North. The record opens on its assignment (Room N 584637, Primary since Sep 22, Active), with Child and Household facets.
2. "← Assignments" goes to the list, then "+ Add Assignment" opens the category picker.
3. Pick **Classroom 584637**. The Create Assignment editor opens for Ben Walk 584637, Site · QA North, showing room, days, dates, daily hours and Save assignment (`d6-editor-open-*.png`).
   - **Recurring Tuition** reads "Pending — becomes final when Billing is configured for this schedule". This durable child has no case to price inside, so the card asks for none.
4. Cancel goes back to the list. Then switch to **Eve Walk 584637** (`cf02f5d6-56a3-47c8-932b-478cdb1fbde8`), then refresh.

| Check | admin | Director |
|---|---|---|
| `financial-config/opportunity/*` requests (all steps) | **0** | **0** |
| API responses ≥ 400 | 0 | 0 |
| Editor functional (opens, controls present, Cancel returns) | yes | yes |
| Writes from opening, switching or refreshing | none (`queue-view-totals` reads only) | none |

**Before the repair**, the same path (`qar_58463703cedd`) requested `financial-config/opportunity/<customer_member_id>` and got 404.

---

## D7: Work View Row Grain at publication. **PASS (hosted)**

The test ran as admin through the product routes, on the QA Shared Enrollment **draft** (`d7-draft-refusal.json`).

| Step | Result |
|---|---|
| Before | Draft revision 11, `published`, no unpublished changes. Draft payload sha `ff2b7edd…` equals the published payload. Published revision 3 (`59ba9904…`). Views: new_leads, tours, decision, all (family); registration, waitlist (child) |
| Draft: add `d7_probe_family_on_enrolling`, a family view filtering `enrolling`, hidden in runtime | 200 |
| Validate | `can_publish: false`. **`work_view_grain_mismatch`** at `processes[enrollment].work_views_v1[d7_probe_family_on_enrolling].row_grain_v1`, with `incompatible_stages: [{enrolling, child}]` |
| Publish attempt | **422 `business_process_publication_blocked`**, with the same finding. Nothing was published |
| Restore the original views | 200 |
| After | Payload sha `ff2b7edd…`: **identical** to before and to the published payload. Status `published`, no unpublished changes. Published revision 3 unchanged. The probe view is absent. Draft revision 13: two saves, content unchanged |

The census confirms it: configuration publication rows are still 5.

---

## D9: BOS panel activation. OBSERVED, not repaired

The observation used a fresh browser context with no stored preference (`bos-observation.json`).

| Entry | BOS rail | Covers the Focus Panel |
|---|---|---|
| Enrollment record, first entry (`/workspace/work-unit/all?subject_id=…`) | **visible, floating** | 32% |
| Enrollment record, refresh | visible, floating | 32% |
| Enrollment record switch | visible, floating | 9% |
| Assignments record (projection), first entry in a new tab | mounted (`data-bos-overlay-mode=floating`) but `visibility: hidden` | 0% |
| `/workspace` home | visible, floating | no Focus Panel |

- **Requested explicitly?** No. There was no click, and the stored preference (`sessionStorage alloy:v1:admV2:shell:bosPresentationState`) was **null**: the panel opens by default.
- **Owner: Runtime/BOS.** `BosPresentationControllerProvider` (`contexts/BosPresentationControllerContext.tsx`) holds the state, and `CommandRailBosMount` renders it.
  - The default is `"floating"` (line 91), and an auto-recommend effect (lines 206–210) keeps re-applying it until a preference is stored.
  - Closing the panel stores `closed`, which lasts for that tab only.
  - Nothing tied to record entry opens it.
- **Blocking?** It doesn't block D6/D7. It does affect the Director review of Enrollment records, which open partly covered.

Note: the per-step `bos_*` fields in the `walk-*.json` files came from an earlier detector that ignored `visibility: hidden`. **`bos-observation.json` is authoritative.**

---

## Regressions: Enrollment, Assignments, Billing (read-only sweep, `regression-sweep.json`)

There were 16 views, each loaded as admin on the deployed build: **no error states and no API failures**.

- **Enrollment** (New Leads 0, Tours 0, Decision 1, Registration 1, Waitlist 2, All 3). The only API failures were the option-set 404s (`childcare_program_type`, `person_gender`) already recorded in 8B-2.
- **Assignments** (Current 3, Ending soon 0, Upcoming 1, Schedule gaps 1, Proposed/incomplete 4).
- **Billing**: 0 in all five views. That is expected: the 8B-2 charges are quiesced.

The only non-GET request was `queue-view-totals`.
