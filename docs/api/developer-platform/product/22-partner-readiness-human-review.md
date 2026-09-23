---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — Partner Readiness: two reviews

Two separate things to look at, because they have different audiences and
different failure modes. Automated checks are cited as evidence below; they are
not the review.

---

## Review A — mounted Developer Documentation and API Reference

**Where:** Organization → Integrations → Developer documentation

Six destinations, in reading order: Getting started, Locations, Conventions,
**Integrating with Alloy** (new), Full specification, API Reference.

### What changed, and what to check

| Change | Why | What to look at |
|---|---|---|
| New **Integrating with Alloy** guide | There was no single document an engineer could read end to end | Does it stand alone? Could someone who has never seen Alloy design against it? |
| Specification rewritten | It still said "Three endpoints exist. This is the entire public API" and listed the new resources as unavailable | §2 surface, §5 scopes, §8 People, §9 Service state, §10 Staff, §11 Attendance, §14 submission, §18 limitations |
| Collection law stated once | It lived only under Locations and predated sync tokens, so a partner would have used the weaker watermark | §7 "The collection and synchronization law" |
| Three stale banners corrected | Conventions claimed collections and idempotency had no endpoint; Locations claimed children and households had none; Getting started listed the domain as not callable | The opening callout on each |
| Reference descriptions render Markdown | They were plain text, so literal `**` appeared on exactly the load-bearing sentences | Any operation — emphasis should read as emphasis |

### The judgement worth your time

Read **Integrating with Alloy** as though you were the partner. The question is
not whether it is accurate — it is whether an engineer finishes it knowing what
to build, and whether §11 (privacy) and §12 (limits) read as deliberate product
decisions rather than apologies.

---

## Review B — the offline package

**Where:** `docs/api/developer-platform/package/`

Six files. It is meant to survive being emailed: no repository, no login, no
Alloy contact required to read any of it.

| File | What it is |
|---|---|
| `README.md` | Cover: what we are asking, reading order, ten things to know, what is excluded |
| `01-integrating-with-alloy.md` | The guide |
| `02-technical-specification.md` | Every endpoint, field and limit |
| `03-openapi/alloy-public-api.v1.json` | The governed contract, byte-identical to the one the product serves |
| `06-mapping-worksheet.md` | The mapping we are asking the provider to complete |
| `07-discovery-questions.md` | 27 questions grouped by what each answer decides |

It is assembled by `npm run build:partner-package` from canonical sources rather
than maintained by hand, because two copies of a document is how a partner ends
up integrating against the older one.

### The judgement worth your time

1. **Tone.** The cover says "Here is our contract; show us how your system maps
   to it." Does that read as confident rather than either apologetic or
   presumptuous?
2. **The worksheet's blanks.** Every provider column is `UNKNOWN` on purpose. Is
   that the right posture to send, or would you rather send a proposed mapping?
3. **The exclusions.** The cover states up front that Communications, Financials,
   webhooks, health and safeguarding data are not available. Is that the right
   place for that news?
4. **The questions.** 27 is a lot to ask. Are they the right ones, and is the
   framing — "we have not asked you to describe your database" — correct?
5. **Classification.** The specification still carries PARTNER_READY rather than
   PUBLIC_READY. Confirm that is still what you want on a document leaving the
   building.

---

## Evidence behind both

432 tests green across 25 files. Seven prebuild guards green. Canonical
`tsconfig.build.json` typecheck and production build both passed through the
broker. The mounted documentation was rendered and scanned for unrendered
Markdown, frontmatter leakage and implementation leakage.

The package carries its own guard: it must be current with its sources, must
contain no repository path, internal table name, function name or certification
vocabulary, must ship a contract identical to the runtime's, and must leave the
provider's side of the worksheet unanswered. A fifteen-case exercise reads *only*
the package and proves each question a partner engineer must answer on their
first day is answerable from it.

Writing that exercise found three real defects: a repository path inside the
shipped OpenAPI description, three resources the guide never mentioned by route,
and the enrollment-visibility rule phrased three different ways.

Nothing has been pushed, promoted or deployed.
