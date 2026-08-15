/**
 * D-96 — the running instance's governing configuration.
 *
 * Three claims are proven here; the storage-layer ones (immutability, tenant and process identity,
 * FK semantics) belong to `certification/process-instance-revision-pin/` because a trigger's refusal
 * is only evidence when a real database does the refusing:
 *
 *   1. the pin rides the CREATION insert — never a follow-up patch;
 *   2. `resolveProcessInstanceConfiguration` is the one owner of pinned-vs-live, and a pinned
 *      instance never reaches live configuration;
 *   3. the Class-A Current Work path is governed by the pinned revision, while Class-B surfaces keep
 *      showing current configuration.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    buildEnrollmentProcessInstanceInsert,
    createEnrollmentProcessInstance,
} from "@/lib/process/processInstances";
import { resolveProcessInstanceConfiguration } from "@/lib/process/resolveProcessInstanceConfiguration";
import { resolvePublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { __clearConfigReadCacheForTests } from "@/lib/runtime/provisioning/configReadCache";

const ORG = "11111111-1111-4111-8111-111111111111";
const REV_N = "aaaaaaaa-0000-4000-8000-000000000001";

function stagePayload(ruleId: string, workLabel = "Governing work") {
    const templateKey = workLabel.toLowerCase().replace(/\s+/g, "_");
    return {
        version: 1,
        active_process_id: "p1",
        processes: [
            {
                id: "p1",
                key: "enrollment",
                name: "Enrollment",
                is_active: true,
                stages: [
                    {
                        id: "s1",
                        key: "enrollment",
                        label: "Enrollment",
                        sort_order: 1,
                        is_active: true,
                        requirements_v1: {
                            version: 1,
                            requirements: [
                                {
                                    requirement_id: `legacy:field:${ruleId}`,
                                    kind: "field",
                                    rule_id: ruleId,
                                    level: "required",
                                },
                            ],
                        },
                        stage_operating_plan_v1: {
                            version: 1,
                            lifecycle_key: "enrollment",
                            stage_key: "enrollment",
                            journey_segment: "child",
                            purpose: `Purpose from ${ruleId}`,
                            work_templates: [
                                {
                                    template_key: templateKey,
                                    label: workLabel,
                                    work_definition_key: "contact_family",
                                    owner_strategy: "record_owner",
                                    execution_mode: "direct_action",
                                    due_policy: { kind: "same_day" },
                                },
                            ],
                            outcomes: [],
                            outcome_rules: [],
                            attention_rules: [],
                        },
                    },
                ],
            },
        ],
    };
}

beforeEach(() => {
    __clearConfigReadCacheForTests();
});

// ---------------------------------------------------------------------------
// 1. The pin is part of the creating insert
// ---------------------------------------------------------------------------

describe("the governing revision is pinned atomically at creation", () => {
    it("rides the same insert row, not a follow-up patch", () => {
        const row = buildEnrollmentProcessInstanceInsert({
            orgId: ORG,
            subjectId: "child-1",
            businessProcessRevisionId: REV_N,
        });
        expect(row.business_process_revision_id).toBe(REV_N);
    });

    it("omits the column entirely when unresolved, rather than sending null", () => {
        // The database refuses to CLEAR a pin. An upsert that named the column with a null value
        // would be attempting exactly that on a conflict path.
        const row = buildEnrollmentProcessInstanceInsert({ orgId: ORG, subjectId: "child-1" });
        expect("business_process_revision_id" in row).toBe(false);
    });

    it("all three callers inherit the pin without passing anything", async () => {
        // The three production callers — startEnrollmentService, createLeadChildOcmPersistence and
        // the Processing identity ports — call this helper with no revision id. Resolution happens
        // INSIDE it, which is what makes one wiring change cover all three.
        const inserted: Record<string, unknown>[] = [];
        const supabase = fakeSupabase({ publishedRevisionId: REV_N, capture: inserted });

        const result = await createEnrollmentProcessInstance(supabase, {
            orgId: ORG,
            subjectId: "child-1",
        });

        expect(result.revisionPinOutcome).toBe("pinned");
        expect(inserted[0]!.business_process_revision_id).toBe(REV_N);
    });

    it("GATE 0B: a multi-department org pins from the journey's OWN context", async () => {
        // `Org -> Department -> Work unit -> Record`, schema-enforced: `opportunities.work_unit_id`
        // is a real FK and `work_units.department_id` is NOT NULL. Two departments each publish an
        // Enrollment process; the context chain picks the right one instead of refusing.
        const inserted: Record<string, unknown>[] = [];
        const supabase = fakeSupabase({
            enrollmentDepartments: { "dept-a": "rev-a", "dept-b": "rev-b" },
            opportunityWorkUnit: { "opp-1": "wu-b" },
            workUnitDepartment: { "wu-b": "dept-b" },
            capture: inserted,
        });

        const result = await createEnrollmentProcessInstance(supabase, {
            orgId: ORG,
            subjectId: "child-1",
            contextId: "opp-1",
        });

        expect(result.revisionPinOutcome).toBe("pinned");
        expect(inserted[0]!.business_process_revision_id).toBe("rev-b");
    });

    it("GATE 0B: context is consulted even when the org has ONE department", async () => {
        // Deliberately not short-circuited by the single-department case, so the chain is exercised
        // by every tenant and cannot rot unnoticed until the day a second department appears.
        const inserted: Record<string, unknown>[] = [];
        const supabase = fakeSupabase({
            enrollmentDepartments: { "dept-a": "rev-a" },
            opportunityWorkUnit: { "opp-1": "wu-a" },
            workUnitDepartment: { "wu-a": "dept-a" },
            capture: inserted,
        });

        await createEnrollmentProcessInstance(supabase, {
            orgId: ORG,
            subjectId: "child-1",
            contextId: "opp-1",
        });
        expect(inserted[0]!.business_process_revision_id).toBe("rev-a");
    });

    it("GATE 0B: an unassigned Opportunity falls back, it does not fail", async () => {
        // A lead created before work-unit assignment genuinely has no department. With one
        // Enrollment department there is still nothing to disambiguate.
        const inserted: Record<string, unknown>[] = [];
        const supabase = fakeSupabase({
            enrollmentDepartments: { "dept-a": "rev-a" },
            opportunityWorkUnit: {},
            capture: inserted,
        });

        const result = await createEnrollmentProcessInstance(supabase, {
            orgId: ORG,
            subjectId: "child-1",
            contextId: "opp-1",
        });
        expect(result.revisionPinOutcome).toBe("pinned");
        expect(inserted[0]!.business_process_revision_id).toBe("rev-a");
    });

    it("GATE 0B STOP: a CONTEXT-FREE journey in a multi-department org still refuses", async () => {
        // The residual ambiguity, kept explicit. Start Enrollment from a durable Child record has no
        // Opportunity, so no fact in the system says which department governs. Picking one would
        // bind a family to a configuration nobody chose, and the pin is immutable.
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const inserted: Record<string, unknown>[] = [];
        const supabase = fakeSupabase({
            enrollmentDepartments: { "dept-a": "rev-a", "dept-b": "rev-b" },
            capture: inserted,
        });

        const result = await createEnrollmentProcessInstance(supabase, {
            orgId: ORG,
            subjectId: "child-1",
        });

        expect(result.revisionPinOutcome).toBe("ambiguous_multiple_enrollment_departments");
        expect("business_process_revision_id" in inserted[0]!).toBe(false);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("D-96"));
        warn.mockRestore();
    });

    it("never writes an unpinned instance SILENTLY", async () => {
        // A tenant with no published Enrollment configuration has nothing to pin, and refusing to
        // start their journeys would be a far worse failure than starting one unpinned. What is
        // forbidden is doing it QUIETLY.
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const inserted: Record<string, unknown>[] = [];
        const supabase = fakeSupabase({ publishedRevisionId: null, capture: inserted });

        const result = await createEnrollmentProcessInstance(supabase, {
            orgId: ORG,
            subjectId: "child-1",
        });

        expect(result.revisionPinOutcome).toBe("no_published_enrollment_configuration");
        expect("business_process_revision_id" in inserted[0]!).toBe(false);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("D-96"));
        warn.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 2. One owner of the pinned-vs-live branch
// ---------------------------------------------------------------------------

describe("resolveProcessInstanceConfiguration owns the branch", () => {
    it("a pinned instance resolves from the revision", async () => {
        const config = await resolveProcessInstanceConfiguration({
            supabase: fakeSupabase({ revisionPayload: stagePayload("child:first_name") }),
            orgId: ORG,
            processInstance: {
                process_key: "enrollment",
                stage_key: "enrollment",
                business_process_revision_id: REV_N,
            },
            departmentMetadata: { lifecycle_builder_v1: stagePayload("child:classroom") },
        });

        expect(config.source).toBe("pinned_revision");
        expect(config.revisionId).toBe(REV_N);
        expect(config.stage?.requirements_v1?.requirements[0]?.ref).toEqual({
            kind: "field",
            rule_id: "child:first_name",
        });
    });

    it("a pinned instance never falls back to live configuration", async () => {
        // Even with live metadata present and DIFFERENT. Falling back would silently change which
        // rules govern a journey, which is the failure D-96 exists to prevent.
        const config = await resolveProcessInstanceConfiguration({
            supabase: fakeSupabase({ revisionPayload: null }),
            orgId: ORG,
            processInstance: {
                process_key: "enrollment",
                stage_key: "enrollment",
                business_process_revision_id: REV_N,
            },
            departmentMetadata: { lifecycle_builder_v1: stagePayload("child:classroom") },
        });

        expect(config.source).toBe("pinned_revision");
        expect(config.builder).toBeNull();
        expect(JSON.stringify(config)).not.toContain("child:classroom");
    });

    it("an unpinned historical instance resolves from the live projection, as before", async () => {
        const config = await resolveProcessInstanceConfiguration({
            supabase: fakeSupabase({}),
            orgId: ORG,
            processInstance: {
                process_key: "enrollment",
                stage_key: "enrollment",
                business_process_revision_id: null,
            },
            departmentMetadata: { lifecycle_builder_v1: stagePayload("child:classroom") },
        });

        expect(config.source).toBe("live_projection");
        expect(config.revisionId).toBeNull();
        expect(config.stage?.requirements_v1?.requirements[0]?.ref).toEqual({
            kind: "field",
            rule_id: "child:classroom",
        });
    });
});

// ---------------------------------------------------------------------------
// 3. Class A is governed; Class B still shows current configuration
// ---------------------------------------------------------------------------

describe("Class-A current work is governed by the pinned revision", () => {
    const LIVE = { lifecycle_builder_v1: stagePayload("child:classroom") };
    const GOVERNING = stagePayload("child:first_name");

    it("operating plan, action catalog and requirements all come from the revision", () => {
        const governed = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: LIVE,
            builderStageKey: "enrollment",
            governingBuilderPayload: GOVERNING,
        });

        expect(governed?.operatingPlan.purpose).toBe("Purpose from child:first_name");
        expect(governed?.fieldRules?.required_rule_ids).toEqual(["child:first_name"]);
    });

    it("does not drift when a newer revision is published", () => {
        // Publishing replaces `lifecycle_builder_v1` wholesale. The governed answer must not move.
        const before = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: LIVE,
            builderStageKey: "enrollment",
            governingBuilderPayload: GOVERNING,
        });
        const afterPublish = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: { lifecycle_builder_v1: stagePayload("child:start_date") },
            builderStageKey: "enrollment",
            governingBuilderPayload: GOVERNING,
        });

        expect(afterPublish?.operatingPlan).toEqual(before?.operatingPlan);
        expect(afterPublish?.fieldRules).toEqual(before?.fieldRules);
    });

    it("a pinned stage's requirements beat a LIVE legacy override", () => {
        // `effectiveFieldRulesForBuilderStage` prefers `lifecycle_progression_requirements_v1`, so
        // without canonical-first resolution a pinned journey would keep picking up legacy edits
        // made after it started.
        const governed = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: {
                ...LIVE,
                lifecycle_progression_requirements_v1: {
                    version: 1,
                    stages: {
                        enrollment: { field_rules: { required_rule_ids: ["child:start_date"] } },
                    },
                },
            },
            builderStageKey: "enrollment",
            governingBuilderPayload: GOVERNING,
        });

        expect(governed?.fieldRules?.required_rule_ids).toEqual(["child:first_name"]);
    });

    it("GATE 0A: stage-work runtime is governed by the same revision, not live config", () => {
        // The stage's work templates, grain, outcomes and completion policy are all
        // transaction-governing. Before Gate 0A `projectStageWorkRuntime` still read live
        // `lifecycle_builder_v1` while `resolvePublishedStageInputsForCurrentWork` read the pinned
        // revision — revision N requirements beside revision N+1 execution behaviour, in one
        // response object.
        const governed = projectStageWorkRuntimeSync({
            orgId: ORG,
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata: { lifecycle_builder_v1: stagePayload("child:classroom", "Live work") },
            governingBuilderPayload: stagePayload("child:first_name", "Governing work"),
            builderStageKey: "enrollment",
        });

        expect(governed?.template_keys).toEqual(["governing_work"]);
        expect(governed?.primary?.label).toBe("Governing work");
    });

    it("GATE 0A: both halves of the slice agree on one revision", () => {
        // The invariant, stated directly: what the stage REQUIRES and what the stage EXECUTES must
        // come from the same artifact.
        const governingPayload = stagePayload("child:first_name", "Governing work");
        const live = { lifecycle_builder_v1: stagePayload("child:classroom", "Live work") };

        const inputs = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: live,
            builderStageKey: "enrollment",
            governingBuilderPayload: governingPayload,
        });
        const runtime = projectStageWorkRuntimeSync({
            orgId: ORG,
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata: live,
            governingBuilderPayload: governingPayload,
            builderStageKey: "enrollment",
        });

        expect(inputs?.operatingPlan.work_templates.map((t) => t.template_key)).toEqual(
            runtime?.template_keys,
        );
    });

    it("GATE 0A: with no governing payload the runtime still reads live config", () => {
        const live = projectStageWorkRuntimeSync({
            orgId: ORG,
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata: { lifecycle_builder_v1: stagePayload("child:classroom", "Live work") },
            builderStageKey: "enrollment",
        });
        expect(live?.template_keys).toEqual(["live_work"]);
    });

    it("CLASS B: with no governing payload, current configuration still answers", () => {
        // Builder authoring, form coverage and latest-config discovery must keep showing what is
        // published NOW. They pass no governing payload, and nothing about their answer changes.
        const classB = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: LIVE,
            builderStageKey: "enrollment",
        });

        expect(classB?.operatingPlan.purpose).toBe("Purpose from child:classroom");
    });
});

// ---------------------------------------------------------------------------
// A minimal Supabase stand-in — only the four reads these paths make.
// ---------------------------------------------------------------------------

function fakeSupabase(opts: {
    publishedRevisionId?: string | null;
    revisionPayload?: Record<string, unknown> | null;
    capture?: Record<string, unknown>[];
    /** departmentId -> revisionId, for departments whose latest publication configures Enrollment. */
    enrollmentDepartments?: Record<string, string>;
    opportunityWorkUnit?: Record<string, string>;
    workUnitDepartment?: Record<string, string>;
}) {
    const departments: Record<string, string> =
        opts.enrollmentDepartments ??
        (opts.publishedRevisionId ? { "dept-1": opts.publishedRevisionId } : {});

    const rowsFor = (table: string): unknown[] => {
        if (table === "configuration_publications") {
            return Object.entries(departments).map(([subject_id, revision_id], i) => ({
                revision_id,
                subject_id,
                revision_number: i + 1,
            }));
        }
        if (table === "business_process_revisions") {
            // The pinned read goes through maybeSingle() and wants a payload; the resolution read is
            // a list and wants an id. One row shape serves both.
            if (opts.revisionPayload !== undefined) {
                return opts.revisionPayload
                    ? [{ id: opts.publishedRevisionId ?? "rev", payload: opts.revisionPayload }]
                    : [];
            }
            return Object.values(departments).map((id) => ({
                id,
                payload: stagePayload("child:first_name"),
            }));
        }
        return [];
    };

    return {
        from(table: string) {
            const rows = rowsFor(table);
            const filters: Record<string, unknown> = {};
            // One object that is BOTH the chain and the awaitable result — PostgREST builders are
            // thenable, and the list reads here await the builder rather than calling maybeSingle().
            const chain: Record<string, unknown> = {
                maybeSingle: async () => {
                    if (table === "opportunities") {
                        const wu = opts.opportunityWorkUnit?.[String(filters.id ?? "")] ?? null;
                        return { data: { work_unit_id: wu }, error: null };
                    }
                    if (table === "work_units") {
                        const dept = opts.workUnitDepartment?.[String(filters.id ?? "")] ?? null;
                        return { data: { department_id: dept }, error: null };
                    }
                    return { data: rows[0] ?? null, error: null };
                },
                then: (resolve: (v: unknown) => unknown) =>
                    Promise.resolve(resolve({ data: rows, error: null })),
                insert: (row: Record<string, unknown>) => {
                    opts.capture?.push(row);
                    return {
                        select: () => ({
                            maybeSingle: async () => ({ data: { id: "created-instance" }, error: null }),
                        }),
                    };
                },
                // The context-bearing path upserts on `ux_process_instances_scope`.
                upsert: (row: Record<string, unknown>) => {
                    opts.capture?.push(row);
                    return {
                        select: () => ({
                            maybeSingle: async () => ({ data: { id: "created-instance" }, error: null }),
                        }),
                    };
                },
            };
            chain.eq = (col: string, val: unknown) => {
                filters[col] = val;
                return chain;
            };
            for (const key of ["select", "in", "is", "order", "limit"]) {
                chain[key] = () => chain;
            }
            return chain;
        },
    } as never;
}
