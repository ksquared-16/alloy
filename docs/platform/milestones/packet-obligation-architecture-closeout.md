---
owner: platform
status: frozen
last_reviewed: 2026-07-24
supersedes: []
---

# Packet / Obligation — Architecture Initiative Closeout

**Status:** FROZEN closeout (2026-07-24). This document formally closes the Packet Platform product
realization and the Obligation-model platform-architecture investigation. **The architecture is
complete and frozen.** What remains is engineering implementation. No new product concepts, no new
platform primitives, and no further abstraction work are to be introduced under this initiative.

This closeout is the canonical capture. The two investigation threads it closes were product/architecture
discovery only — no code, no schemas, no APIs — and their conclusions are recorded here in full so no
downstream reader needs the original threads.

---

## 1. Frozen architectural truth

Treat the following as settled. Do not re-debate.

- **Packet is the canonical collection product.** A Packet is a governed obligation requiring named
  participants to satisfy a defined set of contributions so the organization can make one decision.
- **Processing is the canonical review and decision product.**
- **Commit is the canonical truth-mutation product.**
- **The ownership line:** **Packet owns collection · Processing owns judgment · Commit owns truth.**
- **Obligation is an internal implementation architecture**, not an operator-facing product concept. It
  unifies cross-cutting services only (Current Work, Work Items, reminders/SLA/escalation, BOS, history).
- Operators and participants never hear the word "Obligation." They hear *Packet, Case, Invoice, Task*,
  and participants hear only their own outcome ("your enrollment").

---

## 2. Major discoveries

1. **Alloy was missing the "obligation" primitive** — the live, accountable unit of owed work that sits
   between Forms (instruments) and Processing (judgment). The platform previously jumped straight from
   "a form was submitted" to "a case to review," leaving the collection episode unnamed.
2. **A Packet is an obligation, not a collection of forms.** Its atoms are *contributions*
   (provide-information / upload-evidence / acknowledge / sign / confirm-prior), not forms; a form-answer
   is one contribution type among peers.
3. **Lead Intake is a degenerate Packet** (one requirement, one participant, one decision). Single-form
   intake and Packet are the same object at different cardinality — a simplification, not a new system.
4. **Three lifecycles were conflated and must stay separate:** the Packet *definition* lifecycle
   (Draft → Ready → Retired), the Packet *instance* lifecycle
   (Preparing → Launched → In Progress → Complete → Handed Off → Closed, plus Blocked / Expired /
   Withdrawn), and the *Processing Case* lifecycle (Reviewed → Committed). "Reviewed" and "Committed"
   are **not** Packet states.
5. **A deeper primitive than Packet exists: the Obligation** — a party accountable to reach a defined
   satisfaction condition under terms, tracked open → resolved, emitting a resolution. Packet is its
   **Collect** specialization. Its five shapes: **Collect, Decide, Settle, Act, Report.**
6. **"Everything is an obligation" is false and was rejected.** The primitive earns its place by what it
   excludes. Five platform capabilities are **neighbors, not obligations**: Communications (Transport),
   Attendance (Ledger + a hidden Report obligation), Scheduling/Staffing (Plan), Business Process
   (Process / obligation emitter-and-gate), BOS (Actor). The falsification test: *if it has no party who
   can fail it, it is not an obligation — it is a ledger, a channel, a plan, or a process.*
7. **Current Work and Work Items are projections, not systems of record.** Current Work = the live lens
   of open obligations for an actor. A Work Item = the actor-facet of one obligation
   (*this obligation, the part that is yours, actionable now*).
8. **Handoff = Completion.** Ownership moves from Packet to Processing the moment every required
   contribution is satisfied. The Packet then freezes as the immutable *collection record*; the
   Processing Case is the mutable *decision record*. They coexist and link.

---

## 3. Decisions accepted

- Packet is Digital-Mailroom-native: **definitions live in Studio, live instances live in Work.** No new
  top-level workspace; not inside Forms; not inside Processing (except the handoff surface); not a
  Business Process.
- Packet reuses the platform wherever possible and **duplicates nothing**: Forms (contribution surface),
  Documents/Mailroom (evidence + homes), Processing (review runtime — as the destination), Communications
  (delivery), Decision Conversation (unchanged, operates on the spawned case), Commit (record writing),
  canonical identity (resolution). Packet's only genuinely new owned substance is the *obligation itself*.
- **Structural non-negotiables** for the Packet model: (a) contribution types beyond forms;
  (b) participant roles with per-requirement assignment; (c) inter-requirement dependencies. Everything
  else is configuration.
- The Obligation model is adopted as a **shared internal contract that existing capabilities conform to**,
  routed first through the cross-cutting services — **not** a rewrite into one monolithic runtime.
