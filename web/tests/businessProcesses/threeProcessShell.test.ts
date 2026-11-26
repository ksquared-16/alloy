/**
 * BP V2 Slice 1 — three distinct Business Processes (Enrollment, Assignments, Billing) through the
 * EXISTING configuration → publication → catalog → landing card → tile chain.
 *
 * What is certified here, per the Slice 1 gate:
 *   1. Enrollment is unchanged: its card is identical with or without the two new processes beside it.
 *   2/3. Assignments and Billing each appear as their own catalog entry and their own card.
 *   4. Neither new card routes into Enrollment (no `new_leads`, no pipeline lanes, no surface fields).
 *   5. Publication accepts a domain-projection shell and refuses lifecycle config on it.
 *   6. Department access still decides visibility.
 *   7. Unsupported execution is explicitly unavailable (null entry + reason), never a fallback.
 */

import { describe, expect, it } from "vitest";

import { buildOperatorLifecycleLandingCards } from "@/lib/admin/buildOperatorLifecycleLanding";
import { isEnrollmentLifecycleCard } from "@/lib/admin/enrollmentOperationalSurfaceLanding";
import {
    PUBLISH_DOMAIN_PROJECTION_LIFECYCLE_CONFIG,
    PUBLISH_EMPTY_PROCESS,
    PUBLISH_PROCESS_MODEL_UNKNOWN,
    PUBLISH_PROJECTION_WORK_VIEW_INVALID,
    validateBusinessProcessForPublish,
} from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    createLifecycleProcess,
    emptyLifecycleBuilderV1,
    parseLifecycleBuilderV1,
    serializeLifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { catalogEntriesFromDepartmentRows } from "@/lib/lifecycle/lifecycleCatalog";
import {
    DOMAIN_PROJECTION_WORK_VIEWS_UNAVAILABLE,
    parseProcessModelV1,
    processModelForCreateChoice,
    processModelV1Problem,
    resolveProcessModel,
} from "@/lib/lifecycle/processModelV1";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { processTileModelFromLandingCard } from "@/lib/presentation/runtime/types";
import {
    businessProcessForProcess,
    defaultSignalKeyForProcessIdentity,
    processCardConfigKey,
} from "@/lib/presentation/runtime/workspaceProcessSignal";
import { isVisibleQueueRowCatalogEntry } from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import { workspaceProcessConfigKey } from "@/lib/adminV2/settings/surfaces/workspaceProcessCatalog";

const ENROLLMENT_DEPT = "11111111-1111-4111-8111-111111111111";
const ASSIGNMENTS_DEPT = "22222222-2222-4222-8222-222222222222";
const BILLING_DEPT = "33333333-3333-4333-8333-333333333333";

function enrollmentProcess() {
    return {
        id: "proc-enrollment",
        key: "enrollment",
        name: "Enrollment",
        primary_entity: "opportunity",
        sort_order: 0,
        is_active: true,
        stages: [
            { id: "s-lead", key: "lead", label: "Lead", sort_order: 0, is_active: true },
            { id: "s-tour", key: "tour", label: "Tour", sort_order: 1, is_active: true },
        ],
        work_views_v1: [
            { id: "new_leads", label: "New Leads", compat_queue_key: "new_leads", display_order: 0 },
            { id: "tours", label: "Tours", compat_queue_key: "tours", display_order: 1 },
        ],
    };
}

function projectionProcess(domain: "assignments" | "billing", extra: Record<string, unknown> = {}) {
    return {
        id: `proc-${domain}`,
        key: domain,
        name: domain === "assignments" ? "Assignments" : "Billing",
        process_model_v1: { kind: "domain_projection", domain },
        sort_order: 0,
        is_active: true,
        stages: [],
        ...extra,
    };
}

function builder(process: Record<string, unknown>) {
    return { version: 1, active_process_id: process.id, processes: [process] };
}

