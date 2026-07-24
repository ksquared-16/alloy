# Phase 1A — Baseline (live :3020, before change)

Root: wt6-vacilando-os-product-def @ cef5827c6 (clean, 0/0 origin/staging)

| Conversation | mission_id | verdict | conf | Director closing (current) | attempt line | frontier in data (advisory) |
|---|---|---|---|---|---|---|
| Access & Roles | msn_314b6673e8ce22cc5f | Ready | **1.0** | "Everything I need is in place. The package for Access & Roles is ready for your review." | **"…1 past mission."** (9 real) | only u_ki_ki1 (low-risk) + criteria |
| Onboarding | msn_8f6ee62b7d0a379b98 | Ready | **0.4** | identical constant | none | m_arch (warn, systemic) |
| Reporting | msn_12aafba97e366118ab | Ready | **0.4** | identical constant | none | m_arch |
| Communications | msn_77c393a650d2bd9451 | Ready | **0.4** | identical constant | none | **u_maturity (load-bearing)** + m_arch |
| Financials | msn_dc46ea3dc2692fba77 | Ready | **0.4** | identical constant | none | m_arch |
| Scheduling | msn_15c6c9532094147023 | Ready | **0.2** | identical constant | none | m_arch |
| Retention | msn_6f58b91f182e3064e3 | Needs Product Decisions | 0.2 | "Director doesn't yet have the product decisions…" (honest ✓ CONTROL) | none | — |

## Confirmed defects
1. **Flattened readiness** — conf 0.2 / 0.4 / 1.0 all yield the byte-identical "Everything I need is in place." (conversation.mjs:46 ignores V.confidence).
2. **Under-represented attempts** — Access & Roles: 9 real missions in store, "1 past mission" shown (conversation.mjs:64/73 reads static cap.mission_history, not the missions store).
3. **Suppressed frontier** — Communications' load-bearing u_maturity unknown sits in V.advisory / pkg.gap_report.findings.unknowns but is dropped because verdict==="Ready" (conversation.mjs:98 sets needs=[] on Ready).
4. **Retention control** — honest; must not regress.

## Root-cause layer
All three are PRESENTATION-layer in conversation.mjs. The signals are already computed and durable:
- confidence → `pkg.readiness_verdict.confidence`
- structured unknowns → `pkg.gap_report.findings` (embedded, frozen on package)
- real attempts → `readMissions().filter(capability_id)`  (retrieval fix: wrong source)

Smallest correct seam: new pure `counsel.mjs`, consumed by conversation.mjs. No new architecture.
