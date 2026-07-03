import { describe, expect, it } from "vitest";
import { evaluateOperationalReadiness, readinessResultFromEffectiveRequirements } from "@/lib/completion/evaluateOperationalReadiness";
import { evaluateEffectiveRequirements } from "@/lib/completion/evaluateEffectiveRequirements";
import { APPROVE_ENROLLMENT_ACTION_KEY } from "@/lib/admin/actions/enrollmentApprovalConstants";
import {
    buildReadinessCountsFromGaps,
    buildReadinessResult,
    derivePrimaryStateFromGaps,
    mapEffectiveRequirementsToReadinessResult,
    mapEffectiveViolationToReadinessGap,
} from "@/lib/completion/readinessMappers";
import type { EffectiveRequirementsResult } from "@/lib/completion/effectiveRequirementsTypes";
import {
    READINESS_RESULT_CONTRACT_VERSION,
    type ReadinessGap,
} from "@/lib/completion/readinessTypes";

const BASE_SUBJECT = { entity_type: "opportunity", entity_id: "opp-1" };
const BASE_CONTEXT = { org_id: "org-1", department_id: "dept-1" };

function emptyEffective(): EffectiveRequirementsResult {
    return {
        ok: true,
        blocking: [],
        recommended: [],
        autoPopulate: [],
        sourceSummary: { layoutRules: 0, actionRules: 0, transitionRules: 0, completionRules: 0 },
    };
}

function gap(overrides: Partial<ReadinessGap> & Pick<ReadinessGap, "requirement_id" | "level">): ReadinessGap {
    return {
        scope_type: "record",
        label: overrides.label ?? overrides.requirement_id,
        missing_reason: overrides.missing_reason ?? "Missing",
        failure_kind: "missing",
        blocking: overrides.blocking ?? false,
        ...overrides,
    };
}

