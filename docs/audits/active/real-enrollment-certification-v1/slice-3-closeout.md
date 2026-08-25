# Real Enrollment Certification V1 — Slice 3 closeout

**Slice:** Operator Packet Intake + Safe Configuration Review
**Base:** Slices 1–2 accepted (`740d48867`)
**Commits:** `b6c09f0ab` · `f5bef195c`
**Status:** complete except browser evidence, which needs a human sign-in (§2). Slice 4 not started. Nothing published.

---

## 1. Operator workflow

**No new upload system, and no new route.** The first version of this added
`/api/admin/processing/cases/[caseId]/packet-intake`, and the route-capability ratchet refused it —
correctly. A packet analysis is the same operator action, on the same case, with the same
authorization as the single-document detect. So it is a **mode** of that handler, and packet-grain
decisions extend the endpoint that already persists this case's operator decisions:

```
POST   …/cases/{id}/form-draft                { "mode": "packet" }   → analyse every source
GET    …/cases/{id}/form-draft/discovery-decisions                    → analysis + decisions
PUT    …/cases/{id}/form-draft/discovery-decisions { packet_decisions } → record decisions
```

All three prebuild governance gates pass with **zero new handlers**: route capabilities, the
service-client principal check, and the unauthenticated-side-effects check.

The existing owners do the owning:

| concern | owner (unchanged) |
|---|---|
| bytes, hash, URL, mime, provenance | `documents` |
| which sources belong to the case | `processing_case_sources` (`role: primary \| related`) |
| the analysis | `processing_cases.metadata.packet_intake` |
| the operator's decisions | `processing_cases.metadata.packet_intake_review` |

`buildPacketIntakeForCaseSafe` reads every document attached to the case in the order it was
attached, picks the reader each format deserves, composes, and stores. A source it cannot read is
**named in the warnings** rather than dropped — a packet that quietly analysed two of three documents
is worse than one that says so.

`packet_source` is now `available: true`, described as "Analyze as one packet".

---

## 2. Browser evidence — **blocked on you**

What is verified:

- the dev server runs this worktree's code on `http://localhost:3014` (HTTP 200);
- `/adminV2` correctly requires authentication (307 → `/login`);
- the login page renders (screenshot captured).

What is not: **the signed-in operator screens.** Slot 4's stored QA session expired on 2026-07-26,
and `alloy-agent-login 4` opens a browser for a human to complete a Supabase email/password sign-in.
I will not handle credentials, so the authenticated screenshots need you.

Two things stand in the way when you run it, both worth knowing:

1. **`lsof` is not installed on this machine.** The toolkit uses it to confirm a PID belongs to a
   worktree and to detect busy ports, so `alloy-agent-login` refuses with *"PID file exists for live
   PID … that does not belong to …"*, `alloy-dev-status` reports **busy ports as free**, and
   `alloy-dev-stop` declines to stop a server it cannot verify. Removing
   `~/.local/state/alloy-dev/gateway/pids/wt4-….pid` first lets the login proceed.
2. **The dev server must start under arm64 node.** `/usr/local/bin/node` is x64 and this worktree's
   `lightningcss` and `rolldown` ship only arm64 binaries, so a server started on the default PATH
   fails every request with *"Cannot find module '../lightningcss.darwin-x64.node'"*. Start it as:
   `PATH=$HOME/.nvm/versions/node/v22.21.1/bin:$PATH alloy-dev-start wt4-enrollment-phase2-participant-anchor`.
   (The same applies to vitest.) The server currently running was started this way.

In place of browser evidence, the review is verified two other ways:

- **Component verification** — `tests/adminV2/packetIntakeReview.test.tsx` mounts the real component
  with the real packet and drives the real controls: layers switch, reconciliation reads
  "Balanced · 180 of 180 · 97 source → 95 normalized", the artifacts needing a name are marked,
  a fact's evidence drills down to `hosted_form:q1:RESULT_TextField-7`, the refused physician binding
  shows its reason, and accept / form-only / reject / rename / confirm each record against a stable
  id. Ten assertions. This is component-level, not in-app.
