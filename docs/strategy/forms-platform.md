# Alloy Forms Platform — long-term vision

**Program start:** 2026-05-05

**Scope:** Where Alloy’s forms experience should head over time — a single mental model for capturing information, attaching documents, and supporting compliance-style workflows. Product direction only; no implementation or schema detail here.

---

## 1. Vision

A **unified intake, documents, and compliance-oriented system**: one platform primitive for “structured capture + evidence + lifecycle,” so centers can move families from first touch through enrollment and ongoing obligations without a patchwork of disconnected tools.

---

## 2. Input channels

- **Web forms** — embeddable or iframe-friendly experiences for families and external parties.
- **API intake** — programmatic submission for partners, automations, and future integrations.
- **Email-based interaction** *(future)* — treating the inbox as a channel for requests, replies, and structured follow-ups where appropriate.
- **Internal admin forms** — staff-facing flows that share the same definitions and outcomes as external intake where it makes sense.

---

## 3. Output / lifecycle

Captured information and artifacts should feed recognizable business outcomes:

- **CRM intake** — inquiries and pipeline progression with full context.
- **Enrollment packets** — the documents and acknowledgments that accompany becoming enrolled.
- **Compliance documents** — attestations, policies, and other records that need to exist and be retrievable.
- **Billing-related forms** — agreements and authorizations that sit next to financial workflows without owning billing logic itself.

---

## 4. Advanced capabilities *(future)*

- **Upload plus AI-assisted parsing** — turn unstructured files into structured fields with human review, not magic.
- **Document recreation** — generate consistent outputs from structured answers (e.g., packets, letters) where the product chooses to support it.
- **State and county requirements** — jurisdiction-aware expectations surfaced as configuration and guidance, not one-off hacks.
- **Dynamic field logic** — show, require, and validate fields based on answers, entity context, and policy.

---

## 5. Principles

- **Config-driven** — definitions and rules live in admin-controlled configuration within platform guardrails, not scattered hardcoding.
- **Reusable across departments** — same platform serves enrollment, operations, and other teams with shared patterns.
- **Tied to the entity model** — submissions and documents resolve to real records (person, customer, household, opportunity, etc.), not orphaned blobs.

---

## 6. What is NOT V1

Deliberately out of scope for an initial slice:

- **PDF builder** — a full visual PDF composer is not required to prove value.
- **Full compliance engine** — automated interpretation of every regulatory obligation across jurisdictions is not the first milestone.
- **AI document ingestion** — bulk autonomous extraction and mapping as a production-critical path is deferred until the baseline intake and storage story is solid.

---

*Last updated: May 2026*
