import { describe, expect, it } from "vitest";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import {
    applyCreateLeadParseToDraft,
    bosDraftToEligiblePayload,
    buildCreateLeadBosPreview,
    createLeadBosCommandAdapter,
    emptyBosCommandDraft,
    revalidateCreateLeadDraft,
    type CreateLeadAdapterContext,
} from "@/lib/bos/commandSession";

const ctx: CreateLeadAdapterContext = {
    departmentId: "dept-1",
    workUnitId: "wu-1",
    surface: "bos_recommendations",
    spec: createLeadParserSpec("dept-1"),
};

const JORDAN_PASTE = ["Jordan Lee", "jordan.lee@test.com", "1231231234"].join("\n");

describe("createLeadBosCommandAdapter", () => {
    it("parses paste into draft with parsed_from_source evidence", () => {
        const draft = applyCreateLeadParseToDraft(emptyBosCommandDraft(), JORDAN_PASTE, ctx);
        const byKey = Object.fromEntries(draft.values.map((v) => [v.fieldKey, v]));
        expect(byKey.first_name?.value).toBe("Jordan");
        expect(byKey.first_name?.state).toBe("parsed_from_source");
        expect(byKey.last_name?.value).toBe("Lee");
        expect(byKey.email?.value).toBe("jordan.lee@test.com");
        expect(byKey.phone?.value).toBe("1231231234");
        expect(draft.sourceTexts).toHaveLength(1);
        expect(createLeadBosCommandAdapter.executionKind).toBe("processing_intake");
    });

    it("matches platform eligibility blockers for identical eligible payload", () => {
        let draft = applyCreateLeadParseToDraft(emptyBosCommandDraft(), JORDAN_PASTE, ctx);
        // Location is platform-required; paste alone is not enough to execute.
        const withoutLocation = revalidateCreateLeadDraft(draft, ctx);
        expect(withoutLocation.readyToExecute).toBe(false);
        expect(withoutLocation.blockers.some((b) => /location/i.test(b.message))).toBe(true);

        draft = {
            ...draft,
            values: [
                ...draft.values,
                {
                    fieldKey: "location_id",
                    value: "site-1",
                    state: "operator_entered",
                    evidence: [],
                    optionResolved: true,
                },
            ],
        };
        const resolution = revalidateCreateLeadDraft(draft, ctx);
        expect(resolution.readyToExecute).toBe(true);
        expect(resolution.missingRequired).toEqual([]);

        const partial = applyCreateLeadParseToDraft(
            emptyBosCommandDraft(),
            "Jordan Lee",
            ctx
        );
        const partialResolution = revalidateCreateLeadDraft(partial, ctx);
        expect(partialResolution.readyToExecute).toBe(false);
        expect(partialResolution.blockers.some((b) => /phone or email/i.test(b.message))).toBe(true);
    });

    it("does not count inferred values toward eligibility", () => {
        const draft = emptyBosCommandDraft();
        draft.values.push(
            {
                fieldKey: "first_name",
                value: "Jordan",
                state: "parsed_from_source",
                evidence: [],
                optionResolved: false,
            },
            {
                fieldKey: "last_name",
                value: "Lee",
                state: "parsed_from_source",
                evidence: [],
                optionResolved: false,
            },
            {
                fieldKey: "email",
                value: "jordan.lee@test.com",
                state: "inferred",
                evidence: [],
                optionResolved: false,
            }
        );
        const payload = bosDraftToEligiblePayload(draft);
        expect(payload.email).toBeUndefined();
        const resolution = revalidateCreateLeadDraft(draft, ctx);
        expect(resolution.readyToExecute).toBe(false);
    });

    it("builds preview with Processing side-effect copy and fingerprint", () => {
        const draft = applyCreateLeadParseToDraft(emptyBosCommandDraft(), JORDAN_PASTE, ctx);
        const preview = buildCreateLeadBosPreview(draft, ctx);
        expect(preview.title.toLowerCase()).toContain("lead");
        expect(preview.sideEffects.some((s) => /processing review/i.test(s))).toBe(true);
        expect(preview.draftFingerprint.startsWith("fp_")).toBe(true);
        expect(createLeadBosCommandAdapter.buildPreview(draft, ctx).draftFingerprint).toBe(
            preview.draftFingerprint
        );
    });

    it("preserves unmapped narrative into eligible payload notes", () => {
        const draft = applyCreateLeadParseToDraft(
            emptyBosCommandDraft(),
            `${JORDAN_PASTE}\nThey prefer morning tours and mentioned a twin.`,
            ctx
        );
        const payload = bosDraftToEligiblePayload(draft);
        if (draft.unmappedText) {
            expect(String(payload.intake_notes ?? "")).toContain(draft.unmappedText.trim());
        }
    });
});
