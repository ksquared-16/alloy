# Placement certification

**Status:** Complete and acceptance-tested for Configuration Runtime V1.

## Certified behavior

- Placement retains its approved owner: ranking is persisted on the governing waitlist stage and applies wherever that Business Process runs, not only at the selected Location.
- Business Process and Stage are distinct operator selections. Canonical lifecycle metadata resolves **Enrollment → Waitlist**; legacy work-unit names are not presented as competing Business Processes when canonical lifecycle identity is available.
- Status explicitly states whether ranking is active.
- Priority factors support selection and ordered ranking. Runtime-owned fallback remains on and last; tie-break order remains read-only.
- Ordering mode distinguishes preview from applied waitlist order.
- Location rooms are supporting participation context and link back to Rooms.

## Mutation certification

- Business Process selection — PASS.
- Stage selection — PASS.
- Ranking enabled/status — authoritative response PASS; hard refresh PASS.
- Preview/applied ordering mode — response PASS; hard refresh PASS.
- Factor selection — response PASS; hard refresh PASS.
- Factor ordering — response PASS; hard refresh PASS.
- Original ranking layer restored after certification.

## Evidence

- `screenshots/133-placement-final.png`
- `screenshots/114-placement-final.png` (certification mutation state)