const departments = () => [
    { id: ENROLLMENT_DEPT, key: "lead_management", name: "Enrollment", is_active: true, metadata: { lifecycle_builder_v1: builder(enrollmentProcess()) } },
    { id: ASSIGNMENTS_DEPT, key: "assignments", name: "Assignments", is_active: true, metadata: { lifecycle_builder_v1: builder(projectionProcess("assignments")) } },
    { id: BILLING_DEPT, key: "billing", name: "Billing", is_active: true, metadata: { lifecycle_builder_v1: builder(projectionProcess("billing")) } },
];

const enrollmentWorkUnits = [
    {
        id: "wu-pipeline",
        department_id: ENROLLMENT_DEPT,
        key: "enrollment_pipeline",
        name: "Enrollment Pipeline",
        queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
    },
];

function catalog(deptRows = departments(), allowed: (id: string) => boolean = () => true) {
    return catalogEntriesFromDepartmentRows(deptRows, {
        workspaceById: new Map(deptRows.map((d) => [d.id, { name: d.name }])),
        wuCountByDept: new Map([[ENROLLMENT_DEPT, 1]]),
        departmentIdAllowed: allowed,
    });
}

function landing(deptRows = departments(), workUnits: typeof enrollmentWorkUnits = enrollmentWorkUnits, allowed?: (id: string) => boolean) {
    return buildOperatorLifecycleLandingCards({
        catalogEntries: catalog(deptRows, allowed),
        departments: deptRows,
        workUnits,
    });
}

describe("process_model_v1 configuration contract", () => {
    it("absent model resolves to staged lifecycle (every existing revision keeps its meaning)", () => {
        const parsed = parseLifecycleBuilderV1(builder(enrollmentProcess()))!;
        expect(parsed.processes[0]!.process_model_v1).toBeUndefined();
        expect(resolveProcessModel(parsed.processes[0])).toEqual({ kind: "staged_lifecycle" });
        expect(parsed.processes[0]!.primary_entity).toBe("opportunity");
    });

    it("a domain projection round-trips and claims no Opportunity / Lead primary entity", () => {
        const parsed = parseLifecycleBuilderV1(builder(projectionProcess("billing")))!;
        expect(parsed.processes[0]!.process_model_v1).toEqual({ kind: "domain_projection", domain: "billing" });
        expect(parsed.processes[0]!.primary_entity).toBeUndefined();
        const wire = serializeLifecycleBuilderV1(parsed) as { processes: Record<string, unknown>[] };
        expect(wire.processes[0]!.process_model_v1).toEqual({ kind: "domain_projection", domain: "billing" });
        expect("primary_entity" in wire.processes[0]!).toBe(false);
    });

    it("an unreadable model is neither defaulted away nor dropped on save", () => {
        const raw = builder(projectionProcess("billing", { process_model_v1: { kind: "domain_projection", domain: "payroll" } }));
        const parsed = parseLifecycleBuilderV1(raw)!;
        expect(parsed.processes[0]!.process_model_v1).toBeUndefined();
        const wire = serializeLifecycleBuilderV1(parsed) as { processes: Record<string, unknown>[] };
        expect(wire.processes[0]!.process_model_v1).toEqual({ kind: "domain_projection", domain: "payroll" });
        expect(processModelV1Problem(wire.processes[0]!.process_model_v1)).toMatch(/Unknown domain “payroll”/);
    });

    it("parses only known kinds and domains", () => {
        expect(parseProcessModelV1({ kind: "staged_lifecycle" })).toEqual({ kind: "staged_lifecycle" });
        expect(parseProcessModelV1({ kind: "domain_projection", domain: "assignments" })).not.toBeNull();
        expect(parseProcessModelV1({ kind: "domain_projection" })).toBeNull();
        expect(parseProcessModelV1({ kind: "workflow" })).toBeNull();
        expect(processModelV1Problem({ kind: "workflow" })).toMatch(/Unknown process model/);
        expect(processModelV1Problem(undefined)).toBeNull();
    });

    it("createLifecycleProcess writes the declared model and no primary entity for a projection", () => {
        const created = createLifecycleProcess("Billing", emptyLifecycleBuilderV1(), {
            process_model: processModelForCreateChoice("billing"),
        });
        expect(created.processes[0]).toMatchObject({ key: "billing", process_model_v1: { kind: "domain_projection", domain: "billing" }, stages: [] });
        expect(created.processes[0]!.primary_entity).toBeUndefined();

        const staged = createLifecycleProcess("Incidents", emptyLifecycleBuilderV1(), {
            process_model: processModelForCreateChoice("staged_lifecycle"),
        });
        expect(staged.processes[0]!.primary_entity).toBe("opportunity");
        expect(staged.processes[0]!.process_model_v1).toBeUndefined();
    });
});

