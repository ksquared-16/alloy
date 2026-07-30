/**
 * HONEST, NOT FATAL — a refusal must not also remove the way out.
 *
 * THE DEFECT THIS PINS WAS LIVE, ON THE CERTIFIED TENANT (measured 2026-07-30, Firefly):
 * `/workspace/work-unit/active-pipeline` is a destination the operator's sidebar renders. Its Work View
 * spans two Row Grains (`family` from `lead`, `child` from `decision`), so law G-1 refuses it — correctly.
 * But the error terminal discarded the lens set, so the surface rendered:
 *
 *     header "Follow Up"
 *     Work View "Active Pipeline": lens spans 2 Row Grains (family, child) — a surface cannot be…
 *     Select a record to begin
 *
 * with ZERO lens pills, no retry, and (sidebar collapsed by default) no in-surface route anywhere else.
 * A correct refusal had become a dead end.
 *
 * Two invariants are guarded here, and they are deliberately separate:
 *   1. NAVIGABILITY — a refusal that happens AFTER lenses resolve carries the lens set through.
 *   2. HONESTY — a refusal that happens BEFORE lenses resolve carries `null`, not an invented frame.
 *
 * Invariant 2 matters as much as 1: offering an empty pill strip would be a false affordance, and
 * offering a stale one would be a lie about which lens is active.
 */

import { describe, expect, it } from "vitest";
import {
    provisioningErrorKind,
    type ProvisioningAnswer,
    type ProvisioningErrorCode,
} from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { workUnitSurfaceModelFromSnapshot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";

const TIMINGS = {
    authorization_ms: 0,
    work_unit_ms: 0,
    configuration_ms: 0,
    presentation_ms: 0,
    records_ms: 0,
    projection_ms: 0,
    composition_ms: 0,
    total_ms: 0,
};

/** The real shape Firefly produces: five configured lenses, the ambiguous one active. */
const FIREFLY_FRAME = {
    lensSet: [
        { id: "new_work_view_1", label: "New Leads", displayOrder: 0 },
        { id: "new_work_view_2", label: "Active Pipeline", displayOrder: 1 },
        { id: "new_work_view_3", label: "Registration", displayOrder: 2 },
        { id: "new_work_view_4", label: "Waitlist", displayOrder: 3 },
        { id: "new_work_view_5", label: "Tours", displayOrder: 4 },
    ],
    activeWorkView: { id: "new_work_view_2", label: "Active Pipeline" },
};

const refusal = (
    code: ProvisioningErrorCode,
    frame: typeof FIREFLY_FRAME | null,
): ProvisioningAnswer => ({
    terminal: "error",
    code,
    message: `Work View "Active Pipeline": lens spans 2 Row Grains (family, child) — a surface cannot be grain-ambiguous`,
    orgId: "93667019-bd28-49b5-a688-acc9bb1e0a19",
    workUnit: { id: "wu-1", key: "lifecycle_wu_follow_up", name: "Follow Up" },
    navigationFrame: frame,
    timings: TIMINGS,
});

describe("a refusal keeps the operator's way out", () => {
    it("carries every configured lens through a grain-ambiguous refusal", () => {
        const model = workUnitSurfaceModelFromSnapshot(refusal("grain_ambiguous", FIREFLY_FRAME));
        expect(model.workViews.map((v) => v.label)).toEqual([
            "New Leads",
            "Active Pipeline",
            "Registration",
            "Waitlist",
            "Tours",
        ]);
        // The operator must be able to see WHICH lens failed, so the refused one stays marked active.
        expect(model.workViews.filter((v) => v.isActive).map((v) => v.id)).toEqual(["new_work_view_2"]);
        expect(model.activeWorkViewId).toBe("new_work_view_2");
    });

    it("still refuses the surface itself — no rows, no subject, error intact", () => {
        const model = workUnitSurfaceModelFromSnapshot(refusal("grain_ambiguous", FIREFLY_FRAME));
        expect(model.queue.rows).toEqual([]);
        expect(model.selectedRecordId).toBeNull();
        expect(model.queue.error).toContain("grain-ambiguous");
        // A refusal is a committed place, not a pending one — unchanged by this fix.
        expect(model.ready).toBe(true);
    });

    it("claims NO counts on a refusal — counts are settlement, and this answer never got there", () => {
        const model = workUnitSurfaceModelFromSnapshot(refusal("grain_ambiguous", FIREFLY_FRAME));
        for (const v of model.workViews) {
            // A zero would be a claim about the lane. Null renders no badge, which is the truth.
            expect(v.count).toBeNull();
            expect(v.attentionCount).toBeNull();
            expect(v.overdueCount).toBeNull();
            expect(v.primaryGrainCount).toBeNull();
            expect(v.supportingGrainCount).toBeNull();
        }
        expect(model.queue.totalCount).toBeNull();
    });

    it("offers NOTHING when the refusal predates lens resolution — an empty strip would be a false affordance", () => {
        // `unauthorized` / `work_unit_not_found` / `no_business_process` / `no_active_view` all fail
        // before any lens exists, and the kernel's deadline + transport terminals never see one either.
        const model = workUnitSurfaceModelFromSnapshot(refusal("work_unit_not_found", null));
        expect(model.workViews).toEqual([]);
        expect(model.activeWorkViewId).toBeNull();
        expect(model.queue.error).toBeTruthy();
    });
});

describe("a refusal says what KIND of problem it is", () => {
    it("classifies every error code — the surface could not previously tell config from missing data", () => {
        // Total over the union: adding a code without classifying it is a compile error, not a silent
        // fallthrough to an anonymous red sentence.
        expect(provisioningErrorKind("unauthorized")).toBe("authorization");
        expect(provisioningErrorKind("work_unit_not_found")).toBe("configuration");
        expect(provisioningErrorKind("no_business_process")).toBe("configuration");
        expect(provisioningErrorKind("no_active_view")).toBe("configuration");
        expect(provisioningErrorKind("grain_ambiguous")).toBe("configuration");
        expect(provisioningErrorKind("no_truthful_primary_action")).toBe("configuration");
        expect(provisioningErrorKind("subject_unavailable")).toBe("subject");
        expect(provisioningErrorKind("records_unavailable")).toBe("records");
    });

    it("puts the kind on the surface model so a renderer can distinguish them", () => {
        expect(workUnitSurfaceModelFromSnapshot(refusal("grain_ambiguous", FIREFLY_FRAME)).queue.errorKind).toBe(
            "configuration",
        );
        expect(workUnitSurfaceModelFromSnapshot(refusal("subject_unavailable", FIREFLY_FRAME)).queue.errorKind).toBe(
            "subject",
        );
        // The distinction that was missing entirely: a tenant must fix the first; nobody can "fix" the second.
        expect(provisioningErrorKind("grain_ambiguous")).not.toBe(provisioningErrorKind("subject_unavailable"));
    });
});
