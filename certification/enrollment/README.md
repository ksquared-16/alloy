# Enrollment — live certification censuses

Governed read-only censuses run against staging during Enrollment closure. Each `.sql` is the exact
artifact the trusted host executed (its hash is pinned in the governed request); the adjacent
`.results.json` is the Director-written result, following the same convention as
`certification/communications` and `certification/migrations`.

| census | question it answered |
| --- | --- |
| `offer-outcome-child-state-census.sql` | Did **Spot offered** move the child to Enrolling and leave the sibling alone? Yes — `outcome_status_key: "enrolling"`, sibling untouched at `new_inquiry` with a null `updated_at`. |
| `tour-stage-subject-census.sql` | Was there any live subject at Tour to certify against? No — 3 at `lead`, 1 at `waitlist`, 0 at tour, total 4. A real zero, not an empty lane, which is why a disposable subject was created through the product's own Create Lead flow. |
| `tour-exit-requirement-config-census.sql` | Is the published Tour stage-exit requirement still intact? Yes — `work_conduct_tour`, kind=work, level=required, timing=stage_exit, enforcement=blocking, `applies_to_transition_keys: [tour_transition_2]`, with the legacy `tour_date` / `tour_time` field requirements still present. |
| `tour-subject-stage-carrier-census.sql` | Where does a case actually carry its builder stage? Not on the opportunity: `status_key: "open"`, metadata holding only tour_date/tour_time, and **no `status_definitions` rows at all** for the org. The stage lives on the open stage work (`lifecycle_stage_key: "tour"`, `work_intent_key: "work_3"`). This is the evidence behind the stage-exit enforcement fix. |

The first attempt at the config census failed as `multiple_statements` and then as `execution_failed`;
both are recorded in the governed action log. The surviving artifacts are single-statement and guard
every `jsonb_array_elements` with a `jsonb_typeof(...) = 'array'` check, because a census that assumes
a shape reports nothing when the shape differs — which reads exactly like an empty tenant.
