---
owner: product
status: closed
last_reviewed: 2026-07-17
concept: programs-runtime-product-certification
superseded_by:
  - configuration-runtime-completion-2026-07.md
---

# Programs Runtime Product Certification

**Certification date:** 2026-07-17  
**Scope:** Product experience only  
**Reference contracts:** Configuration Runtime V1, Configuration Workspace Platform doctrine, Organization Runtime, Locations Runtime, Configuration Publication Runtime, Programs Consumer #1  
**Evidence:** Authenticated 1440×1000 browser journey with intercepted Programs API responses; code was inspected only to resolve product-state ambiguity  
**Final verdict:** **NOT READY TO BECOME THE REFERENCE IMPLEMENTATION**

**Closeout:** The findings below remain the accepted pre-completion record.
They were resolved and re-certified in
[`configuration-runtime-completion-2026-07.md`](configuration-runtime-completion-2026-07.md).

## Executive finding

Programs proves that the publication lifecycle works. It does **not yet prove the
accepted Configuration product experience**.

The page has the right Organization identity, canonical route, Program selector,
publication controls, Assignment language, partial-failure handling, retry, and
ownership consequence copy. No Apply or visible Commercial terminology remains.

However, the selected Program opens directly into a long editable draft form.
There is no ambient Overview, no intentional view/edit transition, no durable
assignment posture, no Attention/Setup model, and no complete history across
published revisions. The operator can execute the lifecycle, but cannot see the
Program whole or answer all of the required questions at a glance.

The implementation is therefore a strong **functional publication console**, not
yet the publication-capable Configuration object workspace that future domains
should copy.

This verdict does not reopen any frozen runtime. It requires Programs to inherit
the already-accepted runtime more completely.

## 1. Organization Collection experience

### What works

- Page identity is unambiguous: **Organization / Programs**.
- The page explains the domain consequence: reusable Programs are authored,
  published, and delivered to Locations.
- The Program rail is persistent, selectable, and visually consistent with
  Configuration primitives.
- Publication state appears in the rail (`Draft only`, `Published · Revision 1`).
- The empty state gives a correct first action.
- The route and visible copy contain no Commercial ownership.

### What does not yet certify

- The Collection is missing search and filtering.
- It has no collection posture, cross-object Attention, or setup signal.
- Rows communicate publication state only. They do not communicate assignment
  coverage, failure, or the highest-priority reason a Program needs attention.
- There is no health/Attention model. BOS reports “No urgent issues,” but that
  generic statement is not authoritative Programs evidence.
- The empty state is duplicated between the rail and canvas and is too passive
  to be a Configuration primer.
- The page-level `New Program` action is acceptable, but the rail does not own
  Add as required by the Collection grammar.

**Assessment:** recognizable as an Organization Configuration domain, but not a
complete first-class Collection Runtime.

## 2. Program Detail experience

### Required operator questions

| Question | As-built answer |
|---|---|
| What is this Program? | **Partial.** Name, key, and ownership consequence are clear; no read-only Overview summarizes the Program. |
| What revision is active? | **Partial.** Header and history say Revision 1; the active revision’s content is not presented as an immutable object. |
| What is draft? | **Partial.** “Organization draft” is clear, but the draft is always an editable form and its relationship to the active revision is weak. |
| Where is it assigned? | **No.** Checkboxes are transient selection controls, not durable current assignment state. |
| What changed? | **No.** “Changes ready” can appear, but there is no draft-versus-published change summary. |
| What requires attention? | **No.** Failure appears in delivery history, but there is no Program Attention posture or actionable summary. |

### Section assessment

- **Overview — missing.** The page begins in edit mode.
- **Draft — functionally complete, experientially weak.** It is a large CRUD-like
  form, contrary to “understanding is ambient; editing is intentional.”
- **Published Revision — incomplete.** A history row exists; revision content and
  immutable active-state reading do not.
- **Assignment — functionally present, operational posture missing.** Selection,
  preview, and confirmation work; current assignments do not.
