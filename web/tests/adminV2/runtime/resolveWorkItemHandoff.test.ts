/**
 * Current Work checklist handoff — Communications / Activity / composer fallbacks.
 */

import { describe, expect, it, vi } from "vitest";

import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { CurrentWorkChecklistItem } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import { resolveWorkItemHandoff } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveWorkItemHandoff";

function composerAction(): ResolvedActionForClient {
    return {
        key: "send_email",
        label: "Send email",
        description: null,
        action_type: "workflow",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    };
}

function contactFamilyItem(): CurrentWorkChecklistItem {
    return {
        id: "contact_family",
        label: "Contact Family",
        description: null,
        state: "open",
        ownerCard: "communications",
        ownerFocus: null,
        handoffKind: "outreach",
    };
}

function baseCoordination(
    partial: Partial<FocusPanelCoordination> = {},
): FocusPanelCoordination {
    return {
        focusTargets: new Set(["current_work", "household"]),
        request: null,
        requestFocus: vi.fn(),
        activeDepth: null,
        reportPerspective: vi.fn(),
        dismissed: null,
        dismiss: vi.fn(),
        previousFocus: null,
        back: vi.fn(),
        ...partial,
    };
}

describe("resolveWorkItemHandoff — Contact Family", () => {
    it("opens Communications Focus when the card is on the panel", () => {
        const plan = resolveWorkItemHandoff(
            contactFamilyItem(),
            baseCoordination({
                focusTargets: new Set(["communications", "current_work"]),
            }),
        );
        expect(plan).toEqual({ kind: "focus", card: "communications", focus: null });
    });

    it("opens Activity when Communications is absent but mode switch exists", () => {
        const openMode = vi.fn();
        const plan = resolveWorkItemHandoff(
            contactFamilyItem(),
            baseCoordination({ openFocusPanelMode: openMode }),
        );
        expect(plan).toEqual({ kind: "activity" });
    });

    it("invokes header composer action when Activity is unavailable", () => {
        const plan = resolveWorkItemHandoff(
            contactFamilyItem(),
            baseCoordination({
                resolveCommunicationsComposerAction: () => composerAction(),
                invokeHeaderAction: vi.fn(),
            }),
        );
        expect(plan).toEqual({ kind: "header_action" });
    });

    it("returns blocked with helpful copy — never Communications-not-on-panel", () => {
        const plan = resolveWorkItemHandoff(contactFamilyItem(), baseCoordination());
        expect(plan?.kind).toBe("blocked");
        expect(plan && "message" in plan ? plan.message : "").not.toContain(
            "Communications is not on this panel",
        );
        expect(plan && "message" in plan ? plan.message : "").toMatch(/communications/i);
    });
});
