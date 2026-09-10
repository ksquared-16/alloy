---
owner: platform
status: sprint
last_reviewed: 2026-09-10
supersedes: []
---

# Access & Identity V2 — Planning

Canonical product-source location for Access & Identity V2 planning artifacts.

These documents were produced and accepted during Vacilando Runtime V1 validation
(Claude execution sessions on mission `msn_e9133cdade883793d2`). They are copied
here for product planning; the originals remain under
`docs/platform/planning/vacilando-os/qa/access-identity-v2/` as runtime certification evidence.

**Do not treat this folder as an active Vacilando mission.** The operator will create
the real Access & Identity V2 mission through Mission Brief after Runtime V1 closeout.

> **These copies are a point-in-time snapshot, and one of them has since diverged.**
> Copies here were taken 2026-08-10. The originals under
> `docs/platform/planning/vacilando-os/qa/access-identity-v2/` kept moving:
> `03-implementation-qa-sequence.md` — the document this README calls the plan of record —
> received eight further execution updates there through **2026-09-06** (W-0 run 4, W-5 third
> issuance, Wave 1 seventh and eighth issuance). The copy in this folder does **not** carry them.
>
> So: read this folder for the accepted product framing, but for the current state of the
> implementation and QA sequence read the original. Reconciling the two copies is outstanding —
> recorded in `docs/audits/active/documentation-truth-audit-2026-09/decisions-required.md`.
>
> `authority-path-inventory.md` is byte-identical between the two locations.
> `01` and `02` differ because this folder's versions were expanded after the copy; the
> originals are the shorter 2026-07-30 drafts.

| Document | Role |
|---|---|
| `authority-path-inventory.md` | Accepted authority path inventory |
| `01-existing-state-inventory.md` | Existing-state inventory (Part I) · Security threat & enforcement matrix (Part II) · **Gap analysis (Part III)** |
| `02-canonical-access-identity-model.md` | Canonical access & identity model |
| `03-implementation-qa-sequence.md` | **Sequenced implementation & QA plan — the plan of record.** Part I–II: waves 0–12, `W-0`…`W-53`, with §23's coverage of every finding ID in the corpus. **Part III (§§30–42): the QA and evidence plan** — a tier and exit gate per workstream, the fixture module, the two-process harness, preflight evidence, and `QE-1`…`QE-9` on what actually decides "met" |

**This folder holds three of the corpus's eight numbered documents** (`01`, `02`, `03`), plus the accepted
authority-path inventory. `00-mission-intake-and-coverage.md`,
`04-authentication-model.md`, `05-command-enforcement-census.md`, `06-product-ia-and-flows.md` and
`07-director-acceptance-rubric.md` exist **only** under
`docs/platform/planning/vacilando-os/qa/access-identity-v2/`. `01…` §32 records this as `X-2` and escalates
it — where the canonical artifacts live is a Director decision, not a worker one. Until it is settled, read
the QA folder for those five documents.

**Two of the three integrity findings that qualified this note are now closed.** `X-3` — *the `03` in this
folder is 455 lines staler than the one in the QA folder* — closed on 2026-08-04: the plan here now carries
the wave 0/1 execution records **and** waves 6–12, and the QA copy is the frozen historical record of the
2026-07-30 plan. `X-5` — *required output #5 exists only as an uncommitted working-tree change* — closed:
`02…` Parts II and III are committed. `X-2` remains open, and `X-9` (a collision between the decision
register's `AD-n` and the acceptance rubric's audit criteria) is new — see `03…` §26.

See also: `docs/platform/planning/vacilando-os/VACILANDO-RUNTIME-V1-CERTIFICATION.md`
and `docs/platform/planning/vacilando-os/qa/runtime-v1-closeout/`.
