---
owner: platform
status: canonical
classification: PARTNER_READY
audience: Classroom Coach engineering
last_reviewed: 2026-09-14
supersedes: []
---

# Technical discovery request — Classroom Coach ↔ Alloy

Alloy's Developer Platform is built, certified and documented: an integration
partner can authenticate, read organizational locations and synchronize them
incrementally today. What Alloy does **not** have is any authoritative technical
information about Classroom Coach, and Alloy will not design against assumptions.

This document asks for exactly what is needed to design a real integration. It is
written so that an engineer can answer it directly — a link to documentation, a
schema file, or a short written answer per item is ideal. **"Not supported" and
"not yet" are useful answers.** A missing answer is the only unusable one,
because it leaves Alloy unable to tell absence from silence.

Alloy's own side of the contract is
[`../external/alloy-developer-platform-specification.md`](../external/alloy-developer-platform-specification.md).

---

## A. API access

1. Do you expose an API to partners or customers? If yes, is it public,
   partner-only under agreement, or per-customer?
2. Base URLs for each environment (production, sandbox, staging).
3. Is there a sandbox or test tenant an Alloy engineer can be granted access to?
   What does provisioning it require?
4. Authentication method — OAuth 2.0 client credentials, API key, signed
   request, something else? Please name the exact grant or scheme.
5. How is a credential issued, by whom, and can it be rotated and revoked
   without downtime?
6. Do credentials carry scopes or permissions? What is the vocabulary?
7. Token lifetime and refresh model, if tokens are used.
8. API versioning scheme, and your compatibility and deprecation policy.
9. Is an OpenAPI/Swagger, GraphQL schema, or equivalent machine-readable
   contract available?

## B. Tenant model

10. What is the top-level tenant called — organization, account, district,
    school, something else?
11. What identifier represents it, and is it stable for the life of the
    customer?
12. Can one credential reach more than one tenant? If so, how is the tenant
    selected per request, and how is cross-tenant access prevented?
13. How do you model multiple physical sites or campuses within one tenant?
14. Do you model rooms or classrooms as first-class records, and are they scoped
    to a site?

## C. Resources and identifiers

15. Which of these exist as addressable API resources, and at what path:
    sites/campuses, rooms/classrooms, staff, children, guardians/households,
    enrollment, schedules, attendance, messages?
16. For each: is it readable, writable, or both?
17. What identifier does each resource carry, is it a UUID or a sequence, and is
    it stable across updates?
18. Do you accept or store an **external identifier** supplied by a partner
    system? If yes, is it per-resource, unique, and queryable?
19. For each shared domain — children, staff, rooms, attendance — which system do
    you consider the system of record, and is that configurable per customer?

## D. Collections and synchronization

20. Pagination model: offset, cursor, page-number? What are default and maximum
    page sizes?
21. Is ordering deterministic and stable across pages?
22. Is incremental synchronization supported — a `modified_since` parameter, a
    change feed, or similar? What is the exact parameter and its timestamp
    format?
23. **How are deletions represented?** Tombstones, a status field, or silent
    disappearance? This determines whether a partner can ever safely trust an
    incremental read.
24. Are there bulk or batch endpoints?

## E. Events and callbacks

25. Do you support webhooks or any push mechanism? Which events?
26. Delivery semantics: at-least-once or at-most-once? Retry policy? Ordering
    guarantees?
27. How is a webhook payload authenticated — signature scheme, shared secret,
    mTLS?
28. Can a partner register and manage endpoints programmatically?

## F. Operational contract

29. Rate limits: the numbers, the window, what they are keyed on, and which
    response headers communicate them.
30. Error format — status codes, a stable machine-readable error code, and
    whether a correlation or request id is returned.
31. Idempotency: is there an idempotency key mechanism for writes? What is the
    retention window?
32. Concurrency: do you support optimistic concurrency (ETag, version field) on
    updates?
33. Availability and support expectations, and how incidents are communicated.

## G. Attendance specifics

This is the domain most likely to carry real integration value, and the one where
Alloy's internal work is furthest along.

34. Do you record attendance events (check-in / check-out), attendance status per
    day, or both?
35. What is the event shape — timestamps, actor, child identifier, room, method?
36. Is attendance writable through the API, readable only, or neither?
37. If Classroom Coach records attendance, would you expect to **push** it to
    Alloy or have Alloy **pull** it?
38. How are corrections and late edits represented — a new event, a mutation of
    an existing one, or a void-and-replace?
39. What timezone semantics apply to attendance timestamps?

## H. Identity and access

40. Do you support SSO for staff users? Which protocol — SAML, OIDC?
41. Do you support deep linking into a specific record from an external system?
42. Are there per-user permissions that would constrain what an integration can
    see or do on a user's behalf?

## I. Commercial and legal

43. Does API access require a partnership agreement, certification, or a fee?
44. Are there contractual constraints on data retention, residency, or
    sub-processing that would shape the integration?
45. Who is the engineering contact for integration questions, and what is the
    preferred channel?

---

## What Alloy will do with the answers

A response with authoritative evidence for sections A–D is enough for Alloy to
resolve **D-1** — whether the integration is inbound, outbound or both — and to
open a provider-specific implementation lane with a real contract in it.

Sections E–H shape sequencing rather than feasibility: they determine whether
Alloy builds a pull-based synchronizer or a push receiver, and whether attendance
ingestion is the first governed mutation Alloy exposes publicly.

Until then Alloy's position is unchanged and deliberate: the generic Developer
Platform is complete and certified, and no Classroom Coach-specific behaviour is
claimed, designed or built.
