# Access & Roles re-run — proof the operator's mission executed

The real re-run, after the fix, on the live runtime with the real provider.

- **Approved objective** (operator-directed): *"Discover and specify Access & Roles V2. Inventory the current implementation and every authority path (person → user → role → scope), identify contradictions and gaps, define the canonical security/authority model, and return a short sequenced delivery plan. Do NOT build V2 and do NOT modify application source…"* — the operator's words, not the template.
- **What executed:** the worker declared *"This is a discovery-and-specification mission — no source changes,"* ran five parallel read-only evidence passes over `web/` + `supabase/`, and synthesized a **367-line Discovery & Specification** deliverable.
- **Deliverable** (`RERUN-deliverable.md`, captured here): Existing-state inventory · Surface & capability access catalog · Person↔User↔Role↔Scope model (current + canonical target) · Four-layer access model · Authentication model · Effective-access resolution · Product IA & principal flows · Security threat & enforcement matrix · sequenced delivery plan. It is **not** a V2 implementation proposal.
- **Written to** the mission-scoped path `docs/…/qa/missions/cap_access_roles-71e1e393ab.md` — never the generic proposal path.
- **Verification** evaluated the *discovery* acceptance: mission outputs exist ✓, no application source changed ✓, intent-fidelity → operator confirmation. A refreshed generic proposal would have failed AC1 (gate=fail) — see the regression test.
- **Lifecycle:** Start → Executing → Verifying → Ready-for-review → Accept (drift check passed) → Close. The provider window was never opened.

**Verdict for this run:** Vacilando executed the work the operator approved.
