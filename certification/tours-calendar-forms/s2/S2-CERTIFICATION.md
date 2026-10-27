# S2 — Public form branding & submit button — certification record

Sprint: Tours, Operating Calendar & Public Forms · slice S2 · **commit-only, not promoted.**
Lane: Enrollment (`lane_2cea84351d90`) · objective `OPWORK_2CEA84351D90_SPRINT_80ADA49DE68E` · run `erun2_20a1b5e8171f8e0f`.

## Lineage

| Item | Value |
|---|---|
| Staging reconciliation | `e2847fd34` — merge of `refs/remotes/origin/staging` `9d5655603` (75 commits) into the sprint branch; no conflicts; S1 SHAs unchanged |
| After the merge | S1 guard `20261210090000` still sorts after staging's newest `20261209090200`; no duplicate versions; context manifest regenerated (`--check` current) |
| S2 implementation | the commit carrying this record |
| Schema / migration | none |

## Requirement disposition (D0 §1)

| D0 id | Disposition | Proof |
|---|---|---|
| F01 tenant accent never painted | CLOSED. `participantBrandStyle` publishes `--participant-accent` and a contrast-chosen `--participant-on-accent`. `globals.css` maps them to `participant-accent` / `participant-on-accent` with `@theme inline`; every accent surface in `app/forms/embed/[token]` uses them, plus native checkbox/radio `accent-color` | Compiled CSS: `.bg-participant-accent { background-color: var(--participant-accent, #00A283) }`; opacity variants are `color-mix(in oklab, var(--participant-accent, …) N%, transparent)`. Test: no runtime file hardcodes Bend Pine / juniper (except Alloy's own `BrandMark`); no solid accent surface pairs with a fixed white label |
| F01 two disagreeing defaults | CLOSED. Runtime default = builder default (`DEFAULT_FORM_ACCENT`, Bend Pine `#00A283`) | Test: `PARTICIPANT_DEFAULT_ACCENT === DEFAULT_FORM_ACCENT`; no colour literal in the resolver |
| F01 contrast | White text while it holds ≥ 3:1, otherwise the higher-contrast ink (`#18273A`) | Test: pale accents (`#FDE68A`, `#BAE6FD`, white) get dark text at ≥ 4.5:1; a sweep of 586 colours never falls under 3:1 |
| F02 submit label | CLOSED. Optional `submit_label` in `formSchemaV1Schema` (trimmed, 1–40 chars), so it is **versioned with the published form** (D6). Runtime uses it for the final submit ("Submit" / "Confirm & submit"); "Sign and finish" stays platform wording. Builder: "Submit button label" input; preview shows it | Tests: schema accepts / trims, refuses blank and over-long labels, still `.strict()`; runtime wiring |
| F03 button width | CLOSED. Footer primary is `flex-1` on mobile, `sm:flex-none sm:min-w-[10rem]` right-aligned from `sm`; the two full-width review primaries are `w-full sm:w-auto`. Builder preview mirrors it | Test: rendered `IntakeFooter` markup |
| D-F2 failed branding save swallowed | CLOSED. `syncFormStats` and `patchFormBranding` throw on a refused or failed PATCH; the builder's existing save handler shows it ("Questions saved, but branding and form details were not: …") | Behavioural test with the real hook and a stubbed `fetch`; **negative control**: with the old swallow restored, the test fails |

## Decisions taken in this slice (reversible, reported)

- **Default accent = Bend Pine.** The old runtime fallback `#1F2937` sat beside a comment calling `#00A283` "a tenant's colour", but `#00A283` is Alloy's own Bend Pine (`globals.css`). It is also the builder default and what every public form shows today. Choosing it means **no visual change for any unbranded form**.
- **Contrast floor 3:1, not 4.5:1.** White on Bend Pine is about 3.2:1, the look every public form has today. A 4.5:1 floor would turn every default button's text dark. That is a brand decision, so it is documented in `participantBrandTheme.ts` and left open.
- **Accent everywhere in the shell.** Success / complete marks inside the participant shell follow the tenant accent too. Errors (rose) and warnings (amber) do not.
- **Branding stays live, not versioned (D6, unchanged).** Only the submit label is versioned. Branding metadata is still read live from the form row.

## Validation

| Gate | Command | Result |
|---|---|---|
| Typecheck | `vac run typecheck` | rc=0 (tree `6c5019848ac7316d`) |
| Test typecheck | `vac run typecheck:tests` | rc=0 (tree `6c5019848ac7316d`) |
| Prebuild guards | `npm run prebuild` (web/) | rc=0 |
| S2 + updated pins | `tests/forms/publicFormBrandingS2.test.tsx`, `tests/lifecycle/participantArtifactHandoff.test.ts`, `tests/lifecycle/participantOneResponseModel.test.ts` | 41/41 |
| Affected regression | `vac run test` over 157 files importing any changed module | 1470 passed / 3 failed; **the same 3 fail on `origin/staging` `9d5655603` and on `e2847fd34`** (`structuredFormSchemaEditor` ×2, `formDraft` deriveDocumentTitle) — inherited, not S2 |
| Production build | — | **NOT RUN.** The change is `build_sensitive` (stylesheet). Per contract, one production build at the sprint's integrated checkpoint, on the final candidate. CSS compilation was proven directly with the repo's `@tailwindcss/postcss` |
| Hosted / browser QA | — | **NOT RUN.** Computed-style accent, contrast and desktop/mobile width on the standalone and iframe form remain for integrated QA (D0 §11) |

## Open

- Tenant / location brand (T01, S4) will feed this same shell. S2 reads only form metadata.
- Pre-existing staging failures above are owned by Forms Studio (FD-8) and POS, not this sprint.
- Integrated-QA evidence is still owed for F01–F03, on the local candidate plus the cert stack (D1).