- Business Process is refactored to **emit and gate on** obligations ("advance when this stage's
  obligations are resolved"); it stops embedding bespoke per-tenant work tracking. It keeps its real
  value: the longitudinal shape a subject travels.
- BOS is an **Actor** that recommends, drafts, and surfaces obligations for an accountable human to
  accept; it **never owns or unilaterally resolves** anything requiring human accountability.

---

## 4. Decisions rejected

- **"Everything is an obligation" (one primitive to rule them all).** Rejected as unfalsifiable and
  non-simplifying. Kept only the tight primitive plus its explicit neighbor taxonomy.
- **Collapsing all capabilities into one Obligation runtime / god object.** Rejected. Obligation owns only
  the accountability skeleton (party, satisfaction condition, terms, state, progress, resolution,
  history); it never owns content, judgment, truth, delivery, or party identity. Thin waist, not monolith.
- **Packet as its own top-level workspace / inside Forms / inside Processing / as a Business Process.** All
  rejected in favor of the Studio-defines / Work-runs Mailroom home.
- **"Reviewed" and "Committed" as Packet states.** Rejected — they belong to the Processing Case.
- **Treating Attendance data, Communications, and Scheduling artifacts as obligations.** Rejected — they are
  Ledger, Transport, and Plan neighbors respectively (each may *carry* or *emit* obligations).
- **First-class acknowledgement/signature packet step types in V1.** Deferred (compose from forms +
  generated PDFs first).
- **LLM/OCR-assisted form generation in the first walkable proof.** Deferred in favor of the existing
  deterministic structure detection.

---

## 5. Open questions intentionally deferred

- **Reify-now vs. name-and-wait** for the Obligation contract. Recommendation stands: bank the
  simplification through **one** cross-cutting service first (Current Work) before touching anything wider.
- **Operator-facing naming** of each obligation shape (Packet, Case, Invoice, Task) — accepted as-is;
  revisit only if operator research demands it. "Obligation" stays internal.
- **Per-contribution locking policy** for very large / multi-party packets (freeze each contribution on
  submit vs. keep revisable until the whole packet completes). Core model: the *packet* is the unit of
  completion and freezing; per-contribution locking is a policy knob, not core.
- **Deeper SSR / lazy-draft optimization** of the in-iframe participant bootstrap (beyond the shipped
  eager-iframe fix).
- **Formal unification** of Lead Intake as a declared degenerate Packet (single surface) vs. keeping them
  adjacent for continuity. Recommendation: declare the unified model canonical, migrate gradually.
- **The critical-path / optimization layer** revealed by construction-PM and scheduling — belongs to the
  Plan neighbor, not Obligation; out of scope for this initiative.

---

## 6. Architectural boundaries

- **Packet owns collection. Processing owns judgment. Commit owns truth.** No capability crosses these.
- **Obligation is internal.** Never surfaced to operators or participants as a product concept.
- **Obligation owns** only: accountable party, satisfaction condition, terms (deadline/authority), state
  (open → resolved), progress, resolution event, provenance/history, escalation/reminder policy.
- **Obligation never owns:** contribution content (Forms/Documents), judgment (Processing), truth
  (Commit/Ledgers), message delivery (Transport/Communications), party identity (canonical identity).
- **Neighbors are not obligations:** Communications (Transport), Attendance (Ledger + Report obligation),
  Scheduling/Staffing (Plan), Business Process (Process/emitter), BOS (Actor).
- **Handoff boundary:** Packet → Processing at Completion; collected contributions become immutable
  evidence; the only re-entry is a Processing-initiated "needs correction" reopening a single participant's
  single requirement.

---

## 7. Future implementation guidance

- Build by **composition over invention.** The earlier realization audit found nearly every primitive
  already present (Forms Studio, packet definitions/sessions, the packet→Processing on-ramp already wired,
  Decision Conversation, Commit, Digital Mailroom). Do not rebuild these.
- **Do not** create a second form builder, recreate `/admin/forms`, or create a packet-specific review
  runtime. **Do not** hardcode childcare-specific primitives (Packet must remain platform-generic across
  enrollment, HR/vendor onboarding, claims, licensing, healthcare intake, annual registration, etc.).
- Realize the Obligation contract **through cross-cutting services first** (Current Work as one projection
  over open obligations), then let Business Process gating conform, then BOS assist uniformly.
- Keep the **five-shape typology** (Collect/Decide/Settle/Act/Report) and the **neighbor taxonomy** as the
  guardrails against scope creep. Apply the falsification test on every new candidate.
- Preserve the three separate lifecycles and the three structural non-negotiables (contribution types,
  participant roles + assignment, dependencies) in any Packet implementation.

---

## 8. Corpus this closeout freezes

- Packet Platform product realization (first-principles definition, lifecycle, object model, operator +
  participant experience, workspace decision, Processing handoff, platform-generic validation).
- Obligation-model platform investigation (deeper-primitive proof, Packet-as-specialization, common
  structure, ownership, Current Work / Work Items / BOS / Business Process relationships, ten-domain test).

Companion realized work from the same phase (Phase 7 addendum, committed separately): retrievable +
idempotent Packet/Forms distribution links, Manage-Folders drag-and-drop, eager participant embed.

**This initiative is closed. Next work is engineering implementation, sequenced separately.**
