# Phase 2 — Identity-safe Add Child

Records V1 shipped Children **without** Add Child. That was not an oversight and not a
sequencing convenience: the existing child-create path resolved ambiguous identity silently, and
shipping the affordance would have made Records the surface that quietly merged two children.

Phase 2 ships the gate, and therefore the affordance.

## The defect this closes

`findOrCreateChildPersonInOrg` resolved a child in three steps:

1. a child member of the same household with a matching name (and DOB, when supplied)
2. **an org-wide `persons` match on first/last name with `ilike`** — DOB compared only when the
   caller supplied one
3. otherwise, insert a new person

Step 2 is the defect. Two Emma Chens with no date of birth are genuinely indistinguishable, and
the function returned the first row it found with no operator involved and no record that a
choice had been made. Add Staff refuses to guess in exactly this case.

The fix is **not** a better fuzzy match. A better match still auto-resolves. The fix is that the
same gate Add Staff passes through now stands in front of Add Child.

## Three intents, three commands

| Command | What it establishes |
| --- | --- |
| `child.add` | the canonical Child record, in a household |
| Start Enrollment | process participation |
| `create_lead` | acquisition entry for a new prospect family |

A Child may exist in Records with no Opportunity, no enrollment process, no Work Unit and
`person_id = NULL`. Phase 2 fabricates none of those to make Add Child "work".

## What was built

### Workstream A — one shared resolver

`web/lib/identity/resolveIdentityCandidates.ts` — `resolvePersonCandidates(supabase, orgId,
subject)`, where `subject` is `{kind: "person"}` or `{kind: "child"}`. It does two things on top
of the canonical generators (`generatePersonCandidates` / `generateChildCandidates`):

1. decides what counts as a match (`confirmed | strong | possible | weak | conflicted`)
2. refuses to settle the question without an operator

There is no `matched` decision to return. Every non-empty answer is `operator_choice_required`.

`resolveStaffPersonCandidates` is now a projection of that module, kept byte-for-byte at its own
boundary so **Staff is a usable regression control** for the generalization.
`tests/identity/sharedIdentityResolver.test.ts` compares the two answers directly rather than
re-asserting Staff in isolation — a control that only checks itself proves nothing.

### Workstream B/C — the gate, and `child.add`

`web/lib/records/addChildService.ts` is the one identity-safe path. It never calls
`findOrCreateChildPersonInOrg`. Order:

```
resolve household → resolve identity → reuse OR (explicitly) create → member
```

`web/lib/adminV2/actions/definitions/childAddAction.ts` registers it as `child.add` on the
existing command runtime (`actionRegistry` + `capabilityRegistry`, owner `registered_action`).
Records calls `/api/admin/actions/execute`, not a bespoke mutation route.

### Workstream D — the Child identity model, unchanged

`customer_members.id` is the durable child subject. `person_id` is nullable and stays that way.

| Path | `persons` | `customer_members` |
| --- | --- | --- |
| operator reuses an existing member | — | — (already exists; explained, not duplicated) |
| operator reuses an existing person | — (reused) | 1 row, `person_id` set |
| explicit create-new | **none** | 1 row, `person_id = NULL` |

No `persons` row is invented because Records wanted to add a child. In the certification tenant
all ~1500 seeded children have a null person; forcing one would create an identity the platform
never had.

### Workstream E/F/G — the surface

`Records → Children → Add child`, four steps: **household → details → identity review →
confirm**, then a success state offering **Open record**.

The modal collects name and date of birth. It deliberately does not collect requested days,
start date, tour facts, tuition or any commercial term — the certification asserts their
*absence*, because the moment it collects them Add Child has become Create Lead under another
label.

**Start Enrollment is deferred, not forgotten.** The existing participation authority
(`createEnrollmentProcessInstance`) requires a `context_id` that is an **opportunity**. Offering
Start Enrollment from Records would therefore mean creating an Opportunity here — which is
Create Lead, and exactly the boundary this phase exists to hold. Shipping it needs a
participation entry point that does not require an acquisition context; that is a decision, not
an omission.

### Workstream J — the stale write-target declaration

`add_child` declared `opportunity_customer_members` as a write target. The OCM bridge write had
already been removed from the child participation path when `process_instances` became the sole
runtime owner of participation — the declaration outlived the code.

Corrected to `["persons", "customer_members", "process_instances"]`. One live path could still
write the bridge (existing member + `this_opportunity` scope), so the executor now gates that
write on the entry's declared targets. `link_existing_child` still declares the bridge, and
still writes it. Putting OCM back on `add_child` reintroduces the bridge — don't.

## The load-bearing proof

`certification/playwright/records-add-child.cert.spec.ts`.

A certification that only proves "Add Child adds a child" proves nothing about the defect — the
old silent path would pass it. The assertion that discriminates is **Emma Chen with no date of
birth against two indistinguishable people**: both surface, Preview stays disabled until the
operator decides, and the household is unchanged while they decide.

The fixtures are load-bearing in the same way the beyond-page children are. Give either Emma
Chen a DOB, an email or a phone and the ambiguity — and the proof — disappears.

**Negative control:** restore the org-wide `ilike` auto-resolution on the Add Child path and the
ambiguity scenario must fail.
