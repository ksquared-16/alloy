import { describe, expect, it } from "vitest";

import {
    assertNarrowWorkflowAssistEditPatch,
    buildWorkflowAssistEditDescriptionProposeBody,
    buildWorkflowAssistEditRenameProposeBody,
    buildWorkflowAssistPauseProposeBody,
    workflowAssistRenameFallbackName,
} from "@/lib/agent/workflowAssist/workflowAssistEditFromReadV1";
import { parseWorkflowAssistProposeRequest } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";

describe("workflowAssistEditFromReadV1", () => {
    const wfId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    it("builds rename and description propose bodies", () => {
        expect(buildWorkflowAssistEditRenameProposeBody({ workflow_id: wfId, proposed_name: "New name" })).toEqual({
            version: 1,
            proposal_kind: "edit_workflow",
            workflow_id: wfId,
            patch: { name: "New name" },
        });
        expect(
            buildWorkflowAssistEditDescriptionProposeBody({ workflow_id: wfId, proposed_description: "Note" })
        ).toMatchObject({
            proposal_kind: "edit_workflow",
            patch: { description: "Note" },
        });
        expect(buildWorkflowAssistPauseProposeBody(wfId).proposal_kind).toBe("pause_workflow");
    });

    it("rejects enable and trigger fields in narrow assert", () => {
        expect(assertNarrowWorkflowAssistEditPatch({ enabled: true })).toMatchObject({ ok: false });
        expect(assertNarrowWorkflowAssistEditPatch({ event_type: "x" })).toMatchObject({ ok: false });
        expect(assertNarrowWorkflowAssistEditPatch({ name: "x" })).toEqual({ ok: true });
    });

    it("parse rejects enabling via edit patch", () => {
        const parsed = parseWorkflowAssistProposeRequest({
            version: 1,
            proposal_kind: "edit_workflow",
            workflow_id: wfId,
            patch: { enabled: true },
        });
        expect(parsed.ok).toBe(false);
        if (!parsed.ok) expect(parsed.error).toBe("UNSUPPORTED_ENABLED");
    });

    it("rename fallback adds review suffix once", () => {
        expect(workflowAssistRenameFallbackName("Tour")).toBe("Tour (review)");
        expect(workflowAssistRenameFallbackName("Tour (review)")).toBe("Tour (review)");
    });
});
