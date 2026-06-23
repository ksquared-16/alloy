/**
 * Business Process Layout Assignment — resolver and settings wiring tests.
 */

import { describe, expect, it } from "vitest";
import type { BusinessProcessLayoutAssignmentRecord } from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import {
    layoutAssignmentSurfaceKeyForRuntime,
    matchBusinessProcessLayoutAssignment,
} from "@/lib/layout/resolveBusinessProcessLayoutAssignment";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildWaitlistCandidateCardDefaultDoc } from "@/lib/layout/defaultWaitlistLayouts";
import { layoutAssignmentSlotsForStage } from "@/lib/layout/layoutAssignmentSlots";
import { layoutAssignmentContextFromQueueLane } from "@/lib/layout/buildLayoutAssignmentContext";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";

function assignment(partial: Partial<BusinessProcessLayoutAssignmentRecord> & Pick<BusinessProcessLayoutAssignmentRecord, "id" | "surfaceKey">): BusinessProcessLayoutAssignmentRecord {
    return {
        orgId: "org-1",
        businessProcessKey: "enrollment",
        stageKey: null,
        statusKey: null,
        entityType: "opportunities",
        surface: "drawer",
        layoutKey: "default",
        entityLayoutId: null,
        priority: 0,
        isActive: true,
        version: 1,
        metadata: null,
        createdBy: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: null,
        ...partial,
    };
}

function layoutRecord(id: string, doc: LayoutDoc, partial?: Partial<EntityLayoutRecord>): EntityLayoutRecord {
    return {
        id,
        orgId: "org-1",
        industryKey: null,
        entityType: doc.entityType,
        surface: doc.surface,
        layoutKey: "default",
        name: "Test layout",
        version: 1,
        status: "published",
        isSystemDefault: false,
        doc,
        metadata: null,
        createdBy: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: null,
        publishedAt: "2026-01-01T00:00:00Z",
        ...partial,
    };
}

describe("layoutAssignmentSlotsForStage", () => {
    it("lead stage shows queue + drawer slots", () => {
        const slots = layoutAssignmentSlotsForStage("lead");
        expect(slots.map((s) => s.slotId)).toEqual(["queue", "drawer", "person_drawer"]);
    });

    it("waitlist stage shows waitlist queue slot", () => {
        const slots = layoutAssignmentSlotsForStage("waitlist");
        expect(slots.some((s) => s.surfaceKey === "waitlist_queue_record")).toBe(true);
        expect(slots.some((s) => s.surfaceKey === "queue_record")).toBe(false);
    });

    it("enrolled stage shows child drawer slot", () => {
        const slots = layoutAssignmentSlotsForStage("enrolled");
        expect(slots.map((s) => s.slotId)).toContain("child_drawer");
    });
});

describe("matchBusinessProcessLayoutAssignment", () => {
    const assignments: BusinessProcessLayoutAssignmentRecord[] = [
        assignment({
            id: "a-lead-queue",
            surfaceKey: "queue_record",
            stageKey: "lead",
            layoutKey: "lead_queue",
            surface: "queue",
        }),
        assignment({
            id: "a-tour-queue",
            surfaceKey: "queue_record",
            stageKey: "tour",
            layoutKey: "tour_queue",
            surface: "queue",
        }),
        assignment({
            id: "a-shared-drawer",
            surfaceKey: "opportunity_drawer",
            stageKey: null,
            layoutKey: "shared_drawer",
        }),
        assignment({
            id: "a-waitlist-queue",
            surfaceKey: "waitlist_queue_record",
            stageKey: "waitlist",
            entityType: "placement_candidate",
            surface: "queue",
            layoutKey: "waitlist_candidate_card",
        }),
        assignment({
            id: "a-enrolled-child",
            surfaceKey: "child_drawer",
            stageKey: "enrolled",
            entityType: "child",
            surface: "drawer",
        }),
    ];

    it("assigning different queue layouts to lead vs tour resolves per stage", () => {
        const lead = matchBusinessProcessLayoutAssignment(assignments, "queue_record", {
            businessProcessKey: "enrollment",
            stageKey: "lead",
        });
        const tour = matchBusinessProcessLayoutAssignment(assignments, "queue_record", {
            businessProcessKey: "enrollment",
            stageKey: "tour",
        });
        expect(lead?.assignment.layoutKey).toBe("lead_queue");
        expect(tour?.assignment.layoutKey).toBe("tour_queue");
    });

    it("lead and tour share BP default drawer when no stage-specific drawer assignment", () => {
        const lead = matchBusinessProcessLayoutAssignment(assignments, "opportunity_drawer", {
            businessProcessKey: "enrollment",
            stageKey: "lead",
        });
        const tour = matchBusinessProcessLayoutAssignment(assignments, "opportunity_drawer", {
            businessProcessKey: "enrollment",
            stageKey: "tour",
        });
        expect(lead?.assignment.id).toBe("a-shared-drawer");
        expect(tour?.assignment.id).toBe("a-shared-drawer");
    });

    it("waitlist stage resolves waitlist queue layout assignment", () => {
        const match = matchBusinessProcessLayoutAssignment(assignments, "waitlist_queue_record", {
            businessProcessKey: "enrollment",
            stageKey: "waitlist",
        });
        expect(match?.assignment.id).toBe("a-waitlist-queue");
    });

    it("enrolled stage resolves child drawer assignment", () => {
        const match = matchBusinessProcessLayoutAssignment(assignments, "child_drawer", {
            businessProcessKey: "enrollment",
            stageKey: "enrolled",
        });
        expect(match?.assignment.id).toBe("a-enrolled-child");
    });
});

