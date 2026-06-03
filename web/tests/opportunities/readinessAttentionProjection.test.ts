import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    projectReadinessToAttentionReasons,
    READINESS_ATTENTION_AGGREGATE_LABEL,
    READINESS_ATTENTION_REASON_CODE,
} from "@/lib/opportunities/readinessAttentionProjection";
import {
    DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1,
    type ReadinessAttentionProjectionProfileV1,
} from "@/lib/opportunities/readinessAttentionProjectionProfile";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";

const DEFAULT_PROFILE: ReadinessAttentionProjectionProfileV1 = {
    ...DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1,
};

function readinessFixture(
    partial: Partial<ReadinessResult> & Pick<ReadinessResult, "primary_state" | "gaps">
): ReadinessResult {
    return {
        contract_version: "1.0",
        trigger: "record_view",
        subject: { entity_type: "opportunity", entity_id: "opp-1" },
        context: { org_id: "org-1" },
        counts: {
            gaps_total: partial.gaps.length,
            by_level: { recommended: 0, required: 0, enforced: partial.gaps.filter((g) => g.level === "enforced").length },
            blocking: 0,
            satisfied: 0,
            configured: 1,
        },
        ok: partial.gaps.length === 0,
        ...partial,
    };
}

describe("projectReadinessToAttentionReasons", () => {
    it("projects enforced gaps to missing_required_info", () => {
        const readiness = readinessFixture({
            primary_state: "needs_information",
            gaps: [
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record",
                    level: "enforced",
                    label: "Child · Program Interest",
                    missing_reason: "Missing",
                    failure_kind: "missing",
                    blocking: false,
                },
            ],
        });
        const out = projectReadinessToAttentionReasons(readiness, DEFAULT_PROFILE);
        expect(out).toHaveLength(1);
        expect(out[0]?.code).toBe(READINESS_ATTENTION_REASON_CODE);
        expect(out[0]?.severity).toBe("high");
        expect(out[0]?.readiness_gap_ids).toEqual(["child:program_interest"]);
        expect(out[0]?.label).toBe("Child · Program Interest");
    });

    it("uses aggregate label for multiple gaps", () => {
        const readiness = readinessFixture({
            primary_state: "needs_information",
            gaps: [
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record",
                    level: "enforced",
                    label: "Child · Program Interest",
                    missing_reason: "Missing",
                    failure_kind: "missing",
                    blocking: false,
                },
                {
                    requirement_id: "person:phone",
                    scope_type: "record",
                    level: "enforced",
                    label: "Guardian · Phone",
                    missing_reason: "Missing",
                    failure_kind: "missing",
                    blocking: false,
                },
            ],
        });
        const out = projectReadinessToAttentionReasons(readiness, DEFAULT_PROFILE);
        expect(out[0]?.label).toBe(READINESS_ATTENTION_AGGREGATE_LABEL);
    });

    it("does not project blocked state", () => {
        const readiness = readinessFixture({
            primary_state: "blocked",
            gaps: [
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record",
                    level: "enforced",
                    label: "Child · Program Interest",
                    missing_reason: "Missing",
                    failure_kind: "missing",
                    blocking: true,
                },
            ],
        });
        expect(projectReadinessToAttentionReasons(readiness, DEFAULT_PROFILE)).toEqual([]);
    });

    it("does not project ready state", () => {
        const readiness = readinessFixture({
            primary_state: "ready",
            gaps: [],
        });
        expect(projectReadinessToAttentionReasons(readiness, DEFAULT_PROFILE)).toEqual([]);
    });

    it("skips required-only gaps unless include_required_gaps", () => {
        const readiness = readinessFixture({
            primary_state: "needs_information",
            gaps: [
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record",
                    level: "required",
                    label: "Child · Program Interest",
                    missing_reason: "Missing",
                    failure_kind: "missing",
                    blocking: false,
                },
            ],
        });
        expect(projectReadinessToAttentionReasons(readiness, DEFAULT_PROFILE)).toEqual([]);
        expect(
            projectReadinessToAttentionReasons(readiness, {
                ...DEFAULT_PROFILE,
                include_required_gaps: true,
            })
        ).toHaveLength(1);
    });

    it("does not project recommended-only gaps by default", () => {
        const readiness = readinessFixture({
            primary_state: "warning",
            gaps: [
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record",
                    level: "recommended",
                    label: "Child · Program Interest",
                    missing_reason: "Missing",
                    failure_kind: "missing",
                    blocking: false,
                },
            ],
        });
        expect(projectReadinessToAttentionReasons(readiness, DEFAULT_PROFILE)).toEqual([]);
        expect(
            projectReadinessToAttentionReasons(readiness, {
                ...DEFAULT_PROFILE,
                include_recommended_gaps: true,
            })
        ).toHaveLength(1);
    });

    it("respects flag_missing_required disabled", () => {
        const readiness = readinessFixture({
            primary_state: "needs_information",
            gaps: [
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record",
                    level: "enforced",
                    label: "Child · Program Interest",
                    missing_reason: "Missing",
                    failure_kind: "missing",
                    blocking: false,
                },
            ],
        });
        expect(
            projectReadinessToAttentionReasons(readiness, {
                ...DEFAULT_PROFILE,
                flag_missing_required: false,
            })
        ).toEqual([]);
    });

    it("only accepts record_view trigger snapshots", () => {
        const readiness = readinessFixture({
            primary_state: "needs_information",
            trigger: "action_execute",
            gaps: [
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record",
                    level: "enforced",
                    label: "Child · Program Interest",
                    missing_reason: "Missing",
                    failure_kind: "missing",
                    blocking: true,
                },
            ],
        });
        expect(projectReadinessToAttentionReasons(readiness, DEFAULT_PROFILE)).toEqual([]);
    });
});

describe("readinessAttentionProjection import guard", () => {
    it("does not import readiness evaluators or field-rule catalogs", () => {
        const src = readFileSync(
            resolve(process.cwd(), "lib/opportunities/readinessAttentionProjection.ts"),
            "utf8"
        );
        expect(src).not.toMatch(/lifecycleFieldRuleEvaluator/);
        expect(src).not.toMatch(/evaluateEffectiveRequirements/);
        expect(src).not.toMatch(/evaluateOperationalReadiness/);
    });
});
