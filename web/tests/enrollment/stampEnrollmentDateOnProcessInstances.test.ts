/**
 * stampEnrollmentDateOnProcessInstances — process-grain Enrollment Date writer.
 */
import { describe, it, expect, vi } from "vitest";
import { stampEnrollmentDateOnProcessInstances } from "@/lib/enrollment/stampEnrollmentDateOnProcessInstances";
import { ENROLLMENT_DATE_METADATA_KEY } from "@/lib/enrollment/effectiveDateAuthority";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const CHILD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHILD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PI_A = "piaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PI_B = "pibbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type PiRow = {
    id: string;
    org_id: string;
    process_key: string;
    subject_type: string;
    subject_id: string;
    context_type: string;
    context_id: string;
    metadata: Record<string, unknown>;
};

function makeSupabase(rows: PiRow[]) {
    const updates: Array<{ id: string; metadata: Record<string, unknown> }> = [];
    return {
        updates,
        client: {
            from(table: string) {
                if (table !== "process_instances") throw new Error(`unexpected table ${table}`);
                let op: "select" | "update" = "select";
                let patch: Record<string, unknown> | null = null;
                const filters: Record<string, unknown> = {};
                const matching = () =>
                    rows.filter((r) => Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v));
                const builder: Record<string, unknown> = {
                    select() {
                        return builder;
                    },
                    update(p: Record<string, unknown>) {
                        op = "update";
                        patch = p;
                        return builder;
                    },
                    eq(col: string, val: unknown) {
                        filters[col] = val;
                        return builder;
                    },
                    then(resolve: (r: { data: unknown; error: null }) => void) {
                        const matched = matching();
                        if (op === "update" && patch) {
                            for (const r of matched) {
                                Object.assign(r, patch);
                                updates.push({
                                    id: r.id,
                                    metadata: (patch.metadata as Record<string, unknown>) ?? {},
                                });
                            }
                            resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
                            return;
                        }
                        resolve({ data: matched, error: null });
                    },
                };
                return builder;
            },
        } as never,
    };
}

function seedPi(id: string, subjectId: string, metadata: Record<string, unknown> = {}): PiRow {
    return {
        id,
        org_id: ORG,
        process_key: "enrollment",
        subject_type: "child",
        subject_id: subjectId,
        context_type: "opportunity",
        context_id: LEAD,
        metadata,
    };
}