describe("publication gate for domain projections", () => {
    it("publishes an Assignments / Billing shell with no errors and no empty-process warning", () => {
        for (const domain of ["assignments", "billing"] as const) {
            const result = validateBusinessProcessForPublish(builder(projectionProcess(domain)));
            expect(result.errors).toEqual([]);
            expect(result.warnings.map((w) => w.code)).not.toContain(PUBLISH_EMPTY_PROCESS);
        }
    });

    it("refuses active stages and entry points by name; a view without a registered projection (S2) too", () => {
        const result = validateBusinessProcessForPublish(
            builder(
                projectionProcess("billing", {
                    stages: [{ id: "s1", key: "review", label: "Review", sort_order: 0, is_active: true }],
                    work_views_v1: [{ id: "overdue", label: "Overdue" }],
                    entry_points_v1: { by_intent: { create_lead: "review" } },
                }),
            ),
        );
        const refused = result.errors.filter((e) => e.code === PUBLISH_DOMAIN_PROJECTION_LIFECYCLE_CONFIG);
        expect(refused.map((e) => (e.detail as { section: string }).section).sort()).toEqual([
            "entry_points_v1",
            "stages",
        ]);
        expect(refused.every((e) => e.message.includes("Billing process"))).toBe(true);
        // BP V2 Slice 2: Work Views are allowed on a projection, but only naming a registered
        // projection — this one names none, so it is still refused, under its own code.
        expect(
            result.errors
                .filter((e) => e.code === PUBLISH_PROJECTION_WORK_VIEW_INVALID)
                .map((e) => e.path),
        ).toEqual(["processes[billing].work_views_v1[overdue].projection_key"]);
    });

    it("an inactive stage on a projection is not a lifecycle and does not block", () => {
        const result = validateBusinessProcessForPublish(
            builder(projectionProcess("assignments", {
                stages: [{ id: "s1", key: "old", label: "Old", sort_order: 0, is_active: false }],
            })),
        );
        expect(result.errors).toEqual([]);
    });

    it("refuses an unknown domain instead of publishing it as a staged lifecycle", () => {
        const result = validateBusinessProcessForPublish(
            builder(projectionProcess("billing", { process_model_v1: { kind: "domain_projection", domain: "payroll" } })),
        );
        expect(result.errors.map((e) => e.code)).toEqual([PUBLISH_PROCESS_MODEL_UNKNOWN]);
    });

    it("leaves staged-lifecycle validation exactly as it was (explicit model ≡ absent model)", () => {
        const absent = validateBusinessProcessForPublish(builder(enrollmentProcess()));
        const explicit = validateBusinessProcessForPublish(
            builder({ ...enrollmentProcess(), process_model_v1: { kind: "staged_lifecycle" } }),
        );
        expect(explicit).toEqual(absent);
        // The existing empty-process warning still fires for a lifecycle with no stages.
        const empty = validateBusinessProcessForPublish(builder({ ...enrollmentProcess(), stages: [], work_views_v1: [] }));
        expect(empty.warnings.map((w) => w.code)).toContain(PUBLISH_EMPTY_PROCESS);
    });
});

