# The real parent run — baseline captured, and the defects are not where they look

**Run:** `erun_bb647c56344f36e9` · **Nothing mutated** · Session preserved · **STOP at §15**

## 0. The finding that changes this slice

Most of what you saw is **not Participant Runtime presentation**. The runtime is faithfully rendering
what the **published Form versions already contain**.

That matters because §15 forbids changing the five certified Form versions *"unless an actual Form
projection defect requires a new immutable version and is explicitly proven."* It is now proven — so
the decision is yours, not mine, and I stopped rather than cutting new versions unilaterally.

## 1. Live baseline (captured before touching anything)

**Session `b25caf02-…`** — `in_progress`, `current_sequence_index: 0`, item 0 active with a **draft**
submission `a63494c1`, four items `pending`. **Zero submitted submissions.** Certified versions still
resolved on all five items.

**Eight canonical/shared values written by your turns:**

```
person:email             "j@g.com"
person:phone             1231231234          ← stored as a NUMBER, not a string
child_first_name         "Certification"
guardian_first_name      "Terry"
customer:address         "123 Main Street, Bend, OR 97701"
customer_member:dob      "2021-04-12"
customer_member:allergies      "None"
customer_member:medical_notes  "None"
```

Both grains are present and correct in the data: `person:*` for the responding guardian,
`customer_member:*` and `child_first_name` for the child.

## 2. Subject grammar — the data was right, the copy chose wrong

*"What is Certification's Phone Number"* asked a **person-grain** question (`person:phone`, the
responding guardian) using the **child's** name. The runtime had `guardian_first_name: "Terry"` in
the same shared-value bag at the same moment.

So this is a copy/subject-selection defect in the runtime, **fixable without touching Forms** — the
grain truth it needs is already sitting beside it.

## 3. 🛑 Labels — baked into the published Forms, not the runtime

The certified CIS version's own `schema_json.fields` are the raw importer labels:

```
"Childs Last Name Apellido Delde La Menor Row1"
"Phone Number NúMero De TeléFono Row1"
"Dose 5 Dosis 5 Tdap"
```

Across the five certified Forms: **173 participant fields, 63 carrying importer/bilingual noise.**

| Form | fields | noisy labels |
|---|---|---|
| Oregon CIS | 50 | **43** |
| Nonmedical Exemption | 38 | **20** |
| Admissions Packet | 76 | 0 |
| Tuition Agreement | 5 | 0 |
| Handbook Acknowledgement | 4 | 0 |

**No amount of runtime work fixes this.** The label is the Form's. Repair means re-projecting the
Forms and publishing **new immutable versions** — the §15 decision.

## 4. 🛑 The CIS immunization grid — same cause

You were never asked for immunization history, yet the dose grid appears editable. The reason is not
that the runtime projected artifact destinations into review. **The published CIS Form contains 41
text fields, and the whole `Dose 1…5 × DTaP/Tdap/Polio/MMR/HepB/HepA/Hib` grid is among them** as
independent participant text questions.

So the answer to §8's question is: **the runtime is not incorrectly projecting anything — the Form
already asks for it.** `buildFormDraftFromStructure` turned every source destination into a
participant field at realization time.

The intended paths you list (canonical facts · uploaded record → extraction · structured entry ·
exemption) are all downstream of a Form that should not have asked field-by-field in the first place.

## 5. Phone — a storage-shape defect, not just display

`person:phone` is stored as the **number** `1231231234`. A formatter cannot help a value that is not
a string, and the CIS field it feeds is itself `type: "number"`. Canonical phone semantics are being
lost at write time, not only at render time.

## 6. Review — the certified renderer exists and is not being used

`lib/forms/pdf/generation/fidelityEngine.ts` and `persistSignedEnrollmentArtifact.ts` exist. **No
participant review code references them.** So §10's premise is right: there is an already-certified
fidelity path, and review is rendering a generic form instead of calling it. That one *is* a runtime
wiring defect and does not need new Form versions.

## 7. What this slice actually is

| Defect | Fixable in runtime alone? |
|---|---|
| §2 subject grammar | ✅ yes |
| §4 phone (write + display) | ✅ yes |
| §5 one response model | ✅ yes |
| §6 semantic shortcuts | ✅ yes |
| §9 completion → preparing → review | ✅ yes |
| §10 real-artifact review | ✅ yes — wire the existing fidelity engine |
| §11 page navigation | ✅ yes (follows §10) |
| §13 visual hierarchy | ✅ yes |
| **§3 participant labels** | ❌ **needs new Form versions** |
| **§8 immunization grid** | ❌ **needs new Form versions** |
| §7 language | needs a localization audit; deferred here |

## 8. 🛑 Why I stopped

Cutting new versions of the five certified Forms would invalidate the version pins in Revision 1's
derived packet, the Studio packet, and the live session's five resolved versions. That is a
consequential act at the end of a long chain of certified proofs, and §15 reserves it for an explicit
decision with proof. **The proof is above; the decision is yours.**

I also did not start the eight runtime-only repairs, because doing half of a twelve-part experience
change without browser verification is how the last two wrong click-paths happened — and several of
them (response model, review mode, page navigation) are only meaningfully verifiable by using them.

## 9. What I recommend

1. **Authorize a Form re-projection slice** — fix `buildFormDraftFromStructure` so a source
   destination becomes a participant question only when it should be one, and participant labels come
   from the semantic concept rather than the OCR string. Re-realize, publish new versions, re-pin.
   This is the root of §3, §8 and most of §10's ugliness.
2. **Then** the runtime experience slice (§2, §4, §5, §6, §9, §10, §11, §13) against clean Forms.
3. **§7 language** last, after the label owner exists — translating OCR strings would be inventing a
   parallel system.

Doing the runtime slice first would polish a conversation that is still asking for fifty raw fields.

## 10. Untouched

Session, submission draft, Revision 1, the five Form versions, the Studio packet, Financials,
safeguarding — all untouched. No new QA link minted, because the acceptance run it exists for cannot
pass until the above is decided.