- **Vertical certification** — `tests/pos/packetIntakeVertical.test.ts` drives the real builder and
  the real persistence over the real corpus (§11).

---

## 3. Wrong-binding repair

**Why it lost the context:** `suggestFieldBinding` is an ordered list of label patterns —
`/\b(phone|telephone|mobile|cell)\b/i → person.phone`. It was never wrong about the *attribute*; it
has no idea *whose* fact it is looking at. Discovery already derives the party from the label before
the concept is built, and that knowledge was simply not carried to the binding.

**The repair is a boundary, not a better regex.** `checkBindingParty` refuses a binding whose party
disagrees with the concept's, and the refusal travels ON the proposal so the operator sees that a
field was found and declined — never mistaken for "nothing matched".

Deliberately asymmetric, as the brief requires: a missing binding costs one decision; a false one
writes a stranger onto a family's record and looks correct doing it.

Refused on the real packet:

| fact | matched | refused because |
|---|---|---|
| Primary Physician Phone Number | `person.phone` | Alloy has no canonical field for a physician |
| Dentist Phone Number | `person.phone` | same |
| Mailing / Secondary Parent Address | `customer.address` | the label names the guardian; that field is the household's |

Redirected to something better:

| fact | was | now |
|---|---|---|
| Parent/Guardian phone | `person.phone` | `guardian.guardian_phone` |
| Parent/Guardian email | `person.email` | `guardian.guardian_email` |

**Negative controls** — `tests/pos/bindingSafety.test.ts`, 14 assertions covering all four pairs the
brief named, plus a fifth the packet exposed: a bare `City:` / `State:` / `Zip` is refused for the
household address whatever party is derived, because one component of an address never says whose.

Result: **11 proposals → 8 safe + 3 refused.**

---

## 4. G7 — name composition · **doctrine exists; storage is the missing primitive**

The repository already has a settled composition owner, and it was not `child.middle_name`:

- `NameRepresentation = "full_name" | "first_last" | "first_middle_last"` — the operator's choice
  during review;
- `expandQuestionsForDraftSave` expands it into the registered split fields;
- `child_first_name` / `child_last_name` carry a `shared_value_key`, and `packetFieldPlan` dedupes on
  `shared_value_key` **first**, which is the ask-once identity.

So the required outcome — one representation populating both a "Full name" destination and a
First/Middle/Last triple without asking twice — needed only the middle name to join that identity.
It now carries `shared_value_key: "child_middle_name"`, so a middle name given on one artifact
populates every other artifact that asks for it.

**The narrowest missing primitive is durable storage, not composition.** `child_middle_name` has no
canonical field behind it, so the value is shared across the packet but not written to a record.
Creating that field is Field System vocabulary work, which this slice was told not to do — it is a
Slice 4 question, and a small one now that the composition is answered.

---

## 5. Choice preservation

`FormSchemaV1` already had `select` / `multiselect` with `static_options`. The degradation was
entirely in the draft: `DraftFormFieldType` had no choice type, so every closed choice became free
text between extraction and publish.

```
source extraction → draft → discovery → operator review → Form schema
   options ✅        ✅ now     ✅          ✅              ✅ static_options
```

- 5 choices on the hosted form draft as choices, with the source's own options.
- A choice **without** declared options stays text and warns — options are never invented.
- AcroForm `Ch` widgets now have their option lists read too (the CIS declares none).
- Non-choice fields are untouched: 95 destinations, 3 signatures, the rest text.

---

## 6. Lineage model

`SourceRef.destinations: SourceDestinationRef[]` — added because labels are not identity.

```
fact / obligation
  └─ destination
       ├─ evidence            "hosted_form:q1:RESULT_TextField-7" · "pdf_field:Signature1"
       ├─ label               display evidence only
       ├─ page
       ├─ section_title
       └─ logical_artifact_id stamped by the packet composer
```

