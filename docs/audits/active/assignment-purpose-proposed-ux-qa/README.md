# Assignment Purpose + Proposed Assignments — browser QA (2026-07-26)

Slot 5 · `http://127.0.0.1:3015` · hosted auth (KK) · **no commit / no push**

## Timing evidence (Focus Panel)

| Event | Result |
|-------|--------|
| Room picker open → options painted | **157 ms** (`ready=seed`, `evaluating=0`, **7** rooms) |
| `studio_config` (rooms seed) | ~1378 ms cold API (list already seeded in first-paint path) |
| Assignment Purposes API | 8 purposes in ~691 ms |

## Screenshots

| File | What |
|------|------|
| `04-purpose-editor.png` / `03-studio-purposes.png` | Studio **Assignment Purposes** + sectional editor + icon catalog |
| `05-create-modal.png` | Workspace Create notes Proposed without enrollment |
| `F05-room-picker.png` | Instant room list (Operational space / Eligible) |
| `F06-detail.png` | Detail grid: Purpose · Proposed · Room · Days · Time · Starts · Ends; promote blocked in operator language |
| `S02-assignment-list.png` | Day filter + Proposed label on plural list |
| `focus-evidence.txt` | Raw timing log |

## Configured purposes (org)

Primary Classroom, Before Care, After Care, Enrichment, Transportation, Therapy, Recurring Service (+ Homeroom)