describe("process catalog — three distinct processes", () => {
    it("lists each process under its own identity, department and model", () => {
        const entries = catalog();
        expect(entries.map((e) => [e.lifecycle_name, e.process_key, e.department_id, e.process_model])).toEqual([
            ["Assignments", "assignments", ASSIGNMENTS_DEPT, { kind: "domain_projection", domain: "assignments" }],
            ["Billing", "billing", BILLING_DEPT, { kind: "domain_projection", domain: "billing" }],
            ["Enrollment", "enrollment", ENROLLMENT_DEPT, { kind: "staged_lifecycle" }],
        ]);
        expect(new Set(entries.map((e) => e.id)).size).toBe(3);
    });

    it("department access still gates visibility", () => {
        const cards = landing(departments(), enrollmentWorkUnits, (id) => id !== BILLING_DEPT);
        expect(cards.map((c) => c.label)).toEqual(["Assignments", "Enrollment"]);
    });
});

describe("/workspace landing cards", () => {
    it("Enrollment's card is identical with or without Assignments and Billing beside it", () => {
        const alone = landing(departments().filter((d) => d.id === ENROLLMENT_DEPT));
        const withSiblings = landing();
        expect(alone).toHaveLength(1);
        expect(withSiblings).toHaveLength(3);
        expect(withSiblings.find((c) => c.departmentId === ENROLLMENT_DEPT)).toEqual(alone[0]);
        expect(alone[0]!.entryHref).toBe("/workspace/work-unit/new-leads");
        expect(alone[0]!.workQueues.map((q) => q.href)).toEqual([
            "/workspace/work-unit/new-leads",
            "/workspace/work-unit/tours",
        ]);
        expect(alone[0]!.operationalStory).toBeTruthy();
    });

    it("Assignments and Billing never route into Enrollment and say they are not available yet", () => {
        const cards = landing();
        for (const dept of [ASSIGNMENTS_DEPT, BILLING_DEPT]) {
            const card = cards.find((c) => c.departmentId === dept)!;
            expect(card.entryHref).toBeNull();
            expect(card.unavailableReason).toBe(DOMAIN_PROJECTION_WORK_VIEWS_UNAVAILABLE);
            expect(card.workQueues).toEqual([]);
            expect(card.operationalStory).toBeUndefined();
            expect(card.todaysWork).toBeUndefined();
            expect(card.activeRecordCount).toBeNull();
            expect(card.needsAttentionCount).toBeNull();
            expect(JSON.stringify(card)).not.toMatch(/new[-_]leads|enrollment_pipeline/);
        }
    });

    it("a projection gets no lane fallback even when its department has work units", () => {
        const cards = landing(departments(), [
            ...enrollmentWorkUnits,
            { ...enrollmentWorkUnits[0]!, id: "wu-billing-pipe", department_id: BILLING_DEPT },
        ]);
        const billing = cards.find((c) => c.departmentId === BILLING_DEPT)!;
        expect(billing.workQueues).toEqual([]);
        expect(billing.entryHref).toBeNull();
    });

    it("a projection whose name contains Lead is still not Enrollment", () => {
        const rows = departments();
        (rows[2]!.metadata.lifecycle_builder_v1.processes[0] as { name: string }).name = "Lead Billing";
        const card = landing(rows).find((c) => c.departmentId === BILLING_DEPT)!;
        expect(isEnrollmentLifecycleCard(card)).toBe(false);
        expect(card.entryHref).toBeNull();
        expect(card.operationalStory).toBeUndefined();
    });

    it("a staged non-Enrollment lifecycle with nothing to enter no longer borrows `new_leads`", () => {
        const rows = [
            {
                id: ASSIGNMENTS_DEPT,
                key: "incidents",
                name: "Incidents",
                is_active: true,
                metadata: { lifecycle_builder_v1: builder({ id: "proc-inc", key: "incidents", name: "Incidents", primary_entity: "opportunity", sort_order: 0, is_active: true, stages: [] }) },
            },
        ];
        const [card] = landing(rows, []);
        expect(card!.entryHref).toBeNull();
        expect(card!.unavailableReason).toMatch(/No Work Views/);
        expect(card!.operationalStory).toBeUndefined();
    });

    it("tile model carries the unavailable state and never fabricates a destination", () => {
        const billing = landing().find((c) => c.departmentId === BILLING_DEPT)!;
        const tile = processTileModelFromLandingCard(billing);
        expect(tile.entryHref).toBeNull();
        expect(tile.unavailableReason).toBe(DOMAIN_PROJECTION_WORK_VIEWS_UNAVAILABLE);
        expect(tile.destination).toBeNull();
        expect(tile.workViews).toEqual([]);
        expect(tile.primarySignal).toBeNull();

        const enrollment = landing().find((c) => c.departmentId === ENROLLMENT_DEPT)!;
        expect(processTileModelFromLandingCard(enrollment).unavailableReason).toBeNull();
    });
});