describe("layoutAssignmentContextFromQueueLane", () => {
    it("passes business process key and derived stage", () => {
        const ctx = layoutAssignmentContextFromQueueLane({
            businessProcessKey: "enrollment",
            drillWorkUnitKey: "lifecycle_wu_lead",
        });
        expect(ctx?.businessProcessKey).toBe("enrollment");
        expect(ctx?.stageKey).toBe("lead");
    });

    it("returns undefined without business process key", () => {
        expect(layoutAssignmentContextFromQueueLane({ stageKey: "lead" })).toBeUndefined();
    });
});

describe("resolveLayout with assignment record", () => {
    it("prefers assignment record over org default", () => {
        const assignedDoc = buildLeadDrawerDefaultDoc();
        const assigned = layoutRecord("assigned-1", assignedDoc);
        const resolution = resolveLayout({
            entityType: "opportunities",
            surface: "drawer",
            assignmentRecord: assigned,
            assignmentMatchTier: "process_stage",
            orgRecords: [],
            defaultRecords: [],
        });
        expect(resolution.record?.id).toBe("assigned-1");
        expect(resolution.matchTier).toBe("process_stage");
    });
});

describe("layoutAssignmentSurfaceKeyForRuntime", () => {
    it("maps waitlist queue entity type", () => {
        expect(
            layoutAssignmentSurfaceKeyForRuntime({
                entityType: "placement_candidate",
                surface: "queue",
                isWaitlist: true,
            }),
        ).toBe("waitlist_queue_record");
    });

    it("maps pipeline queue", () => {
        expect(
            layoutAssignmentSurfaceKeyForRuntime({
                entityType: "opportunities",
                surface: "queue",
            }),
        ).toBe("queue_record");
    });
});

describe("validateBusinessProcessLayoutAssignment", () => {
    it("rejects waitlist layout on pipeline queue slot", async () => {
        const { validateBusinessProcessLayoutAssignmentInput } = await import(
            "@/lib/layout/validateBusinessProcessLayoutAssignment"
        );
        const waitlistDoc = buildWaitlistCandidateCardDefaultDoc();
        const record = layoutRecord("w-1", waitlistDoc, {
            entityType: "placement_candidate",
            surface: "queue",
            layoutKey: "waitlist_candidate_card",
        });
        const result = validateBusinessProcessLayoutAssignmentInput({
            businessProcessKey: "enrollment",
            stageKey: "lead",
            surfaceKey: "queue_record",
            layoutRecord: record,
        });
        expect(result.ok).toBe(false);
    });
});

describe("BP settings layout assignment UX wiring", () => {
    it("lifecycle hub includes per-stage layout assignments card", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const hub = readFileSync(
            resolve(process.cwd(), "components/adminV2/settings/LifecycleHubClient.tsx"),
            "utf8",
        );
        expect(hub).toContain("LifecycleStageLayoutAssignmentsCard");
        expect(hub).toContain('id: "layouts"');
    });

    it("layouts settings page is library-only (no BP assignment panel)", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const page = readFileSync(
            resolve(process.cwd(), "app/adminV2/settings/layouts/LayoutsSettingsPageClient.tsx"),
            "utf8",
        );
        expect(page).not.toContain("BusinessProcessLayoutAssignmentsPanel");
        expect(page).toContain("LayoutGalleryClient");
    });
});

describe("generic person/child resolver (no enrollment hardcoding)", () => {
    it("person drawer evaluator uses opportunity context resolver", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(process.cwd(), "lib/layout/runtime/evaluatePersonLayoutRuntimeBody.ts"),
            "utf8",
        );
        expect(src).toContain("resolveLayoutAssignmentContextFromOpportunity");
        expect(src).not.toContain("defaultEnrollmentLayoutAssignmentContext");
    });

    it("child drawer evaluator uses opportunity context resolver", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(process.cwd(), "lib/layout/runtime/evaluateChildLayoutRuntimeBody.ts"),
            "utf8",
        );
        expect(src).toContain("resolveLayoutAssignmentContextFromOpportunity");
        expect(src).not.toContain("defaultEnrollmentLayoutAssignmentContext");
    });
});
