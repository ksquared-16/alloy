/**
 * Regression: AdminV2 process-population / provisioning must attach EPP keys BEFORE
 * computeOperationalProjection so Lead Work Views drop families whose children all Waitlisted.
 */

import { describe, expect, it } from "vitest";
import { computeOperationalProjection } from "@/lib/lifecycle/operationalProjection";
import { attachEffectiveParticipantStagesToContextRows } from "@/lib/process/engine/attachEffectiveParticipantStagesToContextRows";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

const LEAD_VIEW = {
    id: "wv-lead",
    label: "Leads",
    enabled: true,
    filters_v1: [
        {
            field_key: "opportunity_stage",
            operator: "equals",
            value: "lead",
        },
    ],
} as WorkViewConfigV1Stored;

describe("EPP on AdminV2 process-population projection", () => {
    it("both children Waitlist → family absent from Lead (EPP keys attached before projection)", () => {
        const raw = [
            {
                id: "opp-kurzman",
                stage_key: "lead",
                status_key: "open",
                name: "Kurzman Family",
            },
        ];
        const withEpp = attachEffectiveParticipantStagesToContextRows(
            raw,
            new Map([["opp-kurzman", ["waitlist", "waitlist"]]]),
            { markMissingAsEmpty: true },
        );
        const projection = computeOperationalProjection({
            baseRows: withEpp,
            workViews: [LEAD_VIEW],
        });
        expect(projection.byViewId["wv-lead"]?.rows ?? []).toHaveLength(0);
        expect(projection.byViewId["wv-lead"]?.count ?? 0).toBe(0);
    });

    it("one Lead + one Waitlist → family remains in Lead", () => {
        const raw = [
            {
                id: "opp-mixed",
                stage_key: "lead",
                status_key: "open",
                name: "Mixed Family",
            },
        ];
        const withEpp = attachEffectiveParticipantStagesToContextRows(
            raw,
            new Map([["opp-mixed", ["lead", "waitlist"]]]),
            { markMissingAsEmpty: true },
        );
        const projection = computeOperationalProjection({
            baseRows: withEpp,
            workViews: [LEAD_VIEW],
        });
        expect(projection.byViewId["wv-lead"]?.rows ?? []).toHaveLength(1);
        expect(projection.byViewId["wv-lead"]?.count ?? 0).toBe(1);
    });

    it("without EPP keys, raw family stage_key still admits (documents pre-fix defect)", () => {
        const raw = [
            {
                id: "opp-legacy",
                stage_key: "lead",
                status_key: "open",
                name: "Legacy Path Family",
            },
        ];
        const projection = computeOperationalProjection({
            baseRows: raw,
            workViews: [LEAD_VIEW],
        });
        expect(projection.byViewId["wv-lead"]?.rows ?? []).toHaveLength(1);
    });
});
