# Global Search — Phase 2 Candidates

**Path:** `docs/sprints/05_2026/global_search_phase2_candidates.md`  
**Status:** **Future** — ideas only; not scheduled.  
**Prerequisite:** [global_search_foundation.md](./global_search_foundation.md) — **Global Search V1 is COMPLETE and operational** without any item below.

---

## Context

Global Search V1 delivers deterministic, permission-aware record lookup for AdminV2: inline header search, family clustering, canonical drawer navigation, multi-child household completeness, and drawer-safe UX.

Phase 2 candidates are **enhancements and expansions**. They are explicitly out of scope for V1 and do not block current operator use.

---

## Search intelligence

| Candidate | Description | V1 status |
|-----------|-------------|-----------|
| **Fuzzy matching** | Tolerate partial / approximate string matches beyond current `ilike` token search | Not in V1 |
| **Typo tolerance** | Correct common misspellings in names and labels | Not in V1 |
| **Ranking improvements** | Re-order results by recency, status urgency, or operator context | Not in V1 |
| **Relevance scoring** | Weight matches by field, entity type, and relationship proximity | Not in V1 |

V1 prioritizes **completeness and correctness** over advanced ranking.

---

## Additional entities

| Candidate | Description | V1 status |
|-----------|-------------|-----------|
| **Documents** | Search document titles, metadata, and linked records | Not in V1 |
| **Forms** | Search form definitions, submissions, and intake cases | Not in V1 |
| **Messages** | Search communication threads and message content | Not in V1 |
| **Activities** | Search tasks, notes, and activity log entries | Not in V1 |
| **Workflows** | Search workflow instances and execution state | Not in V1 |
| **Households (standalone)** | Search and open `customers` directly when customer drawer UX is ready | Context only in V1 |
| **Jobs, invoices, payments** | Financial and operational record grains | Not in V1 |

---

## Operator productivity

| Candidate | Description | V1 status |
|-----------|-------------|-----------|
| **Recent records** | Surface recently opened records before typing | Not in V1 |
| **Recently viewed** | Persist and rank by view history per operator | Not in V1 |
| **Search history** | Recall prior queries and selections | Not in V1 |
| **Favorites** | Pin frequently accessed records for one-click open | Not in V1 |

---

## BOS integration

| Candidate | Description | V1 status |
|-----------|-------------|-----------|
| **Semantic search** | Natural-language understanding over record corpus | Not in V1 — belongs to BOS |
| **Natural language retrieval** | “Show me families touring this week” style queries | Not in V1 — belongs to BOS |
| **Suggested actions** | Propose next steps from search context | Not in V1 — belongs to BOS |
| **Cross-record insights** | Aggregate patterns across matched records | Not in V1 — belongs to BOS |

**Doctrine:** Global Search finds and opens records. BOS provides operational guidance, semantic retrieval, and AI-assisted action. See [global_search_foundation.md](./global_search_foundation.md#architecture-search-is-not-bos).

---

## When to pick up Phase 2

Consider Phase 2 when:

- Operator feedback identifies ranking or entity gaps that block daily workflows
- Customer / household drawer UX is ready for standalone household search
- BOS foundation can consume search infrastructure without conflating the two surfaces

Until then, **Global Search V1 remains the production contract**.