`guardian.name` traces to four controls across three logical artifacts. Two of them are both labelled
"Parent Name:" and remain distinct, which is the case a label-keyed lineage cannot handle. The packet
composer also resolves artifact ownership from lineage first and labels only as a fallback.

---

## 7. G9 validation matrix

| source semantic | hosted form | AcroForm | layout | draft | Form schema | status |
|---|---|---|---|---|---|---|
| requiredness | ✅ 79/79 exact | ✅ widget flag (CIS sets none) | ⚠ heuristic | ✅ | ✅ `required` | **survives** |
| type | ✅ | ✅ | ⚠ inferred | ✅ | ✅ | **survives** |
| allowed choices | ✅ declared | ✅ `Ch` options | ⚠ | ✅ | ✅ `static_options` | **survives** (fixed this slice) |
| max / min length | ✅ `maxlength` (4 controls) | ✅ `maxLen` (CIS sets none) | ❌ | ✅ | ✅ `validate` | **survives** (fixed this slice) |
| pattern, min, max | ✅ read if declared (none here) | ❌ not exposed by pdf.js | ❌ | ✅ | ✅ `validate` | **survives where declared** |
| conditional gates | ❌ none declared in the capture | ❌ | ⚠ label heuristic only | ❌ | ✅ `visibility` | **LOST — see below** |
| collection constraints | ⚠ instances observed | ⚠ instances observed | ❌ | ❌ | ✅ `repeat` min/max | **LOST** |
| signature requirement | ✅ | ✅ | ✅ | ✅ | ✅ | **survives** |
| acknowledgement | ✅ clause-level | ✅ | ✅ | ⚠ static text | ✅ `text_block` | **partial** — preserved as content, not as a requirement construct |
| upload / evidence | ✅ | ✅ | ✅ prose | ✅ `file_ref` | ✅ | **survives** |

Two honest losses, neither silently:

- **Conditional gates.** The packet's conditionality is written in prose ("If yes, please explain"),
  not declared: the Formsite capture contains **no conditional logic at all**. Nothing is extracted,
  so nothing is claimed. The schema construct (`visibility.all`) is ready when a source declares one.
- **Collection constraints.** Instance counts are observed (5 doses, 8 rows, 3 emergency contacts)
  but no min/max is emitted, because the source states a layout rather than a rule.

**No imported configuration claims fidelity it lost** — a lost semantic is either absent from the
draft or carried in a warning, never approximated.

---

## 8. Reviewed packet metrics

```
raw source destinations              182
normalized destinations              180   (accounted 180, orphaned 0)
unique semantic facts                 86
unique obligations                    32   (6 signatures, all artifact-scoped and dated)
collections recognized                14   covering 80 destinations
SAFE canonical proposals               8
REFUSED unsafe proposals               3
unbound facts                         78
```

### Provisional participant workload by section

| section | facts | destinations | bound | collections |
|---|---:|---:|---:|---:|
| About your child | 7 | 15 | 3 | 0 |
| Family & contact | 7 | 16 | 3 | 0 |
| Emergency contacts | 1 | 13 | 0 | 1 |
| Health & medical | 15 | 15 | 2 | 0 |
| Immunization | 15 | 69 | 0 | 13 |
| Daily routines | 12 | 12 | 0 | 0 |
| Getting to know your child | 13 | 13 | 0 | 0 |
| Custody & legal | 3 | 3 | 0 | 0 |
| Tuition & payment | 6 | 6 | 0 | 0 |
| Review & sign | 6 | 6 | 0 | 0 |
| Org / system | 1 | 1 | 0 | 0 |
| **total** | **86** | **169** | **8** | **14** |

No conversation UI was built for this.

---

## 9. Updated A–F

`slice-3-classification.mjs`, checked against measured keys — 78 keys, 78 classified, exact partition.

