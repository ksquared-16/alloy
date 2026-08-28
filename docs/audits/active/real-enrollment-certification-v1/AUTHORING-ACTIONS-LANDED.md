# The two authoring actions — landed, and the one step left

**Run:** `erun_ff87d8eebef2b479` · **§1–§5 complete** · **§6–§9 blocked on one thing: an operator session**

## 1. What was implemented

Two actions on the **existing** `PATCH /api/admin/departments/{departmentId}/lifecycle-builder`,
inside the same switch, behind the same guards. No second store, no second endpoint, no second
publication path, no second validator.

**`set_process_entry_point`** — `{ process_id, intent, stage_key }`

* Merges into `entry_points_v1.by_intent`; every other authored mapping is preserved, because two
  intents are independent statements and authoring one must not retract the other.
* Refuses an unknown intent (`isProcessEntryIntent`), an unknown process (404), and a stage that is
  not an **active** stage of that process — active, not merely present, so the operator hears it now
  rather than at publication, where the same rule already lives.
* The stage is never inferred.
* Removal was **not** invented: the route has no nullable/remove convention to follow, so this slice
  does not add one.

**`set_stage_requirements`** — `{ process_id, stage_key, requirements[] }`

* **Replaces** the section for exactly one stage. Row-merging would make removal inexpressible.
* Sets it unconditionally, so an authored `[]` stays distinct from absent — the D-90 difference
  between *"canonical requires nothing"* and *"canonical is silent and the legacy projection still
  answers"*. Collapsing them would silently switch which authority a stage has.
* Validates through `parseStageRequirementsV1` and `isAuthorableRequirementKind`, and reports the
  platform's own reason string when a kind is not yet authorable.

**One asymmetry the route had to correct.** The canonical parser *skips* a row it cannot read — right
for reading stored configuration, wrong for authoring: accepting four of five would tell an operator
their fifth requirement exists when it does not. The action compares counts and refuses.

## 2. Authorization

Both actions live inside the same `PATCH`, after the same `getAdminContextCached` → `role === "admin"`
→ `departmentIdAllowed` chain. There is no second handler and no certification bypass; the file
exports exactly `GET` and `PATCH`. Refusals proven: unknown intent, unknown process (404), unknown
stage (404), inactive entry stage (400), unauthorable kind (400), unreadable row (400), non-array
requirements (400).

## 3. Controls — 20, and two of my own mistakes worth recording

Round-trip: entry point survives save→parse→serialize; requirements survive exactly and in authored
order; authored `[]` stays authored-empty and does **not** resurrect legacy requirements; replacing
removes; exactly one stage is touched; `description` survives; unknown fields survive; and a control
that a draft neither action touched serializes byte-identically — so normalization was not widened.

Two test-authoring errors, both caught by the controls failing:

* **Unknown fields ride a symbol-keyed residue** and are spread back into plain keys only at
  serialize time. Asserting on the parsed record read as data loss that was not there; the assertion
  has to read the payload.
* The auth-order assertions had to be **scoped to the PATCH body**. An unscoped `indexOf` finds the
  `GET` handler's guards and passes vacuously.

Lifecycle failing-test list unchanged at **84 pre-existing, 0 newly broken**. Route-capability ratchet
green (91 passed). `typecheck:tests` rc=0.

## 4. Operator surface

None built. There is no BP configuration UI with a natural insertion point for these — the
lifecycle-builder UI has no requirements or entry-point control to widen. Per §5, API authorability
through the canonical route clears the blocker, and a Studio surface is not part of this slice.

## 5. 🛑 What is blocked, and why it is not the sandbox

§6 requires authoring **through the new actions**, which means a real HTTP `PATCH` — and that needs an
authenticated admin session. `getAdminContext` resolves purely from the Supabase cookie session; there
is no dev bypass, no service header, no local exemption. This lane has already proven it cannot obtain
one: the toolkit states *"Manual login only — toolkit does not store passwords"*, the rotated QA
credential is deliberately not held here, and a credential-free session mint was refused by the
sandbox classifier and not routed around.

So the sole remaining blocker for the whole configuration program is **one operator sign-in** — the
same blocker as the still-owed browser verification.

## 6. Pre-verified: exactly what those calls will produce

Computed with the same helpers the route calls, against the live draft. **Nothing was written.**

Tenant re-proven unchanged first: draft `fa0b9c36` · `draft_revision` 1 · revisions **0** ·
instances **0** · `entry_points_v1` null · `requirements_v1` absent on all 8 stages.

Guards pre-run: intent known ✅ · 5/5 rows readable ✅ · all kinds authorable ✅.

Resulting stored diff — **16 lines, 2 authorized + 14 already-documented normalization**:

```
AUTHORIZED
  processes[0].entry_points_v1              = { enrollment_start: "enrolling" }
  processes[0].stages[5].requirements_v1    = 5 requirements   (stages[5] is `enrolling`)

NORMALIZATION (the same 14 as before)
  manual_status_transition_policy_v1 defaults · 9 outcome flags · 3 catch-all compat_queue_key strips
```

* process `description` **preserved** — the repair holds through the new actions;
* five requirements, ids `cert_v1_form_1…5`, all `kind: form`, all
  `required · record · stage_exit · blocking`;
* **no other stage** has `requirements_v1`; no Direct Payment Authorization; no `create_lead` mapping.

## 7. The exact operator action

Sign in at `http://127.0.0.1:3014/login` (IP literal — the cookie is scoped to it), then run this in
the browser console. It uses your own session; nothing is shared.

```js
const D = "00000000-0000-4000-8000-000000000020";
const P = "00000000-0000-4000-8000-000000000021";
const F = ["17bc2de8-0f83-48a6-aabc-bcd72725bce8","9a86ec71-e589-41d8-bd09-617dfe23d0d8",
           "5eb82c56-9459-42d9-a17d-725f2f6b0b19","3f682c60-6e7c-4b41-a3cb-64f35c1a6d94",
           "34a5ced4-ecc3-41ae-8dc5-9f54bd29694b"];
const patch = (b) => fetch(`/api/admin/departments/${D}/lifecycle-builder`,
  { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
    body: JSON.stringify(b) }).then(r => r.json().then(j => ({ status: r.status, j })));

await patch({ action: "set_process_entry_point", process_id: P,
              intent: "enrollment_start", stage_key: "enrolling" });

await patch({ action: "set_stage_requirements", process_id: P, stage_key: "enrolling",
  requirements: F.map((form_definition_id, i) => ({
    requirement_id: `cert_v1_form_${i + 1}`, kind: "form", form_definition_id,
    level: "required", scope: "record", timing: "stage_exit", enforcement: "blocking" })) });

await fetch("/api/admin/business-process/configuration/publish",
  { method: "POST", credentials: "include", headers: { "content-type": "application/json" },
    body: JSON.stringify({ department_id: D }) }).then(r => r.json());
```

`draft_revision` is optional on publish, so no token juggling is needed. The publish route validates
and refuses on its own if anything is wrong.

Tell me when it has run and I will do §7–§9 from tenant state: the stored-draft diff, revision 1, the
requirement-derived packet proof against Studio packet `579327c1`, and the readiness verdict.

## 8. Everything else stands

Entry stage `enrolling`; the five Form identities in certified order; dimensions
`required · record · stage_exit · blocking`; the derived packet already proven semantically identical
to the Studio packet — 5 forms, same order, same identities, 3 uploads, 5 signatures, 0 bank-credential
asks, zero drift; Financials deferred and non-blocking.

**Configuration readiness: NO — pending one sign-in.** Everything it depends on is proven.
