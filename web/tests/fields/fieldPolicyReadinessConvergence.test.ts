import { describe, expect, it } from "vitest";

import { evaluateOperationalReadiness } from "@/lib/completion/evaluateOperationalReadiness";
import {
    enforcedReadinessGaps,
    guidanceReadinessGaps,
} from "@/lib/completion/readinessDisplayPresentation";
import {
    isFieldPolicyReadinessGap,
    projectFieldPolicyReadinessGaps,
} from "@/lib/fields/fieldPolicyReadinessProjection";
import { buildSimpleInteractionPolicy, buildSimpleRequirementPolicy } from "@/lib/fields/fieldPolicySettingsUi";
import { resolveActionPreflightFieldGuidance } from "@/lib/admin/actions/actionPreflightFieldGuidance";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

/**
 * TWO ENGINES, ONE OPERATOR.
 *
 * `lib/completion` decides what the operator is told is missing. `lib/fields` decides what the PATCH
 * gate will accept. Nothing under `lib/completion` had ever read a requirement policy, so the second
 * engine could refuse a save the first reported as ready — and the only explanation the operator got
 * was a raw 400 naming a field no surface had ever shown them.
 *
 * These pin the convergence: same gap, one list, and a way to resolve it.
 */

const sourceDef = {
    id: "d-source",
    field_key: "source",
    field_type: "text",
    label: "Source",
    is_system: true,
    is_required: false,
    requirement_policy: buildSimpleRequirementPolicy("optional"),
    interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "source"),
};

const SOURCE_REQUIRED_ON_DRAWER = {
    field_placements_v1: [
        {
            field_key: "source",
            surfaces: { drawer_overview: { requirement: buildSimpleRequirementPolicy("required") } },
        },
    ],
} as unknown as RecordLayoutConfigJson;

const record = { id: "opp-1", name: "Certopp Family", source: null, status_key: "lead" };

describe("a configured field requirement becomes a readiness gap", () => {
    const gaps = projectFieldPolicyReadinessGaps({
        entityType: "opportunity",
        entityId: "opp-1",
        defs: [sourceDef],
        record,
        layoutConfig: SOURCE_REQUIRED_ON_DRAWER,
    });

    it("names the field in the admin's own words", () => {
        expect(gaps).toHaveLength(1);
        // "Source", not "source" and not "field_policy:opportunity:source". The operator reads the
        // label their administrator configured.
        expect(gaps[0]?.label).toBe("Source");
        expect(gaps[0]?.field_key).toBe("source");
    });

    it("reports it as enforced and blocking, because it is", () => {
        // Presenting a hard save gate as a gentle suggestion would reproduce the original problem in
        // friendlier language: the operator would still hit the wall, just later.
        expect(gaps[0]?.level).toBe("enforced");
        expect(gaps[0]?.blocking).toBe(true);
        expect(enforcedReadinessGaps({ gaps } as never)).toHaveLength(1);
        expect(guidanceReadinessGaps({ gaps } as never)).toHaveLength(0);
    });

    it("carries a field resolution, so the panel can offer a way to fix it", () => {
        expect(gaps[0]?.resolution).toEqual({ type: "field" });
    });

    it("is attributable to the engine it came from", () => {
        expect(isFieldPolicyReadinessGap(gaps[0]!)).toBe(true);
    });

    it("disappears once the value is present", () => {
        const satisfied = projectFieldPolicyReadinessGaps({
            entityType: "opportunity",
            entityId: "opp-1",
            defs: [sourceDef],
            record: { ...record, source: "Referral" },
            layoutConfig: SOURCE_REQUIRED_ON_DRAWER,
        });
        expect(satisfied).toEqual([]);
    });

    it("returns nothing when no field policies are configured", () => {
        expect(
            projectFieldPolicyReadinessGaps({
                entityType: "opportunity",
                entityId: "opp-1",
                defs: [],
                record,
                layoutConfig: SOURCE_REQUIRED_ON_DRAWER,
            })
        ).toEqual([]);
    });
});

describe("readiness evaluation folds the field-policy engine in", () => {
    const evaluate = (fieldPolicy?: Parameters<typeof evaluateOperationalReadiness>[0]["field_policy"]) =>
        evaluateOperationalReadiness({
            org_id: "org-1",
            trigger: "record_view",
            subject: { entity_type: "opportunity", entity_id: "opp-1" },
            record,
            field_policy: fieldPolicy,
        });

    it("surfaces the gap the PATCH gate would have refused", () => {
        const result = evaluate({
            entity_type: "opportunity",
            defs: [sourceDef],
            layout_config: SOURCE_REQUIRED_ON_DRAWER,
        });
        expect(result.gaps.some((g) => g.field_key === "source")).toBe(true);
        // And the record is no longer reported as ready while a save of it would fail.
        expect(result.ok).toBe(false);
        expect(result.primary_state).toBe("blocked");
    });

    it("counts it, so the summary the operator reads is not short by one", () => {
        const before = evaluate();
        const after = evaluate({
            entity_type: "opportunity",
            defs: [sourceDef],
            layout_config: SOURCE_REQUIRED_ON_DRAWER,
        });
        expect(after.counts.gaps_total).toBe(before.counts.gaps_total + 1);
        expect(after.counts.by_level.enforced).toBe(before.counts.by_level.enforced + 1);
    });

    it("changes nothing when the caller supplies no field policies", () => {
        // Every existing readiness call site passes nothing. They must behave exactly as before.
        const before = evaluate();
        expect(before.gaps.some((g) => g.field_key === "source")).toBe(false);
    });

    it("does not list a field twice when both engines already require it", () => {
        /*
         * If an operational rule already names the field, it wins — it carries the richer resolution
         * route. One missing field, one line.
         */
        const result = evaluateOperationalReadiness({
            org_id: "org-1",
            trigger: "record_view",
            subject: { entity_type: "opportunity", entity_id: "opp-1" },
            record,
            field_policy: {
                entity_type: "opportunity",
                defs: [sourceDef],
                layout_config: SOURCE_REQUIRED_ON_DRAWER,
            },
        });
        const sourceGaps = result.gaps.filter((g) => g.field_key === "source");
        expect(sourceGaps).toHaveLength(1);
    });
});

describe("every surfaced gap can be acted on", () => {
    it("routes a required opportunity scalar to the canonical field editor", () => {
        expect(resolveActionPreflightFieldGuidance("source")).toEqual({
            kind: "record_field",
            field_key: "source",
        });
        expect(resolveActionPreflightFieldGuidance("lost_reason")).toEqual({
            kind: "record_field",
            field_key: "lost_reason",
        });
    });

    it("routes Center to the flow that already owns it", () => {
        // Center is a relationship with its own product flow and side effects. A generic scalar
        // editor would be a second, worse answer to a solved question.
        expect(resolveActionPreflightFieldGuidance("location_id")).toEqual({ kind: "change_lead_location" });
    });

    it("leaves the existing routes exactly where they were", () => {
        expect(resolveActionPreflightFieldGuidance("start_date")).toEqual({
            kind: "inquiry_children",
            field: "start_date",
        });
        expect(resolveActionPreflightFieldGuidance("tour_date")).toEqual({ kind: "tour_schedule_modal" });
        expect(resolveActionPreflightFieldGuidance("outcome")).toEqual({ kind: "tour_outcome_modal" });
        expect(resolveActionPreflightFieldGuidance("schedule_type")).toEqual({
            kind: "inquiry_children",
            field: "schedule_type",
        });
    });
});
