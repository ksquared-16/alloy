# Director Certification Experience V1 (W-4)

## Principle

Workers produce work. Evidence proves work. Director certifies work.
The operator approves Director’s certification — not the implementation.

## After (this pass)

Page headline: **Director has certified this deliverable**

Above the fold:

1. **Executive Summary** — three sentences; no filenames / worker prose
2. **Director Recommendation** — Approve W-4 · Confidence 97% · independent-verification summary · **Certify W-4**
3. **Director Certification** — ✓ Scope / Evidence / Tests / Acceptance / Risks · Certification Confidence 97% · *View verification details* (collapsed)
4. **What I'm asking you to approve** — in-scope vs out-of-scope
5. **Approval Impact** — what Director does immediately after certify

Below the fold (collapsed):

- Your judgment
- Technical details (what changed, evidence inventory, files, IDs, worker claim)

Mission Dashboard / status: **Director recommends certifying W-4**

Timeline language: Director verified → recommends certification → You certified → Director unlocked…

## Screenshots

| Artifact | File |
| --- | --- |
| Certification briefing (top) | `w4-certification-briefing-top.png` |
| Full page after | `w4-certification-experience-after.png` |
| Mission list label | `w4-mission-dashboard-cert-label.png` |
| Prior evidence-integrity state | `w4-evidence-integrity-after.png` |

## One-minute executive test (W-4)

Without opening Technical Details, an unfamiliar reader should answer:

| Question | Answer on page |
| --- | --- |
| What was accomplished? | Build-time enforcement guard for privileged API routes |
| Why does it matter? | Production builds validate service-role clients before they ship |
| What remains? | Allowlisted exception remediation in W-15 |
| What is Director recommending? | Approve / Certify W-4 |
| Why is Director confident? | 97% — evidence, tests, scope, no blocking discrepancies, risks documented |
| What happens if I approve? | W-4 accepted, W-5 unlocks, execution continues, mission confidence up |

## Remaining UX improvements

- Separate Mission Confidence vs Certification Confidence visually on the mission chrome (not only inside the briefing)
- Timeline backfill for older `You accepted…` events already stored before this pass
- Needs You list item title already uses posture label; confirm dock copy never says “Deliverable ready”
- Curated briefs for W-5+ so non-W-4 assignments get the same executive voice without generic fallbacks
- Soften duplicate Confidence % (recommendation card + certification card) if operators find it redundant

## Feedback loop — CLOSED

Operator ↔ Director alignment on deliverable reviews (certify note, Share context,
Request changes, Re-check, visible Conversation) is **closed** at commit
`fbe918247`. Durable record:

→ [`FEEDBACK-LOOP-CERTIFICATION.md`](FEEDBACK-LOOP-CERTIFICATION.md)

Do not extend that capability’s product behavior on the closeout branch. Auth
exposure follow-up only: [`../BACKLOG.md`](../BACKLOG.md) **CP-AUTH-NON-LOOPBACK**.