- **Distribution — present only as latest delivery cards.** No durable overview
  by Location or revision.
- **History — incomplete.** The UI filters delivery runs to the latest
  publication, so publishing another revision can hide earlier delivery history.
- **Impact — useful but thin.** It explains protected Location ownership, but
  lacks a summary and before/after consequences.
- **Shell actions — disconnected.** Generic Actions/BOS content does not expose
  Program publication, assignment, or Attention commands.
- **Navigation — partial.** URL selection works; owned concerns do not have tabs
  or addressable sections.
- **Density/readability — acceptable on desktop.** The long form and late
  placement of Assignment/History force scrolling and weaken orientation.

## 3. Publication experience

### Lifecycle walkthrough

1. **Draft:** creation and editing are clear.
2. **Validate:** a separate validation step gates publication.
3. **Publish:** “Publish immutable revision” accurately communicates consequence.
4. **Revision:** the header and history identify Revision 1.
5. **Assignment:** Location selection is explicit and uses Assignment language.
6. **Distribution:** per-target outcome is visible.
7. **History:** run status and retry are visible.

### Product judgment

The language successfully frames publication as releasing Organization
configuration rather than applying rows. The experience still feels like
editing a record because the primary detail surface is permanently an editable
form and the active published object has no first-class read state.

After publication, the draft remains labeled `VALIDATED`, the publish control
remains visually available, and no calm “published; no unpublished changes”
state is evident. This makes the distinction between active revision and
editable draft harder to understand than the runtime permits.

## 4. Assignment experience

### Certified

- “Assign to Locations” and “Confirm assignment” are explicit.
- Preview copy says Organization identity is inherited while Location offer
  state remains protected.
- No Apply or copy vocabulary appears.
- Partial success is honest and per-Location.
- Retry targets failure without visually re-running successful targets.

### Not certified

- Current assignment is not distinguishable from the operator’s pending
  checkbox selection.
- After assignment/reload, the selected checkboxes clear. Nothing in Overview,
  header, or rail answers “assigned where?”
- No assignment count (`2 of 2 Locations`) or update posture is shown.
- “Delivery” remains prominent terminology. It is valid internally, but the
  operator relationship should lead with assignment and consumption.

An operator can infer the model during the guided flow, but cannot reliably
understand assignment later without architectural knowledge or reading history.

## 5. Configuration visual language assessment

### Inherited successfully

- Stone canvas, white regions, Bend Pine actions, Program rail, object hero,
  consequence line, quiet metadata, and restrained status chips.
- Ownership language is explicit.
- Commercial chrome is absent.
- Partial failure is not masked as healthy.

### Inherited incompletely

- Missing Overview-led tab/section model.
- Missing operational summary, Attention, and Setup.
- Missing view/edit separation.
- Generic BOS “queue” assistance (`Summarize this queue`, `Draft follow-up`) is
  operations DNA, not Programs Configuration assistance.
- Duplicate breadcrumbs appear in shell and page content.
- The top shell renders `programs` in lowercase while the page uses `Programs`.

No visible Commercial DNA remains. The residual mismatch is **generic queue/CRUD
DNA**, which is more important than the removed noun.

## 6. Runtime consistency and inheritability

Another domain could inherit the technical lifecycle and visual primitives from
Programs. It should **not** inherit the current page composition.

Copying this composition would teach future domains to:

- open directly in edit mode;
- omit Overview and Attention;
- treat publication status as sufficient object health;
- use transient checkboxes as assignment posture;
- collapse revision and distribution history into one late page section.

That would contradict the frozen Locations reference grammar. Locations remains
the Configuration experience reference. Programs should become the reference
for **how a publishable Configuration domain extends that grammar** only after
the required refinements below.

## 7. Screenshot walkthrough

Evidence directory:

`~/.local/state/alloy-dev/evidence/wt2-configuration-publication-distribution-v1/screenshots/`

