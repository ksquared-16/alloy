# S4 — Shared school / location branding — certification record

Sprint: Tours, Operating Calendar & Public Forms · slice S4 · **commit-only, not promoted.**
Lane: Enrollment (`lane_2cea84351d90`) · objective `OPWORK_2CEA84351D90_SPRINT_80ADA49DE68E` · run `erun2_4e9df96d92aab429`.
Base: S3 `e637db1f1`.

## Preflight finding (S4-C)

S2 left branding **live**. `form_definitions.metadata.{brand_name, accent_color, logo_url}` was read at
request time, and publish snapshotted nothing, so a draft branding save restyled the published form. That
violated the Director's requirement, and S4 corrects it (below).

## Brand vocabulary and storage (no migration)

| Layer | Storage | Who may write |
|---|---|---|
| Organization default | `org_settings.metadata.public_brand_v1 = { display_name, accent_color, logo_url }` | `settings.manage` (`PUT /api/admin/public-brand/organization`). It is organization identity, so not Tours authority |
| Location override | `locations.metadata.public_brand_v1` (empty field = inherit) | `tours.configure` (`PUT /api/admin/public-brand/locations/[id]`), edited beside the location's tour schedules |
| Form override | the form's `brand_name` / `accent_color` / `logo_url` + new `brand_source: "inherit" \| "form"`; **frozen per published version** in `form_definition_versions.metadata.brand_snapshot_v1` | Form Builder (unchanged authority) |
| Platform | Bend Pine `#00A283`, Alloy mark | — |

Precedence is per field: **form → location → organization → platform** (`resolveEffectivePublicBrand`). It is
server-side only (`lib/branding/loadPublicBrand.ts`), and every read is filtered by the org the caller already
proved (a link's org), so another tenant's location id resolves to nothing. Values are sanitised on read and
refused on write: hex colours only; school logos `https://` only; form logos keep their historical `http(s)`.
No upload infrastructure was added.

**Legacy form compatibility.** The builder has always auto-saved Bend Pine as `accent_color`. On a form with no
`brand_source`, that exact value is treated as the builder default, not an override, and falls through to the
school brand. Any other stored colour still overrides. With no school brand configured, the result is Bend Pine
again, so **no unbranded form changes colour**. A form that deliberately chose Bend Pine and wants it to beat a
school brand must select "Customize for this form" (explicit `brand_source: "form"`).

## Publication snapshot contract (S4-C)

- Every publish path (`dbPublishVersion` and the packet-analysis publisher) writes `brand_snapshot_v1` in the
  same draft → published UPDATE. That is the only moment the DB immutability trigger allows a version's
  metadata to change.
- Public runtime: the form layer is read from the **published version's snapshot**. Location and organization
  layers are live: they are school settings, not form content.
- Versions published before S4 carry no snapshot and render from live definition metadata, exactly as before.
  Their next publish closes that.

## Requirement disposition

| Requirement | Disposition | Proof |
|---|---|---|
| Org default applies to all inheriting locations | DONE | live: two locations, both show the org name/colour |
| Location override wins over org default | DONE (per field) | live: A1 colour = location's, name = org's; A2 = org's |
| Form-specific published override wins over location | DONE | live, end to end through `buildPublicFormResolvePayload` with a real hashed link token |
| Published styling unchanged after draft edits | DONE | live: draft edit → published unchanged; **negative control** (read live metadata instead of the snapshot) fails this test |
| Republishing updates appearance | DONE | live: v3 publish shows the new values; "use school branding" published → back to location/org |
| Tenant / location isolation | DONE | live: org A asking for org B's location gets only A's default; a write naming B's location from A → 404; **negative control** (drop the org filter) fails |
| Public Tours show the effective brand (T01) | DONE | resolve route returns `brand` for the link's own org + location (a failure falls back to the platform, so invitation links cannot break); page shows the school logo/name and paints accent tokens |
| Existing invitation links remain functional | Route contract unchanged (`view` unchanged; `brand` added) | wiring test; full `tests/tours` suite green |
| Tours configuration branding (S4-B) | DONE | "How X appears to families" panel: org default at org scope, per-field location override with "inherited from the organization" / "set for this location", live button preview |
| Accessible button text ≥ 4.5:1 (S4-D) | DONE | white, else Midnight `#18273A`, else black; black clears 4.5:1 wherever white does not, so the floor is guaranteed. Exhaustive over all 4,096 `#rgb` colours. **Bend Pine now carries Midnight text (4.67:1)**; white was 3.2:1 |
| Accent as text / focus on white ≥ 4.5:1 | DONE | `--participant-accent-ink`: the accent, or the same hue darkened (Bend Pine → `#008269`, 4.78:1). Runtime text, links and focus outlines use it |
| Success inside brand; error/warning semantic | KEPT | success marks follow the accent; rose/amber errors and warnings unchanged (pinned) |
| Desktop/mobile rendered | DONE in headless Chromium | real `IntakeFooter` markup + compiled `globals.css` at 390 and 1280 px: mobile primary fills the row beside Back (271 of 358 px); desktop is content width (160 px in 640); contrast measured in the browser 4.67 / 12.13 / 5.70; screenshots and `probe.json` in `s4/browser/` |

## Validation

| Gate | Result |
|---|---|
| `vac run typecheck` | rc=0 on the final application tree (only tests and records changed afterwards) |
| Test typecheck (`tsc --noEmit -p tsconfig.json` — the `typecheck:tests` config, which includes `tests/**`) | **PASSED** on exact candidate `54d6788db30684b6a1fecc580872842057359dae`, Vacilando detached request `vreq_0c5d583290c0` (receipt: waited 201 s, ran 114 s, exit 0). The in-turn broker had held it for memory, so it was handed off rather than waited on |
| `npm run prebuild` (6 guards; the three brand routes declared) | rc=0 |
| Wide regression (242 files: S2 forms/participant, S3 tours/locations, S4 branding, live suites) | 2482 passed / 15 failed; **all 15 fail identically on base `86cab0bd9`** (`operationalNavigationContract` ×8, `rawSelectAdoptionLedger` ×3, `structuredFormSchemaEditor` ×2, `formDraft` ×1, `configurationRuntimeLocations` ×1) |
| New tests | `tests/branding/publicBrand.test.ts` 17; `tests/tours/tourPublicBrand.test.ts` 2; S2/handoff pins moved to the 4.5:1 contract |
| Live cert DB | `tests/branding/live/publicBrand.live.test.ts` 6/6 in two throwaway orgs, zero residue |
| Production build | **Deferred** to the sprint's integrated checkpoint (mandatory) |
| Browser against a running app | Not run. No registered Alloy runtime for this lane, and a dev server was not started on a shared, memory-constrained host. Chromium proof is of the real components and stylesheet, not a served page |

## Boundaries kept

No marketing consent, preference, unsubscribe, comms category, public lead booking or Processing change (C1 / S7).
**Seam for S7:** the tour page's `brand` contract and `resolveLocationPublicBrand` are what an S7 public
(non-invitation) booking page should reuse. Consent capture should be a schema-declared field rendered by the
form runtime, owned by C1's consent authority; S4 adds none.

## Open

- The builder preview still shows the form's own colour when "Use the school's branding" is selected (it has no
  school-brand read). It is labelled; the public page is correct.
- Logo is a URL; there is no upload.
- `org_settings` / `locations.metadata` writes are read-modify-write on one key (the house pattern; a concurrent
  write to another key of the same row could be lost).
