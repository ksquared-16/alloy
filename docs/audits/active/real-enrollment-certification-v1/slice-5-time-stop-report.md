# §6 TIME — STOP, and the correction to what Slice 4 reported

**Decision: STOP.** A `time` field type is not implementable *once*. It is implementable in seven
places, three of which fail silently if you miss them.

## Correction first

Slice 4 said the TIME primitive "does not exist." That was true of `FormSchemaV1` and false of the
repository. `web/lib/workspace/alloyTimeValue.ts` already holds a settled canonical time-of-day
contract:

- **Stored shape**: `HH:mm`, 24-hour, no seconds, no date, no zone.
- **Parse**: `parseAlloyTimeInput` accepts `8:30 AM`, `8:30am`, `0830a`, `14:30`, `830`.
- **Display**: `formatAlloyTimeDisplay` renders `08:30` → `8:30 AM`.
- **Control**: `components/workspace/AlloyTimeInput.tsx`, with operational suggestion times.

So the primitive is not missing. It is **un-adopted**: nothing outside that one input component uses
it, and the Form type system has never heard of it. That is a better problem to have and a different
one to solve, and stating it wrongly would have sent the Health/Forms sprint hunting for a value
contract that already exists.

## What the packet actually needs

Two facts: **bedtime** and **wake time**. Not a schedule, not a date-time, not a range — two
wall-clock times a teacher reads to understand a child's day. `HH:mm` represents both exactly.

## Why it is not one change

| Surface | Add a `time` arm? | If you forget |
|---|---|---|
| `lib/forms/schema.ts` — `FormField` union + Zod discriminated union | required | **fails closed** — the schema will not parse, so the form cannot be saved |
| `lib/forms/formBuilderSchema.ts` — `BuilderFieldType` + spec mapping | required | operator cannot author one |
| `lib/fields/adminFieldTypeList.ts` — `ADMIN_FIELD_TYPES` | required | `field_definitions.field_type` rejects it at the API |
| `lib/forms/validateSubmission.ts` | required | **fails open** — `default: break` accepts any string |
| `components/forms/engine/FormEngineRenderer.tsx` | required | **renders nothing** — `default: return null` produces an invisible required question |
| importer type inference (`buildFormDraftFrom*`, `draftFormToFormSchemaV1`) | required | every imported time question lands as text |
| `lib/enrollment/participantRuntime/validateParticipantCandidate.ts` | required | **fails open** — `default: { ok: true, value }` accepts `"whenever"` as a bedtime |

Three of the seven fail *silently and permissively*. The participant-runtime one is the sharpest: a
`time` type that the runtime does not know is a type that accepts arbitrary strings — which is
precisely the outcome the instruction forbids, reached through the front door rather than by
shortcut.

There is an eighth, quieter surface: **`field_definitions.field_type` has no CHECK constraint and no
enum in any migration.** The database will store `'time'` happily today. The type system's only
enforcement is `ADMIN_FIELD_TYPES` in application code, so a partial rollout is storable, invisible,
and unvalidated. That is worth knowing independently of TIME.

## Why STOP rather than implement

The instruction was: implement once through the canonical type system *if coherently extensible*,
otherwise stop. It is extensible — the value contract exists and the seven edits are each small —
but not *once*, and not from inside Enrollment:

1. **It is a Forms platform change, not an Enrollment change.** A new field type changes what every
   form in every tenant may contain. Enrollment discovering the need does not make Enrollment the
   owner — the same reasoning that sent health facts to the Health sprint.
2. **One required surface is fenced.** Doing it correctly means editing the Participant Runtime
   validator. This program's boundary has held that fence since Slice 4, and the failure mode of
   editing it casually is a runtime that accepts unvalidated participant input.
3. **The cost of waiting is two fields.** Bedtime and wake time stay process-scoped text for
   certification. That is a *typed* concession recorded in §8, not a silent one.

## The narrowest missing primitive

> **`FormSchemaV1` has no `time` field type, and `ADMIN_FIELD_TYPES` has no `time` entry — while a
> canonical `HH:mm` value contract and input control already exist in `lib/workspace/alloyTimeValue.ts`
> and `components/workspace/AlloyTimeInput.tsx`.**
>
> The work is adoption across seven surfaces, three of which fail open. It belongs to a Forms
> platform slice, and it should land with a CHECK constraint on `field_definitions.field_type`, since
> the database currently constrains nothing.

## Interim disposition

Bedtime and wake time are collected as **process-scoped text** for certification. They are
`CAN_REMAIN_PROCESS_SCOPED_FOR_CERTIFICATION` in §8: the parent can answer them, the answers are
readable, and nothing durable claims to be a validated time. No child-profile manifest row is
created for either — a manifest row typed `text` would assert a durable destination for a fact whose
type is still unsettled, and un-asserting it later costs more than waiting.