describe("readinessResult contract", () => {
    it("uses stable contract_version 1.0", () => {
        const result = buildReadinessResult({
            trigger: "record_view",
            subject: BASE_SUBJECT,
            context: BASE_CONTEXT,
            gaps: [],
        });
        expect(result.contract_version).toBe(READINESS_RESULT_CONTRACT_VERSION);
        expect(result.contract_version).toBe("1.0");
    });

    it("returns ready when there are no gaps", () => {
        const result = mapEffectiveRequirementsToReadinessResult(emptyEffective(), {
            trigger: "record_view",
            subject: BASE_SUBJECT,
            context: BASE_CONTEXT,
        });
        expect(result.primary_state).toBe("ready");
        expect(result.ok).toBe(true);
        expect(result.gaps).toHaveLength(0);
        expect(result.counts.gaps_total).toBe(0);
    });

    it("returns needs_information for recommended-only gaps", () => {
        const effective: EffectiveRequirementsResult = {
            ...emptyEffective(),
            ok: true,
            recommended: [
                {
                    field_key: "person:email",
                    label: "Person · Email",
                    severity: "recommended",
                    reason: "Email is recommended.",
                    source: "completion",
                    requirement_level: "recommended",
                },
            ],
        };
        const result = mapEffectiveRequirementsToReadinessResult(effective, {
            trigger: "record_view",
            subject: BASE_SUBJECT,
            context: BASE_CONTEXT,
        });
        expect(result.primary_state).toBe("needs_information");
        expect(result.ok).toBe(true);
        expect(result.gaps[0]?.level).toBe("recommended");
        expect(result.gaps[0]?.blocking).toBe(false);
    });

    it("returns needs_information for required guidance gaps on record_view", () => {
        const result = buildReadinessResult({
            trigger: "record_view",
            subject: BASE_SUBJECT,
            context: BASE_CONTEXT,
            gaps: [
                gap({
                    requirement_id: "child:location",
                    level: "required",
                    blocking: false,
                    label: "Child · Site / Location",
                }),
            ],
        });
        expect(result.primary_state).toBe("needs_information");
        expect(result.ok).toBe(true);
    });

    it("returns blocked for enforced gaps on action_execute", () => {
        const effective: EffectiveRequirementsResult = {
            ...emptyEffective(),
            ok: false,
            blocking: [
                {
                    field_key: "program_room_cohort_key",
                    label: "Child · Classroom or Room",
                    severity: "required",
                    reason: "Classroom is required.",
                    source: "action",
                },
            ],
        };
        const result = mapEffectiveRequirementsToReadinessResult(effective, {
            trigger: "action_execute",
            subject: BASE_SUBJECT,
            context: { ...BASE_CONTEXT, action_key: APPROVE_ENROLLMENT_ACTION_KEY },
        });
        expect(result.primary_state).toBe("blocked");
        expect(result.ok).toBe(false);
        expect(result.gaps[0]?.level).toBe("enforced");
        expect(result.gaps[0]?.blocking).toBe(true);
    });

    it("maps legacy effective requirements with compatibility metadata", () => {
        const effective = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: APPROVE_ENROLLMENT_ACTION_KEY,
            trigger: "action_execute",
            record: {
                id: "opp-1",
                status_key: "enrolling",
                _inquiry_children: [
                    {
                        id: "ocm-1",
                        program_category_id: "cat-infant",
                        program_room_cohort_key: "",
                        schedule_type: "full_day",
                        start_date: "2026-06-15",
                    },
                ],
            },
        });
        const readiness = mapEffectiveRequirementsToReadinessResult(effective, {
            trigger: "action_execute",
            subject: BASE_SUBJECT,
            context: { ...BASE_CONTEXT, action_key: APPROVE_ENROLLMENT_ACTION_KEY },
        });
        expect(readiness.legacy?.effective_requirements).toBe(effective);
        expect(readiness.legacy?.effective_requirements?.ok).toBe(effective.ok);
        expect(readiness.ok).toBe(effective.ok);
    });

    it("keeps counts aligned with gaps", () => {
        const gaps = [
            gap({ requirement_id: "a", level: "recommended", blocking: false }),
            gap({ requirement_id: "b", level: "required", blocking: false }),
            gap({ requirement_id: "c", level: "enforced", blocking: true }),
        ];
        const counts = buildReadinessCountsFromGaps(gaps, { configured: 5, satisfied: 2 });
        expect(counts.gaps_total).toBe(3);
        expect(counts.by_level.recommended).toBe(1);
        expect(counts.by_level.required).toBe(1);
        expect(counts.by_level.enforced).toBe(1);
        expect(counts.blocking).toBe(1);
        expect(counts.configured).toBe(5);
        expect(counts.satisfied).toBe(2);

        const result = buildReadinessResult({
            trigger: "action_execute",
            subject: BASE_SUBJECT,
            context: BASE_CONTEXT,
            gaps,
            counts,
        });
        expect(result.counts).toEqual(counts);
        expect(result.counts.gaps_total).toBe(result.gaps.length);
    });

    it("Phase 1 gaps use record scope only", () => {
        const result = buildReadinessResult({
            trigger: "record_view",
            subject: BASE_SUBJECT,
            context: BASE_CONTEXT,
            gaps: [gap({ requirement_id: "person:phone", level: "required" })],
        });
        expect(result.gaps.every((g) => g.scope_type === "record")).toBe(true);
    });

    it("derivePrimaryState respects severity order", () => {
        expect(
            derivePrimaryStateFromGaps([
                gap({ requirement_id: "r", level: "recommended" }),
                gap({ requirement_id: "e", level: "enforced", blocking: true }),
            ])
        ).toBe("blocked");
        expect(
            derivePrimaryStateFromGaps([gap({ requirement_id: "x", level: "required", failure_kind: "expired" })])
        ).toBe("expired");
    });

    it("mapEffectiveViolationToReadinessGap supports level override for guidance", () => {
        const mapped = mapEffectiveViolationToReadinessGap(
            {
                field_key: "child:location",
                label: "Child · Site / Location",
                severity: "required",
                reason: "Location is required.",
                source: "action",
            },
            { trigger: "record_view", asLevel: "required" }
        );
        expect(mapped.level).toBe("required");
        expect(mapped.blocking).toBe(false);
        expect(mapped.scope_type).toBe("record");
    });
});

describe("evaluateOperationalReadiness wrapper", () => {
    it("wraps legacy evaluation without changing block semantics", () => {
        const record = {
            id: "opp-1",
            status_key: "enrolling",
            _inquiry_children: [
                {
                    id: "ocm-1",
                    program_category_id: "cat-infant",
                    program_room_cohort_key: "",
                    schedule_type: "full_day",
                    start_date: "2026-06-15",
                },
            ],
        };
        const readiness = evaluateOperationalReadiness({
            org_id: "org-1",
            trigger: "action_execute",
            subject: BASE_SUBJECT,
            context: { department_id: "dept-1" },
            action_key: APPROVE_ENROLLMENT_ACTION_KEY,
            record,
        });
        expect(readiness.contract_version).toBe("1.0");
        expect(readiness.trigger).toBe("action_execute");
        expect(readiness.primary_state).toBe("blocked");
        expect(readiness.legacy?.effective_requirements?.ok).toBe(false);
    });

    it("readinessResultFromEffectiveRequirements returns ready for empty legacy result", () => {
        const readiness = readinessResultFromEffectiveRequirements(emptyEffective(), {
            trigger: "record_view",
            subject: BASE_SUBJECT,
            context: BASE_CONTEXT,
        });
        expect(readiness.primary_state).toBe("ready");
        expect(readiness.ok).toBe(true);
    });
});