| | bucket | Slice 2 | Slice 3 |
|---|---|---:|---:|
| A | existing canonical — binding missing | 11 | **12** |
| B | new reusable domain fact | 34 | **36** |
| C | process / participant-runtime | 3 | 3 |
| D | artifact-specific | 1 | 1 |
| E | structured collection member | 15 | 15 |
| F | owned elsewhere | 11 | 11 |
| | **total unbound** | **75** | **78** |

One cause: the three refused bindings. The physician's and dentist's phones become B (a provider
needs a canonical home); the guardian's address becomes A (`person.secondary_address_*` exists, so the
refusal was right and the field it should bind to is already there). **The denominator got more
honest, not bigger.**

---

## 10. Certification

`tests/pos/packetIntakeVertical.test.ts` (13) · `tests/pos/packetReviewSafety.test.ts` (21) ·
`tests/pos/bindingSafety.test.ts` (14) · `tests/adminV2/packetIntakeReview.test.tsx` (10).

| required proof | how |
|---|---|
| create packet case → attach three sources → run packet_source | one case, three `document` sources, roles `primary`/`related`/`related` |
| all readers execute | layout · acroform · hosted_form, one per source |
| 180 normalized destinations reconcile | 182 raw → 180 → 180 accounted, balanced, 0 duplicated |
| 86 facts + 32 obligations represented | asserted after correlation and obligation merge |
| source lineage available | destination ids, pages, sections, artifact ownership |
| unsafe physician-phone binding refused | 3 refusals, `person.phone` named as the refused target |
| choice semantics survive | draft `select` + schema `static_options` |
| operator reviews proposals | component test drives all four layers |
| review decisions persist in draft/proposal authority | stored under their own metadata key; a re-run leaves them intact |
| **nothing publishes** | one table, two metadata keys, no publish path — with a positive control proving the recorder would catch a write to `form_definitions` |

Existing single-document Processing flows are unchanged: the failing-test list across `tests/pos`,
`tests/forms`, `tests/fields` and `tests/access` is identical to the pre-Slice-1 baseline — 45 before,
45 after, none new, none fixed. Brokered typecheck `rc=0`.

---

## 11. What Slice 4 must resolve before publication

1. **The B-category vocabulary — 36 new reusable facts.** Names, grains, sensitivity (much of it is
   health data), and whether each is durable record data or a form response. This is the decision the
   whole program has been deferring, and the denominator will move again when it lands.
2. **`child_middle_name` needs durable storage.** Composition is answered and the value is shared
   across the packet; the field behind it does not exist.
3. **A physician and a dentist need a canonical home.** Until then their phones are correctly refused
   and correctly unbound — but a real packet cannot publish with a health provider unmodelled.
4. **Applying decisions.** The operator can accept, reject, rebind, mark form-only, confirm and
   rename; nothing consumes those decisions yet. Slice 4 owns the path from an approved packet to a
   draft configuration — and what "approved" means when 78 facts are unbound.
5. **Acknowledgements publish as text, not as requirements.** Clause-level discovery finds 22, and
   `draftFormToFormSchemaV1` emits them as `text_block`. Binding them to the frozen `RequirementType`
   is unbuilt.
6. **Conditional gates and collection constraints.** Both schema constructs exist and no reader emits
   them. For this packet the gates are prose, so the question is whether the operator declares them
   during review.
7. **Which artifact owns a merged obligation.** Six clauses are printed in two artifacts; the packet
   proposes they are one, and nothing decides which artifact carries it.
8. **The browser leg.** Authenticated operator screenshots, once the QA session is signed in.

---

## 12. Reproducing

```
cd docs/audits/active/real-enrollment-certification-v1
node slice-3-classification-check.mjs

cd web
PATH=$HOME/.nvm/versions/node/v22.21.1/bin:$PATH npx vitest run \
  tests/pos/packetIntakeVertical.test.ts \
  tests/pos/packetReviewSafety.test.ts \
  tests/pos/bindingSafety.test.ts \
  tests/adminV2/packetIntakeReview.test.tsx
```
