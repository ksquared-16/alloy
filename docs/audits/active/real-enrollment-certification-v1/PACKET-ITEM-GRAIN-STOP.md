# STOP at §5 — the packet item grain. Preconditions are green; building now would ship a broken packet.

**Nothing created. No Forms, no packet, no decisions of yours clicked, nothing published.**

§5 told me to stop here if producing six packet artifacts requires changing the Form realization
ownership model. It does, and the reason is worse than coarseness.

---

## §1 — Preconditions, all green

| Check | Result |
|---|---|
| One case, three sources | ✅ `89caf3ec-2c3d-4286-a022-524bdaad16a8` |
| Hashes match the corpus | ✅ `feb7ee80…` · `cda2af9f…` · `10c05372…` |
| Durable packet analysis exists | ✅ in `metadata.packet_intake` |
| Per-source analysis exists | ✅ 3 entries in `source_analysis` |
| Destinations | ✅ **180** |
| Fact concepts / correlated | ✅ **89** / 3 correlations → **86** |
| Obligations | ✅ **32** (22 acknowledgement · 4 upload · 6 signature) |
| Artifacts | ✅ **6** |
| Signatures | ✅ **6** |
| Upload obligations | ✅ **4** |
| False canonical-field proposals | ✅ **0** |
| Ownerless concepts | ✅ **0** |

## §5 — The required investigation, answered

**Form realization today is per SOURCE, not per artifact.**

- `createFormFromCaseDraft` reads the case's single `form_draft_preview`.
- `buildFormDraftFromStructure(structure)` takes one source's structure and returns one draft.
- Nothing anywhere slices a structure down to one artifact's sections.
- There is **no durable artifact entity** — artifacts exist only inside `packet_intake.artifacts`.

`LogicalArtifact` does carry what a slice would need — `section_titles[]`, `destination_ids[]`,
`signature_ids[]`, `unsigned` — so the information exists. The function does not.

## Why a 3-item packet would not merely be coarse — it would break a certified invariant

The six artifacts carry their signatures like this:

| Artifact | Destinations | Signatures |
|---|---|---|
| CIS Page 1 | 49 | **2** |
| CIS Page 2 | 36 | **1** |
| Admissions Packet (collection) | 76 | 0 · `unsigned: true` |
| Tuition & Enrollment Agreement | 5 | **1** |
| Parent Handbook Acknowledgement | 4 | **1** |
| Direct Payment Authorization | 10 | **1** |

Collapse those to one item per source and you get **one CIS form carrying 3 signatures and one
Formsite form carrying 3** — which means a single signature would satisfy the Tuition Agreement, the
Handbook Acknowledgement **and** the ACH Authorization at once.

That is the exact failure your §9 asks for a control against, and it is the invariant Slice 2
established in the same words: *a signature on the Tuition Agreement must not satisfy the Handbook
Acknowledgement or ACH Authorization.* Building the 3-item packet would ship a packet that lets one
signature execute three agreements — a legal defect, not a modelling preference.

**So the artifact boundary is not presentation. It is what scopes a signature.**

## The exact bounded gap

> **The packet item grain must be the logical ARTIFACT, and Form realization is per SOURCE.
> Nothing produces a Form per artifact, and no durable artifact entity exists.**

### Smallest fix, for your decision — not built

One pure function, then the existing chain runs unchanged:

```
structureForArtifact(structure, artifact)   // keep only sections in artifact.section_titles
  → buildFormDraftFromStructure   (unchanged)
  → draftFormToFormSchemaV1       (unchanged)
  → createFormFromCaseDraft path  (unchanged, idempotent)
  → one form_packet_items row per artifact, in artifact order
```

The artifact already names its sections, destinations and signatures, so the slice is a filter rather
than a re-interpretation. But it does change what a Form *is* — today "this document's form", after
this "this artifact's form" — which is the ownership change §5 said to stop for.

**Two things follow that you should weigh:**

1. **Six artifacts, but one is unsigned** — the Admissions Packet collection artifact (76
   destinations, no signature). It is still an executable artifact: it collects. So the packet is 6
   items, not 5.
2. **Two artifacts still need names.** CIS Page 1 and Page 2 are `needs_name: true` — Slice 2
   deliberately refused to treat a page number as durable artifact identity. Those names are operator
   decisions, and they belong in the review before packet creation, because the packet item's label is
   what a parent sees.

## §2 — Readiness predicate, stated while I was here

Configuration generation should require, from existing semantics:

- **safe/system decisions** — `isBulkAcceptSafe` — may be auto-accepted (50 already are);
- **explicit operator decisions** — the remaining **31**, unresolved;
- **held, intentionally process-scoped** — still produce participant controls; *held never means not
  collected*;
- **ignored** — produce no configuration;
- **unresolved human decisions** — block generation.

**31 remain unresolved, so the live case is not ready to create regardless of the grain question.**

## Answers to your eight closing questions

1. **Service added/reused** — none added. Stopped before implementing, per §5.
2. **Form-per-source vs per-artifact** — **per source, today.** Per artifact is required.
3. **Packet item grain** — must be the **logical artifact**: 6 items, one unsigned.
4. **Idempotency** — not implemented; the existing `createFormFromCaseDraft` is already idempotent
   and would be reused unchanged.
5. **Provenance** — available and unused: case id, source document ids, `checksum_sha256` (now
   populated), artifact ids. `form_packet_definitions.metadata` is the existing carrier.
6. **Certification tests** — none added; there is nothing yet to certify.
7. **Live case ready?** — **No**, twice over: the grain gap, and 31 unresolved decisions.
8. **Next operator action** — decide the grain fix, then complete the 31 decisions.

## State

Permit held. Nothing created or published. Shared dev untouched. Branch clean.
