/**
 * Project drawer_open while promoting active_subject.stage_key onto stage_focus_key.
 * (Unit coverage lives in queuePreviewRowContextProjection.test.ts.)
 */

import { describe, expect, it } from "vitest";
import { projectQueuePreviewRowContext } from "@/lib/queues/queuePreviewRowContextProjection";
import { queueRowVariantMatchInputFromContext } from "@/lib/presentation/runtime/queueRowVariantResolve";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

function baseContext(over: Partial<QueueRowContext> = {}): QueueRowContext {
    return {
        contract_version: 1,
        row_subject: { subject_type: "case", subject_id: "c1", display_name: "Kurzman" },
        row_stage: "Waitlist",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "Open",
        case_context: {
            case_id: "c1",
            display_name: "Kurzman",
            case_type_label: "",
            case_status_key: "",
            case_status_label: "Open",
        },
        primary_contact: null,
        related_subjects_summary: [],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: {
            entity_type: "opportunities",
            entity_id: "o1",
            active_subject: {
                subject_type: "case",
                subject_id: "c1",
                display_name: "Kurzman",
                stage_key: "waitlist",
            },
        },
        ...over,
    } as QueueRowContext;
}

describe("queue preview projection preserves variant stage match", () => {
    it("promotes active_subject.stage_key to stage_focus_key when projecting", () => {
        const projected = projectQueuePreviewRowContext(baseContext());
        expect(projected.drawer_open.active_subject).toBeUndefined();
        expect(projected.drawer_open.stage_focus_key).toBe("waitlist");
        const input = queueRowVariantMatchInputFromContext(projected, { workViewId: null });
        expect(input.stageKey).toBe("waitlist");
    });

    it("keeps wait_since on the wire for compact waitlist fields", () => {
        const projected = projectQueuePreviewRowContext(
            baseContext({
                waitlist_context: { position_label: "#2", wait_since: "5d" },
            }),
        );
        expect(projected.waitlist_context?.position_label).toBe("#2");
        expect(projected.waitlist_context?.wait_since).toBe("5d");
    });
});
