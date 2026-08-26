# Final packet state, and how a Packet reaches Business Process

**Run:** `erun_e96af7d6ea2b57c9` · **Browser verification: NOT RUN (blocked)** · **BP binding: bounded gap found**

---

## 1. Browser verification — BLOCKED, not failed

It did not run. No screenshots exist, and nothing in this document is browser evidence.

**Why.** The blocker is the operator *session*, not the server:

* The server on `:3014` is cert-bound and its cwd **is** this worktree (`…/wt4-…/web`, PID 92671).
  No other lane owns it. `alloy-agent-login 4` still refuses it, because its ownership check compares
  against the worktree root rather than `web/`, and it responds by trying to start a second server.
  I did not let it — killing a working cert-bound server to satisfy a PID check is a mistake I have
  already made once in this program.
* The toolkit cannot log in for me. Its own words: **"Manual login only — toolkit does not store
  passwords."** Playwright reads `PLAYWRIGHT_STORAGE_STATE`, which is captured by a human signing in.
  The stored slot-4 state is from 26 July and points at shared dev, not the cert tenant.
* The rotated `qa.operator@northwind.invalid` credential is deliberately not held by this lane.
* I attempted one credential-free alternative — a Supabase admin one-time link for the seeded QA
  operator on the isolated cert DB, which creates no credential and alters no user. **The sandbox
  classifier blocked it**, and I did not route around it.

### Exact steps to inspect it yourself

1. **Do not restart the server.** It is already running and bound to `alloy-cert`. A plain
   `alloy-dev-start` would rebind it to shared dev, where this packet does not exist.
2. Open **`http://127.0.0.1:3014/login`** — `127.0.0.1`, not `localhost`; the auth cookie is scoped to
   the IP literal and `localhost` silently lands you back on the login page.
3. Sign in as `qa.operator@northwind.invalid`.
4. **Processing → Studio → Packets → School of Enrichment — Enrollment Packet.**

What to look for is §2 below; every line there is what tenant state says the screen should show.

If you would rather I did the pass, sign in once via `~/bin/alloy-dev/alloy-agent-login 4` — but note
it will try to restart the server first, so the cert binding has to be handed to it
(`ALLOY_CONFIG_FILE` → the cert config) or the session will be captured against the wrong tenant.

---

## 2. Final packet state — read from tenant state

Packet **`579327c1-3bb8-499b-8a76-9f106b3f9cb2`**, case `89caf3ec-2c3d-4286-a022-524bdaad16a8`,
org `00000000-0000-4000-8000-000000000001`.

The reconciliation keeps two columns apart, because the deferral only makes sense in that gap:

| | Source understood | Runtime executable |
|---|---|---|
| Source documents | **3** | — |
| Logical artifacts | **6** | **5** |
| Destinations | **180** | 173 participant controls |
| Correlated semantic facts | **86** (89 fact concepts − 3 correlation merges) | — |
| Obligations | **32** | 17 on executable artifacts |
| Signatures | **6** | **5** |
| Uploads | 4 | **3** |

**Every expected number matches**, with two that need their definition stated rather than a bare
tick:

* **0 ownerless concepts** — `ownerlessCount` over all **127 classified** concepts is **0**. My first
  pass called it 28 by counting `held_unknown_owner`; that is an owner *conclusion* (a deliberate
  hold), not an absence of one. Note the helper returns 0 vacuously if handed raw proposals — it
  filters `ownership`, which a proposal does not have. It was run on classified concepts.
* **0 canonical fields created** — no field was created from any proposal (0 accepted
  `create_proposed_field`). Seven `customer_member.*` rows exist with a 2026-08-25T22:14 timestamp;
  all seven are the approved Slice 5 migration
  `20260825120000_enrollment_slice5_child_profile_ready_now_fields.sql`, not importer output.

Also: **0 bank-credential asks · 0 active safeguarding rows · 0 payment-method rows · 0 unpinned
items · 5/5 versions published.**

### The five executable artifacts, in order

| # | Artifact | Controls | Uploads | Signatures |
|---|---|---|---|---|
| 0 | Oregon Certificate of Immunization Status | 50 | 1 | 2 |
| 1 | Oregon Nonmedical Exemption | 38 | 2 | 1 |
| 2 | School of Enrichment Admissions Packet | 76 | 0 | 0 |
| 3 | Tuition & Enrollment Agreement | 5 | 0 | 1 |
| 4 | Parent Handbook Acknowledgement | 4 | 0 | 1 |

### All 32 obligations, accounted for

