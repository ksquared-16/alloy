# First Real Certification Publish — **STOPPED before the first write**

Authorization received and acted on exactly as written: re-read the tenant state, re-ran the
preflight, diffed the actual write set against the approved package. **The write set cannot be
produced from the current tenant state.** No mutation was performed.

Per the instruction — *"If anything has changed — source hashes, counts, decisions, generated
configuration, tenant state, expected mutations, or write set — STOP before writing and report the
delta"* — here is the delta.

---

## What still matches

| Check | Package | Now | |
|---|---|---|---|
| Branch | `agent/claude/4-enrollment-phase2-participant-anchor` | same | ✅ |
| Base staging | `73d9872c1` | same | ✅ |
| Head / tree | `a1cd95ea8`, clean | same | ✅ |
| Handbook SHA-256 | `feb7ee80…8abe8a` | identical | ✅ |
| Oregon CIS SHA-256 | `cda2af9f…e357388` | identical | ✅ |
| Hosted capture SHA-256 | `10c05372…9dba2ca` | identical | ✅ |
| Code-side preflight | 10 gates + 16 controls | **26 passing** | ✅ |

The engineering is intact. The problem is upstream of it.

## Delta 1 — the packet does not exist in the tenant 🛑

Read from the tenant through the authenticated operator API:

- **12 processing cases. `0` have more than one source.** Every case is single-source
  (`relatedSourceCount: 0`).
- Two cases hold `Admissions Packet.html` — the **Formsite capture only**.
- **No case holds `school-of-enrichment-family-handbook.pdf`. No case holds
  `oregon-certificate-of-immunization-status.pdf`.**
- Every case has `generatedFormId: null`. No form has ever been generated from any of them.

The approved package describes **three artifacts composed as one packet**. The tenant holds **one of
the three**, in isolated single-source cases.

### Why this is not recoverable by publishing anyway

The package's write set is `form_definitions ×3` + `form_definition_versions ×3`. From this tenant
state at most **one** form is derivable, and the certified invariants would fail immediately:

| Invariant | Reachable now? |
|---|---|
| 4/4 upload obligations executable | ❌ — **3 of the 4 come from the CIS PDF**, which is not in the tenant |
| 6/6 signatures projected | ❌ — 3 of the 6 come from the CIS |
| 180 destinations / 86 facts / 32 obligations | ❌ — one artifact cannot reconcile a three-artifact packet |
| `form_definition_versions ×3 at version 1` | ❌ — one artifact yields one form |

## Delta 2 — no approved decisions exist in the tenant 🛑

The package's accepted set (21 canonical bindings, 5 relationships, 3 safeguarding proposals, 4
uploads, 18 acknowledgements, 6 signatures) was computed **in the test harness**, by a
`publishDecisions()` function that marks the accept-list dispositions `accepted` in memory.

**No operator has recorded those decisions against a tenant case.** Publishing would either publish
nothing (everything still `proposed`) or require me to synthesise the operator's approvals — which
is precisely the "no unapproved…" guarantee the package makes, inverted.

## Delta 3 — the tenant is the shared development tenant ⚠

The server serves org `93667019-bd28-49b5-a688-acc9bb1e0a19` on hosted project
`ikaxilmwmrmbagoidedu`. This repository's own
[`configuration-overwriter-root-cause.md`](../../../platform/governance/configuration-overwriter-root-cause.md)
records that **58 of 59 managed worktrees share that tenant**, and documents a defect in which one
worktree's save wholesale overwrote configuration authored from another.

The approved package never named a tenant. Publishing a real school's certification configuration
into the shared development tenant — where any other slot's builder save can round-trip it — is a
decision that belongs to you, not an inference I should make while executing a write authorization.

## What the package actually measured

Worth stating plainly, because it is the root of all three deltas: every number in
`FIRST-PUBLISH-PACKAGE.md` was produced by `loadCertificationPacket()` reading the three fixture
files from `web/tests/fixtures/processing/` and running them through discovery, `applyDiscovery` and
the schema projection **in-process**.

That is a true and reproducible measurement of what the pipeline *would* produce. It is not a
measurement of a tenant, and I presented it in a document titled "publish package" without making
that distinction visible. That is my error, and it is the thing to fix before the next attempt.

## What has to be true before this publish can run

1. **One processing case containing all three artifacts.** Import the handbook PDF, the Oregon CIS
   PDF and the hosted-form capture into a single case, then "Analyse as one packet" — the multi-source
   path that produces the 180/86/32 reconciliation.
2. **An operator records the decisions** the package lists, in that case. That is the step that makes
   "approved" mean approved.
3. **A named tenant.** Either an isolated certification org, or your explicit instruction to publish
   into the shared dev tenant with the overwrite risk accepted.

Steps 1 and 2 are operator actions in the browser — the surface certified in the last slice. I can
drive step 1 with the QA session if you want me to, but step 2 is an approval and should be yours.

## State

No mutation performed. No `form_definitions`, `form_definition_versions`, `field_definitions`,
`field_values`, `child_safeguarding_restrictions` or `customer_payment_methods` row was created or
changed. Branch clean at `a1cd95ea8`; nothing pushed.
