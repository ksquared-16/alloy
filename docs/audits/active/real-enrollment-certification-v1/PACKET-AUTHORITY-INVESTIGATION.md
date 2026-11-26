# Who owns the executable packet? — evidence, mapping, and verdict

**Verdict: B.** The Packet model exists, the runtime already consumes it rather than Processing
metadata, and the data model needs **no change**. One bounded *service* capability is missing, named
precisely below.

Nothing published. No decision of yours clicked. No packet created.

---

## §1 — The eight questions, answered from the schema

**1. What represents a durable packet definition?**
`form_packet_definitions` — org-scoped, `key` unique per org, `name`, `description`, `metadata`,
`is_active`. Comment: *"Org-scoped multi-form packet template (ordered items)."*

**2. Where are steps / artifacts / order stored?**
`form_packet_items` — `sequence_index` (0-based, `UNIQUE (packet_definition_id, sequence_index)`,
`CHECK >= 0`), `form_definition_id`, and `pinned_form_definition_version_id`. Order is first-class.

**3. Where does Packet Composer / Studio persist?**
`/api/admin/forms/packet-definitions` and `…/[packetDefId]/items` (plus `/public-links`). The
Processing-side handoff already exists too: `lib/pos/packet/createParentPacketFromTemplate.ts`.

**4. What consumes `packetDefinitionId`?**
It is a `form_packet_definitions.id`. `form_packet_sessions.packet_definition_id` carries it;
`loadPacketProjection` reads the definition + its items and projects participant requirements from
the **published Form schemas** those items point at.

**5. How are packets versioned/published?**
**They are not.** Versioning lives on the *form* (`form_definition_versions`), and each packet item
either **pins** a version or follows the latest (`pinned = null`). A packet has only `is_active`.

**6. Can a packet reference several forms?** **Yes** — that is exactly what `form_packet_items` is.

**7. Draft/published distinction?** On **forms**, yes (`createFormFromCaseDraft` makes an
*unpublished* draft version). On **packets**, no.

**8. Does Business Process point at forms or packets?**
At the **packet**. Requirements are then enumerated per
`RequirementRef { form_definition_id, section_id?, field_id? }`, and responsibility rules live in
`form_packet_definitions.metadata`. So the chain is packet → items → forms → requirements.

### The doctrine you asked me to codify is already true in the runtime

`loadPacketProjection` reads `form_packet_definitions` + `form_packet_items` + published form
schemas. It reads **neither** `configuration_discovery_decisions` **nor** `packet_intake_review`.
Processing review metadata is already not the runtime authority — which also settles last run's open
question: **neither Processing decision store is the packet owner, so no precedence rule between
them is needed at runtime.** They are evidence and proposal; the packet is the configuration.

## §4 — The mapping, with the owner each row writes

| Processing concept | Packet configuration object | Canonical owner written |
|---|---|---|
| source artifact | packet step | `form_packet_items` (`sequence_index`) |
| source Form definition | the step's form | `form_packet_items.form_definition_id` (+ optional pinned version) |
| artifact order | step order | `form_packet_items.sequence_index` |
| clause upload obligation | executable upload requirement | `file_ref` field in the form schema → `upload` requirement *(shipped: clause-level projection)* |
| acknowledgement | artifact-scoped acknowledgement | `boolean` field in the form schema → `acknowledgement` requirement |
| signature | artifact-scoped signature + placement | `signature` field in the form schema → `signature` requirement |
| static / legal content | artifact content | `text_block` field → `static_content` requirement |
| correlated semantic fact | asked once across the packet | `shared_value_key` on the field source (`packetFieldPlan` dedupes) |
| responsibility (who must act) | per-requirement rule | `form_packet_definitions.metadata` responsibility rules |
| ignored / held concept | **no executable configuration** | nothing written — held rows carry no `proposed_field` |

**Every row has an existing owner. No mapping needs a new durable authority.**

## §8 — Verdict **B**, and the exact missing capability

> **Nothing in Alloy turns an approved *multi-source* packet analysis into N form definitions and one
> packet definition with N ordered items.** Both halves exist, and both are single-artifact:
>
> - `createFormFromCaseDraft` builds **one** form from the case's single-document
>   `form_draft_preview`. The packet analysis instead holds a per-source draft under
>   `packet_intake.source_analysis[documentId]`, and nothing consumes those.
> - `createParentPacketFromTemplate` builds a packet from **one** form — it inserts exactly one
>   `form_packet_items` row at `sequence_index: 0`.

That is the whole gap. It is a service extension, not a model change:

**Smallest extension** — one function, `createPacketFromProcessingAnalysis(caseId)`, that:
1. for each source in `packet_intake.sources`, builds a form draft from that source's analysis and
   creates a form definition through `createFormFromCaseDraft`'s existing path (idempotent, so a
   re-run returns the existing form rather than a duplicate);
2. creates one `form_packet_definitions` row with `metadata.created_via = "pos_packet_from_analysis"`
   plus the source document ids and hashes as provenance;
3. inserts one `form_packet_items` row per source, in the analysis's artifact order;
4. carries responsibility rules into the packet metadata.

It reuses both existing services and writes only existing tables. No new import pipeline, no new
packet system, no new authority.

### One secondary observation, for you rather than for me

**Packets have no publish/version state of their own** — only `is_active`, with versioning delegated
to the forms their items pin. Your §7B says *"Packet publish/version"*. Today that means *publish the
forms and pin them*, which works and is what the runtime reads. If you want a packet-level published
revision, that is a Director-sized decision and I have not assumed it; the certification does not
need it.

## §5 — What happens to the current certification case

Nothing is discarded. Case `89caf3ec-2c3d-4286-a022-524bdaad16a8` — three sources, 180 destinations,
89 source-level facts / 86 correlated, 32 obligations, six logical artifacts, six signatures, four
upload obligations — is the **Processing evidence and proposal**. Your 31 remaining decisions are
real configuration decisions and feed the proposed packet. What changes is only that the durable
result of them is a Packet draft in Studio, not the review metadata itself.

## Recommendation

Proceed with the bounded extension above, then the flow becomes:
import → analyse as one packet → review only what Alloy cannot decide → **Create packet** →
Studio → Packets shows what the packet will actually do → publish there.

Say go and I will implement it narrowly.

## State

Permit held. No packet created, no configuration published, no decision of yours clicked, shared dev
untouched. Branch clean.