| Evidence | Product commentary |
|---|---|
| `01-programs-landing.png` | Correct Organization identity and calm empty state; missing Collection posture, search/filter, Attention, and assignment awareness. |
| `02-program-detail-draft.png` | Strong identity and ownership consequence; the object immediately becomes a large editable form. |
| `03-published-revision.png` | Publication is visible, but immutable revision content is not; draft still appears validated and editable. |
| `04-location-assignment-selection.png` | Explicit Location selection and no Apply semantics; selection does not communicate existing assignment. |
| `05-impact-preview.png` | Best lifecycle moment: it clearly protects Location-owned state; summary and before/after framing are absent. |
| `06-partial-failure.png` | Honest partial failure and specific Location reason; failure is buried below the form and absent from object Attention. |
| `07-retry-success.png` | Retry resolves the failed target; current assignment posture still disappears. |
| `08-history-audit.png` | Basic revision/run audit is legible; it is not a complete cross-revision history. |

### Evidence limits

- The Programs journey is authenticated but API-intercepted; it proves product
  states and control sequencing, not live deployed persistence.
- Existing Programs evidence is desktop (1440×1000). Responsive Programs
  behavior was not captured, so it is **not certified**.
- The requested Organization landing evidence was not captured in this Programs
  evidence set. Separate Organization evidence available during review showed a
  loading state rather than a settled Catalog and is not acceptable
  certification evidence.
- Draft, publish, assignment, distribution, partial failure, retry, and history
  are evidenced. Empty state is evidenced by `01-programs-landing.png`.

## 8. Required changes

### Critical

None found that invalidates the accepted Publication Runtime or risks Location
operational truth.

### Must fix before Consumer #2

1. **Add an ambient Program Overview and intentional edit mode.** At rest, show
   active identity, published state, assignment posture, and Attention. Draft
   editing must be an intentional concern, not the default whole page.
2. **Make published revision and draft difference legible.** Show the active
   immutable revision, whether unpublished changes exist, and a concise change
   summary. Do not present a validated, publishable-looking draft after a clean
   publish.
3. **Make assignment durable and glanceable.** Show currently assigned
   Locations, coverage count, revision consumed, and update/failure posture
   separately from pending checkbox selection.
4. **Project failures into Program Attention and Collection rows.** A partial
   distribution failure must be visible without scrolling into history.
5. **Preserve complete history across revisions.** Do not hide old delivery runs
   when a new publication becomes latest.
6. **Complete Collection grammar.** Add search/filter when useful, rail-owned Add,
   setup/Attention posture, assignment indicators, and an actionable primer
   empty state.
7. **Align shell assistance.** Remove generic queue/follow-up BOS prompts from
   this Configuration context or replace them with registered Programs actions.
8. **Certify responsive behavior and settled Organization entry.** Capture
   laptop/wide (and narrower behavior where supported), plus the settled
   Organization Catalog → Programs transition.

### Recommended before broader rollout

- Split Overview, Draft, Assignment, Distribution, and History into clear,
  addressable concerns while keeping one object workspace.
- Add assignment impact summary before per-Location detail.
- Make revision timestamps and actors meaningful audit statements.
- Normalize breadcrumb casing and remove duplicate ownership breadcrumbs.
- Prefer “assignment history” in operator headings where “delivery” adds no
  product meaning.
- Move high-consequence Publish/Assign actions into consistent shell/object
  action ownership while retaining inline consequence context.

### Future

- Compare or restore prior published revisions when Product doctrine authorizes
  rollback semantics.
- Rich dependency/consumer visibility.
- Cross-Program collection analytics only after authoritative indicators exist.
- BOS explanations of revision impact through the same registered actions.

## 9. Final Product verdict

**NOT READY TO BECOME THE REFERENCE IMPLEMENTATION**

Programs is certified as Configuration Publication Runtime **Consumer #1** at
the functional level. It is not yet certified as the Product reference for
publishable Configuration domains.

The gap is not infrastructure. The gap is the accepted experience:
Collection → whole object → ambient understanding → Attention → intentional
editing → publish → durable assignment posture → complete history.

Consumer #2 should not inherit the Programs page composition until all Must Fix
items are resolved and Programs passes a second Product certification.
