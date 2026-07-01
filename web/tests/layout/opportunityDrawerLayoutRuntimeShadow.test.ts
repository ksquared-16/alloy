/**
 * C1a — opportunity drawer shadow telemetry + gate tests.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { buildOpportunityDrawerShadowTelemetry } from "@/lib/layout/runtime/shadow/opportunityDrawerShadowTelemetry";
import type { RealRecordShadowValidationReport } from "@/lib/layout/runtime/shadow/drawerStructureSnapshot";
import {
    isLayoutRuntimeOpportunityDrawerShadowDiagnosticsEnabledClient,
    isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled,
    isLayoutRuntimeOpportunityDrawerShadowReadPathEnabledClient,
    isLayoutRuntimeOpportunityDrawerEnabledServer,
} from "@/lib/layout/featureFlag";
import { runRealOpportunityShadowValidation } from "@/lib/layout/runtime/shadow/runRealOpportunityShadowValidation";

function sampleReport(): RealRecordShadowValidationReport {
    return {
        recordId: "opp-1",
        opportunityId: "opp-1",
        parityScore: 82,
        summary: "Partial parity.",
        layoutSource: "default",
        layoutKey: "lead_default",
        vmNodeCount: 10,
        layoutNodeCount: 9,
        matched: {
            tabs: ["overview"],
            sections: ["lead_summary"],
            fields: ["name"],
            widgets: [],
            relationship_sections: [],
            repeaters: ["children"],
        },
        mismatches: [
            {
                category: "section_missing_in_layout",
                vmKey: "inquiry_tuition",
                detail: "VM section missing in layout",
            },
            {
                category: "field_missing_in_layout",
                vmKey: "person.primary_phone",
                detail: "Field missing",
            },
        ],
        missingCoverage: { vmOnly: ["inquiry_tuition"], layoutOnly: ["future_tasks"] },
        coverage: {
            overall: 82,
            tabs: { matched: 1, total: 1, percent: 100 },
            sections: { matched: 1, total: 2, percent: 50 },
            fields: { matched: 1, total: 2, percent: 50 },
            widgets: { matched: 0, total: 0, percent: 100 },
            relationship_sections: { matched: 0, total: 0, percent: 100 },
            repeaters: { matched: 1, total: 1, percent: 100 },
            binding_classes: {},
        },
        topGaps: [
            {
                category: "section_missing_in_layout",
                key: "inquiry_tuition",
                detail: "Missing tuition section",
                impact: "high",
            },
        ],
        unmapped: [],
        unsupported: [],
        extra: ["future_tasks"],
        readiness: {
            level: "approaching",
            parityScore: 82,
            fieldCoveragePercent: 50,
            blockers: [],
            notes: ["Shadow-only"],
        },
    };
}

describe("buildOpportunityDrawerShadowTelemetry", () => {
    it("includes parity score, gaps, missing sections/fields, and extra layout items", () => {
        const telemetry = buildOpportunityDrawerShadowTelemetry(sampleReport(), { composeMs: 120 });
        expect(telemetry.parityScore).toBe(82);
        expect(telemetry.readinessLevel).toBe("approaching");
        expect(telemetry.fieldCoveragePercent).toBe(50);
        expect(telemetry.missingSections).toContain("inquiry_tuition");
        expect(telemetry.missingFields).toContain("person.primary_phone");
        expect(telemetry.extraLayoutItems).toContain("future_tasks");
        expect(telemetry.topGaps[0]?.key).toBe("inquiry_tuition");
        expect(telemetry.composeMs).toBe(120);
    });
});

describe("C1a opportunity drawer shadow gates", () => {
    const env = { ...process.env };

    beforeEach(() => {
        delete process.env.LAYOUT_RUNTIME_ENABLED;
        delete process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER;
        delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED;
        delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER;
        delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_SHADOW_DIAGNOSTICS;
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it("shadow read path off when visible body cutover is active (default)", () => {
        expect(isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerShadowReadPathEnabledClient()).toBe(false);
    });

    it("shadow read path on when emergency fallback disables body cutover", () => {
        process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK = "1";
        expect(isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled()).toBe(true);
        expect(isLayoutRuntimeOpportunityDrawerEnabledServer()).toBe(true);
    });

    it("diagnostics panel flag defaults off even when C1a enabled", () => {
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK = "1";
        expect(isLayoutRuntimeOpportunityDrawerShadowReadPathEnabledClient()).toBe(true);
        expect(isLayoutRuntimeOpportunityDrawerShadowDiagnosticsEnabledClient()).toBe(false);

        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_SHADOW_DIAGNOSTICS = "1";
        expect(isLayoutRuntimeOpportunityDrawerShadowDiagnosticsEnabledClient()).toBe(true);
    });

    it("runRealOpportunityShadowValidation rejects c1a gate when flags off", async () => {
        const result = await runRealOpportunityShadowValidation({
            opportunityId: "x",
            gate: { orgId: "org", userId: "u", role: "admin" } as never,
            supabase: {} as never,
            readPathGate: "c1a_opportunity_drawer",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("shadow_read_path_disabled");
    });
});
