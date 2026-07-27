import { describe, expect, it } from "vitest";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import {
    applyFormValuesToDraft,
    applyOperatorFieldEdit,
    applyParseResult,
    bosDraftToEligiblePayload,
    confirmBosDraftField,
    createBosCommandSession,
    emptyBosCommandDraft,
    formValuesFromDraft,
    reduceBosCommandSession,
    removeInferredBosDraftField,
    revalidateCreateLeadDraft,
    type BosCommandInvocation,
    type CreateLeadAdapterContext,
} from "@/lib/bos/commandSession";

const INVOCATION: BosCommandInvocation = {
    actionKey: "create_lead",
    displayLabel: "Create Lead",
    placement: "work_unit_actions",
    contextResolution: "bos_proposal",
    workspace: { departmentId: "dept-1", workUnitId: "wu-1", surface: "work_unit" },
};

const ctx: CreateLeadAdapterContext = {
    departmentId: "dept-1",
    workUnitId: "wu-1",
    spec: createLeadParserSpec("dept-1"),
};

const PASTE = ["Jordan Lee", "jordan.lee@test.com", "1231231234"].join("\n");

describe("shared draft mode sync (scenarios 10–12)", () => {
    it("Conversation → Form → Conversation preserves state (scenario 10)", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        let draft = applyParseResult(emptyBosCommandDraft(), PASTE, ctx);
        session = reduceBosCommandSession(session, { type: "SET_DRAFT", draft });
        session = reduceBosCommandSession(session, { type: "SET_MODE", mode: "form" });

        const formValues = formValuesFromDraft(session.draft);
        expect(formValues.first_name).toBe("Jordan");
        formValues.phone = "9999999999";
        draft = applyFormValuesToDraft(session.draft, { phone: "9999999999" });
        session = reduceBosCommandSession(session, { type: "SET_DRAFT", draft });
        session = reduceBosCommandSession(session, { type: "SET_MODE", mode: "conversation" });

        expect(session.mode).toBe("conversation");
        expect(session.draft.values.find((v) => v.fieldKey === "first_name")?.value).toBe("Jordan");
        expect(session.draft.values.find((v) => v.fieldKey === "phone")?.value).toBe("9999999999");
        expect(session.draft.values.find((v) => v.fieldKey === "phone")?.state).toBe("operator_entered");
    });

    it("operator corrects a parsed value (scenario 11)", () => {
        let draft = applyParseResult(emptyBosCommandDraft(), PASTE, ctx);
        expect(draft.values.find((v) => v.fieldKey === "first_name")?.state).toBe("parsed_from_source");
        draft = applyOperatorFieldEdit(draft, "first_name", "Jordyn");
        const entry = draft.values.find((v) => v.fieldKey === "first_name");
        expect(entry?.value).toBe("Jordyn");
        expect(entry?.state).toBe("operator_entered");
        expect(entry?.evidence.some((e) => e.kind === "operator_edit")).toBe(true);
        // Subsequent parse must not clobber operator edit
        draft = applyParseResult(draft, PASTE, ctx);
        expect(draft.values.find((v) => v.fieldKey === "first_name")?.value).toBe("Jordyn");
        expect(draft.values.find((v) => v.fieldKey === "first_name")?.state).toBe("operator_entered");
    });

    it("operator removes an inferred value (scenario 12)", () => {
        let draft = emptyBosCommandDraft();
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
        draft = removeInferredBosDraftField(draft, "email");
        expect(draft.values.find((v) => v.fieldKey === "email")).toBeUndefined();
        const resolution = revalidateCreateLeadDraft(draft, ctx);
        expect(resolution.readyToExecute).toBe(false);
        expect(bosDraftToEligiblePayload(draft).email).toBeUndefined();
    });

    it("confirming inferred email satisfies eligibility", () => {
        let draft = emptyBosCommandDraft();
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
            },
            {
                fieldKey: "location_id",
                value: "site-1",
                state: "operator_entered",
                evidence: [],
                optionResolved: true,
            }
        );
        expect(revalidateCreateLeadDraft(draft, ctx).readyToExecute).toBe(false);
        draft = confirmBosDraftField(draft, "email");
        expect(draft.values.find((v) => v.fieldKey === "email")?.state).toBe("confirmed");
        expect(revalidateCreateLeadDraft(draft, ctx).readyToExecute).toBe(true);
    });
});
