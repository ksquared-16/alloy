import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { enrichResolvedActionForClient } from "@/lib/admin/actions/enrichResolvedActionWithCanonical";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    dispatchOpenRelationshipActionModal,
    resolveRelationshipActionKeyFromResolvedAction,
} from "@/lib/admin/relationship/relationshipActionClient";
import { bosProposalToExecutionRequest } from "@/lib/admin/relationship/relationshipActionBosAdapter";
import { parseBosRelationshipActionPrompt } from "@/lib/admin/relationship/relationshipActionBosAdapter";

vi.mock("@/lib/admin/relationship/relationshipActionClient", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/relationship/relationshipActionClient")>();
    return {
        ...actual,
        dispatchOpenRelationshipActionModal: vi.fn(),
    };
});

function relationshipAction(overrides: Partial<ResolvedActionForClient> = {}): ResolvedActionForClient {
    return {
        key: "add_emergency_contact",
        label: "Add Emergency Contact",
        description: "Add emergency contact",
        action_type: "ui_intent",
        icon: null,
        style: null,
        display_style: "button",
        payload: {
            intent: "relationship_action",
            relationship_action_key: "add_emergency_contact",
            confirmation_required: true,
        },
        workflow_id: null,
        canonical: {
            executor_kind: "relationship_execute",
            input_schema: "relationship_wizard",
            runtime_wired: true,
            confirmation_policy: "required",
            category: "relationship",
            bos_proposal_support: true,
        },
        ...overrides,
    };
}

describe("applyRegistryResolvedActionClient relationship actions", () => {
    beforeEach(() => {
        vi.mocked(dispatchOpenRelationshipActionModal).mockClear();
    });

    it("opens relationship wizard for add_emergency_contact from top-right Actions", async () => {
        const openRelationshipAction = vi.fn();
        const out = await applyRegistryResolvedActionClient(relationshipAction(), {
            router: { push: vi.fn(), refresh: vi.fn() },
            openDrawer: vi.fn(),
            openRelationshipAction,
            entityId: "opp-1",
            context: { surface: "record_header" },
        });
        expect(out.ok).toBe(true);
        expect(openRelationshipAction).toHaveBeenCalledWith({
            actionKey: "add_emergency_contact",
            opportunityId: "opp-1",
            sourceSurface: "opportunity_drawer",
        });
    });

    it("dispatches modal event when host callback is missing", async () => {
        const out = await applyRegistryResolvedActionClient(relationshipAction(), {
            router: { push: vi.fn(), refresh: vi.fn() },
            openDrawer: vi.fn(),
            entityId: "opp-2",
            context: { surface: "work_unit" },
        });
        expect(out.ok).toBe(true);
        expect(dispatchOpenRelationshipActionModal).toHaveBeenCalledWith({
            action_key: "add_emergency_contact",
            opportunity_id: "opp-2",
            source_surface: "opportunity_drawer",
        });
    });

    it("routes add_child canonical key to relationship wizard (not legacy inquiry modal)", async () => {
        const openRelationshipAction = vi.fn();
        const openAddInquiryChild = vi.fn();
        const action = relationshipAction({
            key: "add_child",
            label: "Add Child",
            payload: {
                intent: "relationship_action",
                relationship_action_key: "add_child",
            },
        });
        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            openDrawer: vi.fn(),
            openRelationshipAction,
            openAddInquiryChild,
            entityId: "opp-1",
            context: { surface: "record_header" },
        });
        expect(out.ok).toBe(true);
        expect(openRelationshipAction).toHaveBeenCalledWith({
            actionKey: "add_child",
            opportunityId: "opp-1",
            sourceSurface: "opportunity_drawer",
        });
        expect(openAddInquiryChild).not.toHaveBeenCalled();
    });

    it("requires entity id for relationship actions", async () => {
        const out = await applyRegistryResolvedActionClient(relationshipAction(), {
            router: { push: vi.fn(), refresh: vi.fn() },
            openDrawer: vi.fn(),
            context: { surface: "work_unit" },
        });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.error).toMatch(/select a record/i);
    });

    // Renamed from "falls back safely for unknown action keys". It asserted
    // ok === true together with "no fetch was issued" — i.e. success reported
    // without anything executing. That is not safe: it is how send_tour_invitation
    // told operators an invitation had gone out while creating no invitation, no
    // message and no event. The no-request assertion is kept; the success claim
    // is inverted, because an unrunnable command must say so.
    it("refuses unknown action keys instead of reporting success", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const action: ResolvedActionForClient = {
            key: "unknown_custom_action",
            label: "Custom",
            description: null,
            action_type: "ui_intent",
            icon: null,
            style: null,
            display_style: "button",
            payload: { intent: "custom_stub" },
            workflow_id: null,
        };
        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            openDrawer: vi.fn(),
            entityId: "opp-1",
            context: { surface: "record_header" },
        });
        expect(out.ok).toBe(false);
        expect(resolveRelationshipActionKeyFromResolvedAction(action)).toBeNull();
        // Still no request — the command genuinely cannot run. What changed is
        // that it now admits that rather than claiming completion.
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });
});

describe("enrichResolvedActionForClient", () => {
    it("adds canonical metadata for relationship keys", () => {
        const enriched = enrichResolvedActionForClient({
            key: "add_emergency_contact",
            label: "DB label",
            description: null,
            action_type: "ui_intent",
            icon: null,
            style: null,
            display_style: "button",
            payload: {},
            workflow_id: null,
        });
        expect(enriched.canonical?.executor_kind).toBe("relationship_execute");
        expect(enriched.canonical?.input_schema).toBe("relationship_wizard");
        expect(enriched.label).toBe("DB label");
    });
});

describe("BOS proposal adapter", () => {
    it("maps to same execution request schema with confirmation", () => {
        const parsed = parseBosRelationshipActionPrompt("Add Grandma Susan as emergency contact for Billie.");
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const request = bosProposalToExecutionRequest({
            ...parsed.proposal,
            sourceCustomerId: "cust-1",
            sourceRecordId: "child-1",
        });
        expect(request.actionKey).toBe("add_emergency_contact");
        expect(request.confirmationRequired).toBe(true);
    });
});
