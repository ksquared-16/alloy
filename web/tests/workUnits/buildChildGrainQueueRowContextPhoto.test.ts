import { describe, expect, it } from "vitest";

import { RESOLVED_PHOTO_URL_KEY } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";
import { buildChildGrainQueueRowContext } from "@/lib/workUnits/buildChildGrainQueueRowContext";

const OCM = "cccccccc-0000-4000-8000-0000000000oc";
const PERSON = "11111111-0000-4000-8000-00000000000a";
const OPP = "oooooooo-0000-4000-8000-0000000000op";
const PHOTO = "https://x.supabase.co/storage/v1/object/sign/org_documents/a/b.png?token=FRESH";

const queue = {
    key: "lifecycle_waitlist",
    label: "Waitlist",
    lifecycle_key: "enrollment",
    stage_key: "waitlist",
    subject_grain: "child" as const,
    count_unit: "children" as const,
};

function childGrainRow(inquiryChild: Record<string, unknown>): Record<string, unknown> {
    return {
        id: `ocmrow:${OPP}:${OCM}`,
        opportunity_id: OPP,
        row_grain: "child",
        opportunity_customer_member_id: OCM,
        _child_display_name: "Lennon Kurzman",
        _customer_name: "Kurzman",
        _ocm_enrollment_track_row: {
            opportunity_customer_member_id: OCM,
            outcome_status_key: "waitlisted",
            stage_key: "waitlist",
        },
        _inquiry_children: [inquiryChild],
    };
}

describe("buildChildGrainQueueRowContext — subject image_url", () => {
    it("projects resolved_photo_url from inquiry child onto row_subject.image_url", () => {
        const ctx = buildChildGrainQueueRowContext({
            row: childGrainRow({
                id: OCM,
                ocm_id: OCM,
                person_id: PERSON,
                display_name: "Lennon Kurzman",
                [RESOLVED_PHOTO_URL_KEY]: PHOTO,
            }),
            queue,
        });

        expect(ctx).not.toBeNull();
        expect(ctx!.row_subject.image_url).toBe(PHOTO);
    });

    it("omits image_url when inquiry child has no presentable photo", () => {
        const ctx = buildChildGrainQueueRowContext({
            row: childGrainRow({
                id: OCM,
                ocm_id: OCM,
                person_id: PERSON,
                display_name: "Lennon Kurzman",
                // Signed URL under photo_url is dropped by the identity adapter.
                photo_url:
                    "https://x.supabase.co/storage/v1/object/sign/org_documents/a/b.png?token=STALE",
            }),
            queue,
        });

        expect(ctx).not.toBeNull();
        expect(ctx!.row_subject.image_url == null || ctx!.row_subject.image_url === "").toBe(true);
    });
});
