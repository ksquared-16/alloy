/**
 * Family-grain Work Views (All / Tours) share one row materialization path.
 * Count/cohort admitting a family subject must yield a renderable queue row —
 * the same builder, not a Tours-specific mapping.
 */
import { describe, expect, it } from "vitest";
import { queueRowModelFromQueueItem } from "@/lib/presentation/runtime/types";
import { workUnitSurfaceModelFromSnapshot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { OperationalPresentation } from "@/lib/runtime/provisioning/operationalPresentation";

const FAMILY_SUBJECT_ID = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";

const presentation = {
    header: {
        title: "New Leads",
        subtitle: "Respond before it goes cold",
        identityIcon: "user-plus",
        identityAccent: null,
        kpiSlots: [
            { slot: 1, label: "Needs attention", icon: "users", accent: null, sourceKey: "ctx.wu.attention" },
        ],
    },
    queue: {
        rowVariant: "crm_compact",
        rowSlots: { subject: {}, status: {}, contact: {}, attention: {}, work: {}, groupCount: {} },
        rowVariants: [],
        fallbackSlots: [],
    },
    focusPanel: {
        situation: { subjectPlacement: "panel_header", businessStatePlacement: "panel_header" },
        decision: { purposePlacement: "panel_body" },
        action: { primaryActionPlacement: "panel_header" },
        contextFramePlacement: "panel_header",
        scopeStatePlacement: "panel_boundary",
    },
    provenance: {
        queueLayoutId: "ql",
        focusPanelLayoutId: "fp",
        headerSource: "published",
        queueRowSource: "published",
        queueRowSurfaceId: "surface-1",
        queueRowResolvedSource: "published",
        queueRowVariant: null,
        queueRowIneffectiveFieldKeys: [],
    },
} as unknown as OperationalPresentation;

function familyRowContext() {
    return {
        contract_version: 1,
        row_subject: {
            subject_type: "case",
            subject_id: FAMILY_SUBJECT_ID,
            display_name: "Kurzman Family",
            stage_key: "waitlist",
        },
        drawer_open: {
            entity_type: "opportunities",
            entity_id: FAMILY_SUBJECT_ID,
            active_subject: {
                subject_type: "case",
                subject_id: FAMILY_SUBJECT_ID,
                case_id: FAMILY_SUBJECT_ID,
                stage_key: "waitlist",
            },
            stage_focus_key: "waitlist",
        },
        case_context: { display_name: "Kurzman Family" },
        row_stage: "Waitlist",
        row_status_label: "Tour Scheduled",
    };
}

function familyOperationalAnswer(activeWorkViewId: string, label: string): ProvisioningAnswer {
    return {
        terminal: "operational",
        orgId: "org-1",
        workUnit: { id: "wu-leads", key: "new_leads", name: "New Leads", departmentId: "dept-1" },
        businessProcess: { key: "enrollment", name: "Enrollment" },
        activeWorkView: { id: activeWorkViewId, label },
        lensSet: [
            { id: "new_work_view_5", label: "Tours", displayOrder: 1 },
            { id: "new_work_view_6", label: "All", displayOrder: 2 },
        ],
        rowGrain: "family",
        subjectGrain: { grain: "case", subjectType: "opportunity" },
        rows: [
            {
                id: FAMILY_SUBJECT_ID,
                stageKey: "waitlist",
                statusKey: "open",
                updatedAt: null,
                title: "Kurzman Family",
                context: familyRowContext() as never,
            },
        ],
        recordOfAttention: {
            id: FAMILY_SUBJECT_ID,
            strategy: "first_row",
            strategySource: "declared_fallback",
        },
        contextFrame: { workViewId: activeWorkViewId, workViewLabel: label },
        focusPanelScopeState: "in_scope",
        focusPanelOutOfView: null,
        currentBusinessState: {
            stageKey: "waitlist",
            stageLabel: "Waitlist",
            purpose: "p",
            workTemplateKey: "review",
            workTemplateLabel: "Review",
            required: true,
        },
        primaryAction: null,
        presentation,
        settlement: null,
        actionsProjection: null,
        timings: {
            authorization_ms: 0,
            work_unit_ms: 0,
            configuration_ms: 0,
            presentation_ms: 0,
            records_ms: 0,
            projection_ms: 0,
            composition_ms: 0,
            total_ms: 1,
        },
    } as unknown as ProvisioningAnswer;
}

describe("family-grain queue row materialization (All + Tours)", () => {
    it("maps one canonical family subject to one renderable queue row model", () => {
        const model = queueRowModelFromQueueItem(
            { id: FAMILY_SUBJECT_ID, _queue_row_context: familyRowContext() as never },
            "opportunity",
        );
        expect(model).not.toBeNull();
        expect(model!.entityId).toBe(FAMILY_SUBJECT_ID);
        expect(model!.context?.row_subject?.subject_type).toBe("case");
        expect(model!.context?.drawer_open.entity_id).toBe(FAMILY_SUBJECT_ID);
    });

    it.each([
        ["new_work_view_6", "All"],
        ["new_work_view_5", "Tours"],
    ] as const)("%s family-grain answer → surface model rows=1", (viewId, label) => {
        const snapshot = familyOperationalAnswer(viewId, label);
        if (snapshot.terminal !== "operational") throw new Error("expected operational answer");
        expect(snapshot.rows).toHaveLength(1);
        const surface = workUnitSurfaceModelFromSnapshot(snapshot);
        expect(surface.queue.rows).toHaveLength(1);
        expect(surface.queue.rows[0]?.entityId).toBe(FAMILY_SUBJECT_ID);
        expect(surface.activeWorkViewId).toBe(viewId);
        expect(surface.queue.error).toBeNull();
    });

    it("Waitlist → All → Tours lens commits: totals match rendered rows and Focus shares the family subject", () => {
        // Staging failure mode: Settlement badges All=1 / Tours=1 while the committed family page was
        // empty after an in-page LENS switch from Waitlist. Client commit must materialize the same
        // family subject for both family lenses once the answer carries that cohort.
        const waitlistChildren = ["child-lennon", "child-wrigley"] as const;
        const waitlistAnswer = {
            ...familyOperationalAnswer("new_work_view_4", "Waitlist"),
            rowGrain: "child",
            subjectGrain: { grain: "child", subjectType: "child" },
            rows: waitlistChildren.map((id, i) => ({
                id,
                stageKey: "waitlist",
                statusKey: "open",
                updatedAt: null,
                title: i === 0 ? "Lennon Kurzman" : "Wrigley Kurzman",
                context: {
                    contract_version: 1,
                    row_subject: { subject_type: "child", subject_id: id, display_name: "child" },
                    drawer_open: {
                        entity_type: "children",
                        entity_id: id,
                        active_subject: { subject_type: "child", subject_id: id },
                    },
                },
            })),
            recordOfAttention: {
                id: waitlistChildren[0],
                strategy: "first_row",
                strategySource: "declared_fallback",
            },
        } as unknown as ProvisioningAnswer;

        const waitlistSurface = workUnitSurfaceModelFromSnapshot(
            waitlistAnswer.terminal === "operational" || waitlistAnswer.terminal === "empty"
                ? waitlistAnswer
                : (waitlistAnswer as never),
        );
        expect(waitlistSurface.queue.rows).toHaveLength(2);
        expect(waitlistSurface.queue.totalCount === null || waitlistSurface.queue.totalCount === 2).toBe(true);

        const allSurface = workUnitSurfaceModelFromSnapshot(familyOperationalAnswer("new_work_view_6", "All") as never);
        expect(allSurface.queue.rows).toHaveLength(1);
        expect(allSurface.queue.rows[0]?.entityId).toBe(FAMILY_SUBJECT_ID);
        expect(allSurface.selectedRecordId).toBe(FAMILY_SUBJECT_ID);

        const toursSurface = workUnitSurfaceModelFromSnapshot(familyOperationalAnswer("new_work_view_5", "Tours") as never);
        expect(toursSurface.queue.rows).toHaveLength(1);
        expect(toursSurface.queue.rows[0]?.entityId).toBe(FAMILY_SUBJECT_ID);
        expect(toursSurface.selectedRecordId).toBe(FAMILY_SUBJECT_ID);
        expect(toursSurface.selectedRecordId).toBe(allSurface.selectedRecordId);
    });
});
