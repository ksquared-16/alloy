---
owner: platform
status: canonical
last_reviewed: 2026-07-14
supersedes: []
---

# Platform documentation

Canonical Alloy platform doctrine. Start at [`../README.md`](../README.md) for the full library map.

**Teach first:** [`foundation/alloy-platform-handbook.md`](./foundation/alloy-platform-handbook.md) — Alloy Platform Handbook.

| Folder | Owns |
|--------|------|
| [`foundation/`](./foundation/) | What Alloy is, capabilities, roadmap, architecture maps |
| [`core/`](./core/) | Operator model, entities, records, status, data contracts, truth flow |
| [`operator/`](./operator/) | Interaction model, workspaces, queues, drawers, card systems |
| [`experience/`](./experience/) | Presentation runtime, motion, loading/reveal |
| [`modules/`](./modules/) | Domain modules (communications, billing, documents, AI, …) |
| [`analytics/`](./analytics/) | Metric / analytics platform |
| [`commercial/`](./commercial/) | Commercial / offerings platform |
| [`runtime/`](./runtime/) | Runtime ownership references (implementation-adjacent platform truth) |
| [`governance/`](./governance/) | Documentation, design, roles, deployment, glossary |
| [`milestones/`](./milestones/) | Freezes and certifications |
| [`rfcs/`](./rfcs/) | Approved proposals not yet frozen as sole truth |

Locked implementation contracts also live under [`../system/`](../system/). Execution history lives under `docs/sprints/` (history only — not current doctrine).