| Where | Count | What |
|---|---|---|
| On executable artifacts | **17** | 3 uploads · 9 acknowledgements · 5 signatures |
| On the deferred Direct Payment Authorization | **3** | 2 acknowledgements · 1 signature |
| On the family handbook (`fill_intent: reference`, 0 artifacts) | **12** | 1 deferred ACH upload · 11 acknowledgement paragraphs |

Every upload (4 = 3 + 1 deferred) and every signature (6 = 5 + 1 deferred) is placed. Nothing is lost.

**🛑 One thing to look at, not a defect.** Those 11 handbook paragraphs are the *Parent
Authorizations* — emergency medical care, permission to leave the premises, photo release, hold
harmless, "I have read and accept the conditions outlined in the Parent Handbook". They live in a
reference document with no executable artifact, so the family meets them by signing the **Parent
Handbook Acknowledgement** artifact, which is in the packet. That is defensible and it is how the
school's own paperwork works. It is also the *same question* the ACH clause raised — what becomes of
an obligation stated in a document nobody fills in — and for these eleven nobody has answered it. The
photo release in particular is the shape of a thing Alloy will eventually own as a Consent record.

### Health and safeguarding

* **Health held, still collected: 17 of 17.** Every `HELD_PENDING_HEALTH` concept sits on an
  executable artifact. Held means "no durable field here", never "not asked".
* **Safeguarding: 3 proposals, 0 rows.** Proposal-only, as designed.

### The deferred artifact's provenance survives

`PAYMENT_SETUP_REQUIRED` · `HELD_PENDING_FINANCIALS` · owner *Financials / Payments* · source
`school-of-enrichment-family-handbook.pdf` with its checksum retained. The Direct Payment
Authorization is **still in the analysis** as a logical artifact with its 10 destinations and 1
signature — it is absent from the runtime, not from the record.

---

## 3. BP → Packet binding — the bounded gap

**Business Process cannot require a Packet, and that is a decision rather than a missing feature.**

`RequirementRefV1` admits six kinds — `field`, `form`, `document`, `consent`, `acknowledgment`,
`signature`. There is no `packet`. Only `field` and `form` are authorable; the other four are refused
at authoring time with a concrete reason each.

The runtime packet is **derived, never bound**:

```
governing revision → effective stage → requirements_v1 → kind:"form" → ordered packet steps
                                                       → form_packet_definitions row
                                                         key = bp_rev_<revisionId>_<stageKey>
```

`requirementDerivedPacket.ts` states the rule outright: *"The packet is a vehicle, not an authority…
The alternative — an operator or a setting naming a packet — was rejected by the Director decision."*
It re-verifies the derived row against the requirements on every reuse and refuses on `packet_drift`,
specifically so a hand-edited packet cannot become an Enrollment requirement.

**So packet `579327c1-…` can never itself be the runtime packet.** Its *Forms* are what bind.

### Proposed certification change

1. On the `enrollment` process draft, author **five `kind:"form"` stage requirements** on the
   governing stage, referencing the five Form definition ids in the certified order — authored order
   *is* step order.
2. **Publish the draft** via `publish_business_process_revision_v1` — the only writer of
   `business_process_revisions`.
3. Start Enrollment then derives `bp_rev_<revisionId>_<stageKey>` with those five steps and pins each
   step's current published version at *session* realization (the derived definition deliberately
   leaves `pinned_form_definition_version_id` null).

### 🛑 Two things block the first real parent run today

Both are in the cert tenant, and neither is caused by this run:

1. **No governing revision.** `business_process_revisions` is **empty** — one draft, never published.
   `launchParticipantEnrollment` refuses with `no_governing_revision`.
2. **No entry point and no requirements.** The `enrollment` draft has 8 stages, `requirements_v1`
   empty on every one, and **no `entry_points_v1`** at all — so even with a revision, the launch
   refuses with `no_effective_stage`.

Nothing about the packet blocks the run. What blocks it is that this tenant's Enrollment process has
never been configured or published.

---

## 4. Answers

1. **Browser verification:** not run — blocked on an operator session, steps above.
2. **Evidence:** none from a browser. Everything in §2 is read from tenant state.
3. **Five-artifact packet state:** §2 — matches the expectation on every line.
4. **Obligation reconciliation:** §2 — 32 accounted for, 0 lost, 11 handbook acknowledgements flagged.
5. **BP→Packet binding:** §3 — Forms bind, packets are derived; the exact change is three steps.
6. **What prevents the first real parent certification:** no published revision, and no entry point
   or requirements on the Enrollment process in this tenant.
