# BP V2 D8: hosted proof in QA Shared

| | |
|---|---|
| Deployed build | `9adb3c664a47` (PR #1584 squash; `/api/build-info` at 15:11:34Z) |
| QA run | `qar_cfa20b0578d5`, plan `bp_v2` (opened `gar_0c4821a0b1c96b`, closed `gar_e4afa2aed3e4a9`) → **QUIESCED_RETAINED**, `access_clean: true` |
| Residue census | `gar_28712e7ade83d6` (15:16Z, after the 15:15Z close), **13/13**; bound by `gar_3b6d67d0d5c961` |
| Fixtures | **none**. Records used: the closed/lost readiness family `de17caff…` (the D8 record, one child, no assignment) and the Walk family `d9b1fbfb…` |

## Browser results (admin and director, identical; `walk-*.json`)

| Step | Focus Panel | Create Assignment editor | Assignments surface |
|---|---|---|---|
| Deep link to the closed/lost family (`/workspace/work-unit/all?subject_id=…`) | `record` | **not shown** | "No assignments yet" + "+ Add Assignment" (`closed-family-open-director.png`) |
| Click **+ Add Assignment** (explicit) | `record` | **opens** (`explicit-add-assignment-director.png`) | — |
| **Cancel** | `record` | closed; no write | back to "No assignments yet" (`after-cancel-director.png`) |
| Navigate to another record (Walk family) | `record` | not shown | — |
| Reload the closed/lost family | `record` | **not shown** | "No assignments yet" (`closed-family-refresh-admin.png`) |

- **Requests.** Every non-GET request was recorded, not blocked. The only ones were `POST /api/admin/queue-view-totals`, the Work View totals read. **No assignment or other write** happened from opening, cancelling, navigating or refreshing.
- **Before D8.** The same record showed "Create Assignment — configure the minimum." on entry (`d4/hosted-qar_83fecf2e96b1/closed-record-director.png`).
- **Observation, not D8.** The BOS assistant panel also opens on record entry and partly covers the record. It is separate, pre-existing behaviour, recorded for the Director's product review.
