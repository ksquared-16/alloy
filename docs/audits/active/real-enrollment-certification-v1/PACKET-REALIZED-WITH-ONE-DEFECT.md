# The live packet exists — and it is missing its four document requirements. Do not approve it yet.

Decisions persisted, six Forms published, one packet with six ordered items created in the
certification tenant. **One material defect found while verifying it: 0 of 4 upload requirements
projected.** Reporting before you review, because a Studio pass would otherwise look clean.

Nothing bound to Business Process. No Enrollment started. No safeguarding activated.

---

## 1. Persisted decisions — 33, read back from tenant state

| Disposition | Count | Meaning applied |
|---|---|---|
| `form_only` | **28** | 25 owner-undecided + 2 unsupported time + 1 ambiguous grain — collect during this Enrollment, retain with the process, **no durable canonical field** |
| `accepted` | **3** | safeguarding — collect and propose the interpretation; **nothing activates automatically** |
| `renamed` | **2** | the CIS artifact names |

Stored in `packet_intake_review` (33) alongside the earlier `configuration_discovery_decisions` (50).

**Required results, all met:** unresolved human decisions **0** · false canonical-field proposals
**0** · ownerless concepts **0**.

## 2–5. What was created

**Packet** `39dbb42b-f26c-481a-9b8d-5c3fed9b0143` — *School of Enrichment — Enrollment Packet*
(`school_of_enrichment_enrollment_packet`, active)

| # | Item id | Form definition | Pinned version | Label |
|---|---|---|---|---|
| 0 | `8790bda6…` | `95975659-1914-49b2-ac50-a7ca87aa30df` | `897102e9…` | **Oregon Certificate of Immunization Status** |
| 1 | `e1f8accb…` | `e64e5a1b-7b33-40bc-82ef-3424d913a090` | `a560b5b7…` | **Oregon Nonmedical Exemption** |
| 2 | `c996a89d…` | `f09896f6-b368-4a82-8b74-4b29e86f5e91` | `fdef15e1…` | School of Enrichment Admissions Packet |
| 3 | `b98bfc67…` | `47797d7e-6412-4331-882a-051bbd2faa3b` | `b8f50b15…` | Tuition & Enrollment Agreement |
| 4 | `5d1c48ad…` | `67fb3ea5-d7a1-4bf3-8f12-a30f56f82c3f` | `ae36e7cf…` | Parent Handbook Acknowledgement |
| 5 | `beafebc3…` | `d9cddb9e-b09b-47a2-bc93-4e4e9594fa68` | `660e16e5…` | Direct Payment Authorization |

All six versions are **published** (a draft is not executable), and each item pins its exact version
rather than following latest — a packet that followed latest would silently change what a family
signs.

**Provenance** on every Form: case id, source document id, `checksum_sha256`, logical artifact id,
its sections, and whether it is unsigned. On the packet: all three source documents with hashes and
all six artifact ids. Three distinct hashes across six Forms — several Forms legitimately share a
source, and the document is not duplicated.

## 7. Idempotency

Realization is keyed on **case + document + artifact** and stored on the case, replacing the
one-per-case link that could not express six artifacts. A second run returns the existing packet;
controls prove no duplicate Forms, versions, packet or items. Published versions stay immutable, so a
later analysis change yields a **new version**, never a mutation. No packet versioning added.

## 8. Signature scoping — correct

| Form | Signatures |
|---|---|
| Oregon Certificate of Immunization Status | **2** (independent) |
| Oregon Nonmedical Exemption | 1 |
| School of Enrichment Admissions Packet | **0** — unsigned, still executable |
| Tuition & Enrollment Agreement | 1 |
| Parent Handbook Acknowledgement | 1 |
| Direct Payment Authorization | 1 |

**6/6, exactly the certified 2/1/0/1/1/1.** Each lives in its own Form, so no signature can satisfy
another artifact — the property this whole grain decision existed to protect.

**Nothing else was written:** `customer_member` field definitions still **12** (the pre-existing
seeds — no new canonical fields), `child_safeguarding_restrictions` **0**, `customer_payment_methods`
**0**.

## 🛑 The defect: 0 of 4 upload requirements projected

`file_ref` controls across all six Forms: **0**. There should be **4**.

**Cause.** Clause-level uploads are attached to draft sections by `applyDiscovery`
(`section.clause_uploads = …`), and `draftFormToFormSchemaV1` emits a `file_ref` from them. My
realization builds each artifact's draft straight from the projected structure and **never applies
the approved discovery decisions**, so the approved upload obligations never reach the draft.

**Consequence.** As it stands, this packet would never ask the family for the immunization record —
the same defect class the clause-upload slice was created to fix, reintroduced one layer up.

**Narrowest fix:** the realization must apply the case's approved discovery decisions to each
projected artifact draft before converting it to a schema — reusing `applyDiscovery` exactly as the
single-document path does, filtered to that artifact's sections. Then re-realize: clear the stored
`packet_realization` link, delete the six Forms and the packet, and run again. The service being
idempotent is what makes that safe rather than additive.

I stopped rather than fix-and-re-realize mid-run, because re-realizing writes six Forms and a packet
and I did not want to leave that half-done.

## 10. Packet Studio

`http://127.0.0.1:3014/login` → sidebar **Processing** → **Studio** → **Packets** →
*School of Enrichment — Enrollment Packet*.

**Please look, but do not approve yet.** Order, names, provenance and signature scoping are worth
checking now; the missing uploads are known and will change the Forms.

## State

Permit held. Six Forms, six published versions, one packet, six items in the certification tenant.
No BP binding, no Enrollment, no Participant Runtime, no safeguarding activation, nothing pushed.