describe("stampEnrollmentDateOnProcessInstances", () => {
    it("stamps paperwork completion onto child-scoped process instance", async () => {
        const rows = [seedPi(PI_A, CHILD_A, { start_date: "2026-09-01" }), seedPi(PI_B, CHILD_B)];
        const { client, updates } = makeSupabase(rows);

        const result = await stampEnrollmentDateOnProcessInstances(client, {
            orgId: ORG,
            opportunityId: LEAD,
            customerMemberId: CHILD_A,
            enrollmentDate: "2026-06-10",
            source: "paperwork_completion_outcome",
            actorUserId: "user-1",
            now: new Date("2026-06-10T15:00:00.000Z"),
        });

        expect(result.error).toBeUndefined();
        expect(result.stamped).toHaveLength(1);
        expect(result.stamped[0]).toMatchObject({
            processInstanceId: PI_A,
            subjectId: CHILD_A,
            wrote: true,
            refusedOverwrite: false,
        });
        expect(updates).toHaveLength(1);
        expect(updates[0]!.metadata[ENROLLMENT_DATE_METADATA_KEY]).toBe("2026-06-10");
        expect((updates[0]!.metadata.enrollment_date_evidence as { source: string }).source).toBe(
            "paperwork_completion_outcome",
        );
        // Sibling untouched
        expect(rows[1]!.metadata.enrollment_date).toBeUndefined();
    });

    it("stamps all children on the lead when no child scope is provided", async () => {
        const rows = [seedPi(PI_A, CHILD_A), seedPi(PI_B, CHILD_B)];
        const { client, updates } = makeSupabase(rows);

        const result = await stampEnrollmentDateOnProcessInstances(client, {
            orgId: ORG,
            opportunityId: LEAD,
            enrollmentDate: "2026-06-11",
            source: "compat_approve_enrollment",
            actorUserId: "approver",
            now: new Date("2026-06-11T12:00:00.000Z"),
        });

        expect(result.error).toBeUndefined();
        expect(result.stamped.map((s) => s.processInstanceId).sort()).toEqual([PI_A, PI_B].sort());
        expect(result.stamped.every((s) => s.wrote)).toBe(true);
        expect(updates).toHaveLength(2);
        expect(updates.every((u) => u.metadata[ENROLLMENT_DATE_METADATA_KEY] === "2026-06-11")).toBe(true);
    });

    it("refuses silent overwrite on reopen and does not write", async () => {
        const rows = [
            seedPi(PI_A, CHILD_A, {
                enrollment_date: "2026-06-01",
                enrollment_date_evidence: { source: "paperwork_completion_outcome" },
            }),
        ];
        const { client, updates } = makeSupabase(rows);

        const result = await stampEnrollmentDateOnProcessInstances(client, {
            orgId: ORG,
            opportunityId: LEAD,
            customerMemberId: CHILD_A,
            enrollmentDate: "2026-06-20",
            source: "paperwork_completion_outcome",
            now: new Date("2026-06-20T15:00:00.000Z"),
        });

        expect(result.stamped).toEqual([
            {
                processInstanceId: PI_A,
                subjectId: CHILD_A,
                wrote: false,
                refusedOverwrite: true,
            },
        ]);
        expect(updates).toHaveLength(0);
        expect(rows[0]!.metadata.enrollment_date).toBe("2026-06-01");
    });

    it("allows authorized correction overwrite", async () => {
        const rows = [seedPi(PI_A, CHILD_A, { enrollment_date: "2026-06-01" })];
        const { client, updates } = makeSupabase(rows);

        const result = await stampEnrollmentDateOnProcessInstances(client, {
            orgId: ORG,
            opportunityId: LEAD,
            processInstanceId: PI_A,
            enrollmentDate: "2026-06-03",
            source: "authorized_correction",
            actorUserId: "admin-1",
            reason: "Corrected after packet review",
            now: new Date("2026-06-05T10:00:00.000Z"),
        });

        expect(result.stamped[0]?.wrote).toBe(true);
        expect(updates[0]!.metadata.enrollment_date).toBe("2026-06-03");
        expect(
            (updates[0]!.metadata.enrollment_date_evidence as { previous_enrollment_date: string })
                .previous_enrollment_date,
        ).toBe("2026-06-01");
    });
});

describe("stamp_enrollment_date outcome target wiring", () => {
    it("default enrollment_complete rule includes stamp_enrollment_date", async () => {
        const { defaultStageOperatingPlanForEnrollmentStage } = await import(
            "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans"
        );
        const plan = defaultStageOperatingPlanForEnrollmentStage("enrollment");
        const rule = plan?.outcome_rules.find((r) => r.when_outcome_key === "enrollment_complete");
        expect(rule?.targets.some((t) => t.kind === "stamp_enrollment_date")).toBe(true);
    });

    it("parses stamp_enrollment_date as a valid target kind", async () => {
        const { parseStageOperatingPlanV1 } = await import("@/lib/lifecycle/stageOperatingPlanV1");
        const parsed = parseStageOperatingPlanV1({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "enrollment",
            journey_segment: "child",
            work_templates: [],
            outcomes: [{ outcome_key: "enrollment_complete", label: "Done", successful: true }],
            outcome_rules: [
                {
                    rule_key: "stamp",
                    when_outcome_key: "enrollment_complete",
                    targets: [{ kind: "stamp_enrollment_date" }],
                },
            ],
            attention_rules: [],
        });
        expect(parsed?.outcome_rules[0]?.targets).toEqual([{ kind: "stamp_enrollment_date" }]);
    });
});
