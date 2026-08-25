# §11 — the operator browser review (owed since Slice 3)

Server is up on this worktree's assigned port. **This is `next dev`, so the first load of each route
compiles on demand — expect 15–25s on first paint and ~1s afterwards. That is compilation, not a
performance defect.**

## Sign in

    http://localhost:3014/login

Use the slot-4 QA identity. `/adminV2/workspace` redirects to `/admin/workspace`, which redirects to
`/login` until you are authenticated — so start at `/login` and you will land in the workspace.

## Reach the packet review

The Processing surface is a workspace modal, not a route, so there is no deep link to paste.

1. **Sidebar → Processing** ("Processing — intake, documents, and forms").
2. **Import document** — upload all three real sources into ONE processing case:
   - `web/tests/fixtures/processing/school-of-enrichment-family-handbook.pdf`
   - `web/tests/fixtures/processing/oregon-certificate-of-immunization-status.pdf`
   - `web/tests/fixtures/processing/school-of-enrichment-admissions-packet.capture.html` (accepted as
     "Hosted form capture")
3. Open the case, then press **"Analyse as one packet"** (`data-testid="processing-analyze-packet"`).
   It calls the existing form-draft endpoint with `mode: "packet"` and **publishes nothing**.

## What you asked to see, and where it is

| What | Where it appears |
|---|---|
| Packet sources | top of the packet review — one row per source artifact with its provenance |
| Logical artifacts | the four Formsite agreements segmented out of the single capture |
| Semantic facts | the fact list, at fact grain — not the 180 destinations |
| **Held concepts** | *"Owned elsewhere in Alloy"* — 10 immunization/medication facts |
| **Safeguarding** | *"A safeguarding restriction"* — rose-toned, deliberately distinct from every other chip; 3 rows |
| Relationships | *"A linked person"* — physician, dentist, emergency contacts |
| Collections | repeating structures shown as one decision each |
| Obligations | acknowledgements, signatures, uploads (3 of 4 now typed as documents) |
| Warnings | per-source warnings and validation issues on each proposal |
| Accepted / refused proposals | decision chips per row; refused canonical bindings show the refusal reason |

## What to look at hardest

- The three **safeguarding** rows. They should read as restrictions with their own approval, not as
  child profile text. If any of them offers "create a new field", the slice failed.
- The **rose chip is the only one on the page whose mishandling is a safety failure** rather than a
  data-quality one. Tell me if it does not read that way.
- The 10 **held** rows should explain *who owns this instead*, not merely that something is missing.

## Nothing publishes

There is no publish control on this path, and every proposal stays `decision_state: "proposed"`.
`tests/pos/packetReviewSafety.test.ts` holds the positive and negative controls for that.
