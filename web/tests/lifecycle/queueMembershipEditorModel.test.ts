import { describe, expect, it } from "vitest";
import {
    applySubjectTypeChange,
    queueMembershipDraftDirty,
    queueMembershipDraftToPersisted,
    queueMembershipEditorDraftFromSaved,
} from "@/lib/lifecycle/queueMembershipEditorModel";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import {
    QUEUE_MEMBERSHIP_SUBJECT_LABELS,
    defaultCountUnitForSubject,
} from "@/lib/lifecycle/queueMembershipUiLabels";

describe("queueMembershipEditorModel", () => {
    it("hydrates draft from saved membership", () => {
        const saved = defaultEnrollmentQueueMembershipForStage("tour")!;
        const draft = queueMembershipEditorDraftFromSaved(saved, "tour");
        expect(draft.subject_type).toBe("case");
        expect(draft.count_unit).toBe("cases");
        // S4: default membership carries no status/disposition keys (membership is by stage_key).
        expect(draft.included_keys).toEqual([]);
    });

    it("splits case container keys into included_status_keys", () => {
        const draft = queueMembershipEditorDraftFromSaved(null, "lead");
        const persisted = queueMembershipDraftToPersisted(
            {
                ...draft,
                subject_type: "case",
                count_unit: "cases",
                included_keys: ["open", "new_inquiry"],
            },
            "lead",
        );
        expect(persisted?.included_status_keys).toEqual(["open"]);
        expect(persisted?.included_disposition_keys).toEqual(["new_inquiry"]);
    });

    it("stores child dispositions in included_disposition_keys", () => {
        const draft = queueMembershipEditorDraftFromSaved(null, "tour");
        const persisted = queueMembershipDraftToPersisted(
            {
                ...draft,
                subject_type: "child",
                included_keys: ["tour_scheduled"],
            },
            "tour",
        );
        expect(persisted?.included_disposition_keys).toEqual(["tour_scheduled"]);
        expect(persisted?.included_status_keys).toBeUndefined();
    });

    it("detects dirty draft", () => {
        const saved = defaultEnrollmentQueueMembershipForStage("waitlist")!;
        const draft = queueMembershipEditorDraftFromSaved(saved, "waitlist");
        expect(queueMembershipDraftDirty(saved, draft, "waitlist")).toBe(false);
        expect(
            queueMembershipDraftDirty(saved, { ...draft, included_keys: ["custom"] }, "waitlist"),
        ).toBe(true);
    });

    it("resets keys when subject changes", () => {
        const draft = queueMembershipEditorDraftFromSaved(
            defaultEnrollmentQueueMembershipForStage("tour")!,
            "tour",
        );
        const next = applySubjectTypeChange(draft, "candidate");
        expect(next.subject_type).toBe("candidate");
        expect(next.count_unit).toBe(defaultCountUnitForSubject("candidate"));
        expect(next.included_keys).toEqual([]);
    });
});

describe("queueMembershipUiLabels", () => {
    it("uses operator language for subjects", () => {
        expect(QUEUE_MEMBERSHIP_SUBJECT_LABELS.case).toBe("Families / leads");
        expect(QUEUE_MEMBERSHIP_SUBJECT_LABELS.child).toBe("Children in enrollment");
        expect(QUEUE_MEMBERSHIP_SUBJECT_LABELS.candidate).toBe("Waitlist candidates");
    });
});
