import { describe, it, expect } from "vitest";
import { resolvePublishedFocusPanelSummaryRecord } from "@/lib/adminV2/runtime/focusPanel/resolveFocusPanelSummaryVariant";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";

/**
 * P3-D — Focus Panel Summary applicability certification.
 *
 * The Focus Panel now selects its published variant through `resolveSurfaceVariant` (the ONE resolver),
 * replacing the endpoint's ad-hoc `highestVersion(published)` org-global pick. This certifies:
 * behavior-neutrality for org-global docs (highest version wins), published-only, deterministic tie-break,
 * Business-Process / Work-View applicability, order independence, and no-stale after Work-View movement.
 */

let n = 0;
const rec = (over: Partial<EntityLayoutRecord> & { metadata?: Record<string, unknown> | null } = {}): EntityLayoutRecord => ({
    id: `L${++n}`,
    orgId: "org1",
    industryKey: null,
    entityType: "opportunities",
    surface: "drawer",
    layoutKey: "focus_panel_summary",
    name: "fps",
    version: 1,
    status: "published",
    isSystemDefault: false,
    doc: { version: 2, entityType: "opportunities", surface: "drawer", sections: [] } as unknown as EntityLayoutRecord["doc"],
    metadata: null,
    createdBy: null,
    createdAt: "2026-01-01",
    updatedAt: null,
    publishedAt: "2026-01-01",
    ...over,
});

describe("P3-D Focus Panel Summary applicability", () => {
    it("no records → null (caller uses the code-built default)", () => {
        expect(resolvePublishedFocusPanelSummaryRecord([])).toBeNull();
    });

    it("draft-only → null (published-only; drafts never resolve at runtime)", () => {
        expect(resolvePublishedFocusPanelSummaryRecord([rec({ status: "draft" })])).toBeNull();
    });

    it("single org-global published → returns it (behavior-neutral)", () => {
        const r = rec({ id: "ONLY" });
        expect(resolvePublishedFocusPanelSummaryRecord([r])?.id).toBe("ONLY");
    });

    it("behavior-neutral vs highestVersion: highest published version wins among org-global docs", () => {
        const v1 = rec({ id: "V1", version: 1 });
        const v3 = rec({ id: "V3", version: 3 });
        const v2 = rec({ id: "V2", version: 2 });
        expect(resolvePublishedFocusPanelSummaryRecord([v1, v3, v2])?.id).toBe("V3");
    });

    it("version tie → deterministic total order (lexically-least layoutId), independent of input order", () => {
        const b = rec({ id: "B", version: 5 });
        const a = rec({ id: "A", version: 5 });
        expect(resolvePublishedFocusPanelSummaryRecord([b, a])?.id).toBe("A");
        expect(resolvePublishedFocusPanelSummaryRecord([a, b])?.id).toBe("A");
    });

    it("Work-View scope: a New-Leads-scoped variant beats the org-global default for that view", () => {
        const dflt = rec({ id: "DEFAULT", version: 9 });
        const scoped = rec({ id: "NL", version: 1, metadata: { workViewId: "new_leads" } });
        expect(resolvePublishedFocusPanelSummaryRecord([dflt, scoped], { workViewId: "new_leads" })?.id).toBe("NL");
        // A different view falls back to the org-global default (never the other view's variant).
        expect(resolvePublishedFocusPanelSummaryRecord([dflt, scoped], { workViewId: "registration" })?.id).toBe("DEFAULT");
    });

    it("Business-Process scope is a GATE (not a specificity axis): a BP variant applies only for its process", () => {
        // BP is a gating constraint — it must match to apply, but it does not add specificity. Among
        // applicable candidates the tie-break is still version, so the BP variant must out-version the
        // org-global default to win where it applies; where its BP does not match it is gated out.
        const dflt = rec({ id: "DEFAULT", version: 1 });
        const bp = rec({ id: "BP", version: 9, metadata: { businessProcessKey: "enrollment" } });
        expect(resolvePublishedFocusPanelSummaryRecord([dflt, bp], { businessProcessKey: "enrollment" })?.id).toBe("BP");
        expect(resolvePublishedFocusPanelSummaryRecord([dflt, bp], { businessProcessKey: "waitlist" })?.id).toBe("DEFAULT");
    });

    it("no stale variant after Work View movement (pure — no memory)", () => {
        const dflt = rec({ id: "DEFAULT", version: 9 });
        const nl = rec({ id: "NL", version: 1, metadata: { workViewId: "new_leads" } });
        const set = [dflt, nl];
        expect(resolvePublishedFocusPanelSummaryRecord(set, { workViewId: "new_leads" })?.id).toBe("NL");
        expect(resolvePublishedFocusPanelSummaryRecord(set, { workViewId: "all_leads" })?.id).toBe("DEFAULT");
        expect(resolvePublishedFocusPanelSummaryRecord(set, { workViewId: "new_leads" })?.id).toBe("NL");
    });
});