describe("Work View selection is per process", () => {
    it("a second process in a department does not inherit the active process's Work Views", () => {
        const metadata = {
            lifecycle_builder_v1: {
                version: 1,
                active_process_id: "proc-enrollment",
                processes: [enrollmentProcess(), projectionProcess("billing")],
            },
        };
        expect(savedWorkViewsFromDepartmentMetadata(metadata).map((v) => v.id)).toEqual(["new_leads", "tours"]);
        expect(savedWorkViewsFromDepartmentMetadata(metadata, "proc-enrollment").map((v) => v.id)).toEqual(["new_leads", "tours"]);
        expect(savedWorkViewsFromDepartmentMetadata(metadata, "proc-billing")).toEqual([]);
        expect(savedWorkViewsFromDepartmentMetadata(metadata, "proc-missing")).toEqual([]);
    });
});

describe("tile signal identity is declared, not inferred", () => {
    const billing = { processKey: "billing", processModel: { kind: "domain_projection", domain: "billing" } as const };
    const assignments = { processKey: "assignments", processModel: { kind: "domain_projection", domain: "assignments" } as const };

    it("Enrollment keeps its key-derived business process and default signal", () => {
        expect(businessProcessForProcess({ processKey: "enrollment" })).toBe("enrollment");
        expect(defaultSignalKeyForProcessIdentity({ processKey: "enrollment" })).toBe("enrollment.time_to_schedule_tour");
        expect(processCardConfigKey({ processKey: "enrollment" })).toBe("enrollment");
    });

    it("Billing reads Financials' family; Assignments has none and invents none", () => {
        expect(businessProcessForProcess(billing)).toBe("financial");
        expect(businessProcessForProcess(assignments)).toBeNull();
        expect(defaultSignalKeyForProcessIdentity(assignments)).toBeNull();
        // No financial calculation is registered for the tile today — so no default signal either.
        expect(defaultSignalKeyForProcessIdentity(billing)).toBeNull();
    });

    it("a projection keyed `lead_billing` is not Enrollment by text", () => {
        expect(
            businessProcessForProcess({ processKey: "lead_billing", processModel: billing.processModel }),
        ).toBe("financial");
    });

    it("Surface Builder and the tile key card identity identically", () => {
        for (const entry of catalog()) {
            expect(workspaceProcessConfigKey(entry)).toBe(
                processCardConfigKey({ processKey: entry.process_key, processModel: entry.process_model }),
            );
        }
        expect(processCardConfigKey(assignments)).toBe("assignments");
    });

    it("queue-row layouts are not offered for a process with no queue", () => {
        expect(catalog().filter(isVisibleQueueRowCatalogEntry).map((e) => e.process_key)).toEqual(["enrollment"]);
    });
});
