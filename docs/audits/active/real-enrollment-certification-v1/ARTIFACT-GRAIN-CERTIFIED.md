# Artifact-grain realization — certified. Live packet creation stops on your 31 decisions.

**Nothing created live.** No Forms, no packet, no decision of yours clicked, nothing published.
Permit held. Shared dev untouched.

---

## 1. The projection

`lib/pos/processingCase/structure/structureForArtifact.ts` — three pure functions:

- `structureForArtifact(structure, artifact)` — keeps only the sections the artifact already claimed
- `projectAllArtifacts(structure)` — every artifact of one source, in certified order
- `reconcileArtifactPartition(structure)` — proves the slice **partitions**

It filters certified evidence and nothing else: no bytes re-read, no discovery re-run, no label
reinterpreted, no destination created, no type or ownership changed. Two decisions worth stating:

- **Section order comes from the structure, not the title list.** An artifact's `section_titles` is
  a membership claim; the source's order is the one a family reads.
- **The projected structure carries exactly one `logical_artifact` — itself.** Leaving the full list
  would let a downstream reader segment it again and rediscover siblings that are not in it.

## 2. The six artifacts, in certified order

Read from `packet_intake.artifacts`, not from prose:

| # | Artifact id | Title | Dest | Signatures | |
|---|---|---|---|---|---|
| 1 | `1:page_1` | Page 1 | 49 | **2** | ⚠ `needs_name` |
| 2 | `2:page_2` | Page 2 | 36 | 1 | ⚠ `needs_name` |
| 3 | `1:school_of_enrichment_admissions_packet` | School of Enrichment Admissions Packet | 76 | 0 | **unsigned** |
| 4 | `2:tuition_enrollment_agreement` | Tuition & Enrollment Agreement | 5 | 1 | |
| 5 | `3:parent_handbook_acknowledgement` | Parent Handbook Acknowledgement | 4 | 1 | |
| 6 | `4:direct_payment_authorization` | Direct Payment Authorization | 10 | 1 | |

49 + 36 + 76 + 5 + 4 + 10 = **180**. The artifact partition covers every destination exactly once.

Note the ids restart per document (`1:` appears twice), so any realization identity must include the
**document id** as well as the artifact id.

## 3. CIS naming — **no reliable derivation. Leave `needs_name: true`.**

I looked at what each artifact's own content actually says:

- **Page 1** opens with *"Oregon Certificate of Immunization Status"* — a real leading heading.
- **Page 2** opens with *"Child's last name First name Middle name Birth date…"* — a repeated field
  header row, not a title.

A generic "leading heading names the artifact" rule would therefore name one and produce nonsense for
the other. Worse, the heading it would find on Page 1 names the **document**, and both artifacts come
from that document — so the result reads as though Page 2 is not part of the CIS.

So: **both stay `needs_name: true` and the operator names them in Packet Studio**, which §4 permits
and which is the honest answer. Two content-sourced **suggestions** an operator could accept, offered
as suggestions and deliberately not implemented as an automatic rule:

- Page 1 → *"Oregon Certificate of Immunization Status"* (its own leading line)
- Page 2 → *"Nonmedical exemption"* (its own most distinctive heading)

No Oregon-specific rule was added.

## 4. Certification results — 18 controls on the real corpus, all passing

**Partition**
- every source reconciles: **0 lost, 0 duplicated**
- projected destination count equals source destination count

**Fidelity**
- only claimed sections kept; **0 missing sections**
- source section order preserved
- **not one field changed** — same labels, same types
- each projection carries exactly one artifact identity

**Six Forms, artifact-scoped**
- 6 artifacts → 6 Forms
- **no two artifacts share a signature identity**
- Tuition ≠ Handbook ≠ ACH, proven pairwise
- CIS Page 1's **two signatures stay independent** within their own artifact
- acknowledgements keep distinct identities even where labels collide
- static/legal content never becomes a participant information need

**Unsigned collection artifact**
- present, 76 destinations, **0 signature requirements**, and still a Form with real fields and real
  requirements. *Unsigned* means nothing signs it — not that nothing is collected by it.

**Ask-once after splitting**
- the same canonical fact reached from several artifacts collapses to one `canonicalKeyFor` key
- unbound, artifact-specific answers stay artifact-specific

## 5. Idempotency — the existing doctrine, and the one thing it constrains

`createFormFromCaseDraft` is already idempotent: it stores a creation link in **case metadata** and
returns the existing form on repeat calls (`alreadyCreated: true`), never a duplicate.

**But the link is one-per-case**, and artifact grain needs six. That is exactly the *"refactor only
enough to let it receive the projected artifact draft explicitly"* your §2 allows: the link becomes
keyed by `document_id + artifact_id` instead of by case. Nothing else about the writer, validation or
versioning owner changes.

**If the analysis changes after publication:** published versions are immutable —
`configuration_publication_immutable_guard` enforces it — so the safe existing behavior is a **new
version**, never mutation of a published one. No packet versioning is needed or added.

## 6. Live-case readiness — **not ready. Stopping.**

Case `89caf3ec-2c3d-4286-a022-524bdaad16a8`:

- 50 decisions persisted ✅
- **31 decisions unresolved** — yours
- no Forms created, no packet created

Per §10 I stopped rather than create live Forms or a packet from unresolved state, and I did not
click any of your decisions.

### The browser, with the corrected review

`http://127.0.0.1:3014/login` as `qa.operator@northwind.invalid` (password in the mode-600 file) →
sidebar **Processing** → **Recent work** → `school-of-enrichment-family-handbook.pdf`. It is the only
active case and now opens directly on **Packet review**.

Your **31** remaining decisions: 25 owner-undecided · 3 sensitive restrictions · 2 unsupported type ·
1 ambiguous grain. None blocks publication. Medication and other Health-held facts remain
collectible — they read *"Asked during enrollment. Health & Safety keeps the ongoing record."*

## 7. Exact next operator action

1. Complete the **31** decisions in Packet review.
2. Name the **two CIS artifacts** (suggestions above) — the item label is what a parent sees.
3. Then I build `createPacketFromProcessingAnalysis` on the certified projection: 6 Forms → 6 pinned
   versions → 1 packet → 6 ordered items, with case id, all three source ids and hashes, and the six
   artifact ids as provenance.

## State

Permit held. Zero live Forms or packets. Nothing published. Branch clean; typecheck green; zero new
test failures.
