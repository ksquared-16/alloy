import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("work unit page registry modal host wiring", () => {
    it("mounts relationship modal host and passes rail callbacks", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("useWorkUnitRegistryModals");
        expect(page).toContain("openRelationshipAction");
        expect(page).toContain("openEnrollmentStatus");
        expect(page).toContain("workUnitRegistryModals");
        expect(page).toContain('surface: "right_rail"');
    });
});

function relationshipAction(key: string): ResolvedActionForClient {
    return {
        key,
        label: key,
        description: null,
        action_type: "open_form",
        icon: null,
        style: null,
        display_style: "button",
        payload: { intent: "relationship_action", relationship_action_key: key },
        workflow_id: null,
    };
}

describe("work unit registry modal hosts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("right_rail add_emergency_contact opens relationship modal host when record selected", async () => {
        const openRelationshipAction = vi.fn();
        const action = relationshipAction("add_emergency_contact");
        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openRelationshipAction,
            entityId: "opp-1",
            context: { surface: "right_rail", department_id: "dept-1", work_unit_id: "wu-1" },
        });
        expect(out.ok).toBe(true);
        expect(openRelationshipAction).toHaveBeenCalledWith(
            expect.objectContaining({
                actionKey: "add_emergency_contact",
                opportunityId: "opp-1",
            }),
        );
    });

    it("right_rail add_parent_guardian opens relationship modal host", async () => {
        const openRelationshipAction = vi.fn();
        const action = relationshipAction("add_parent_guardian");
        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openRelationshipAction,
            entityId: "opp-2",
            context: { surface: "right_rail" },
        });
        expect(out.ok).toBe(true);
        expect(openRelationshipAction).toHaveBeenCalledWith(
            expect.objectContaining({ actionKey: "add_parent_guardian", opportunityId: "opp-2" }),
        );
    });

    it("right_rail add_child opens relationship modal host", async () => {
        const openRelationshipAction = vi.fn();
        const action = relationshipAction("add_child");
        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openRelationshipAction,
            entityId: "opp-3",
            context: { surface: "right_rail" },
        });
        expect(out.ok).toBe(true);
        expect(openRelationshipAction).toHaveBeenCalledWith(
            expect.objectContaining({ actionKey: "add_child", opportunityId: "opp-3" }),
        );
    });

    it("right_rail update_enrollment_status opens enrollment modal host", async () => {
        const openEnrollmentStatus = vi.fn();
        const action: ResolvedActionForClient = {
            key: "update_enrollment_status",
            label: "Change enrollment status",
            description: null,
            action_type: "open_form",
            icon: null,
            style: null,
            display_style: "button",
            payload: { form_key: "update_enrollment_status" },
            workflow_id: null,
        };
        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openEnrollmentStatus,
            entityId: "opp-4",
            enrollmentStatusScope: { grain: "child", opportunityId: "opp-4", opportunityCustomerMemberId: "ocm-1" },
            context: { surface: "right_rail" },
        });
        expect(out.ok).toBe(true);
        expect(openEnrollmentStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunityId: "opp-4",
                initialScope: expect.objectContaining({ opportunityCustomerMemberId: "ocm-1" }),
            }),
        );
    });

    it("relationship action without entity returns Select a record first", async () => {
        const openRelationshipAction = vi.fn();
        const action = relationshipAction("add_emergency_contact");
        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openRelationshipAction,
            context: { surface: "right_rail" },
        });
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.error).toBe("Select a record first.");
        expect(openRelationshipAction).not.toHaveBeenCalled();
    });

    it("make_primary_contact without contact target returns disabled reason", async () => {
        const action: ResolvedActionForClient = {
            key: "make_primary_contact",
            label: "Make Primary Contact",
            description: null,
            action_type: "open_form",
            icon: null,
            style: null,
            display_style: "button",
            payload: {},
            workflow_id: null,
        };
        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            entityId: "opp-1",
            context: { surface: "record_header" },
        });
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.error).toBe("Select a contact first to make them primary.");
    });

    it("make_primary_contact with host and target person succeeds", async () => {
        const openMakePrimaryContact = vi.fn();
        const action: ResolvedActionForClient = {
            key: "make_primary_contact",
            label: "Make Primary Contact",
            description: null,
            action_type: "open_form",
            icon: null,
            style: null,
            display_style: "button",
            payload: {},
            workflow_id: null,
        };
        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openMakePrimaryContact,
            entityId: "opp-1",
            makePrimaryContactTargetPersonId: "person-kevin",
            context: { surface: "record_header" },
        });
        expect(out.ok).toBe(true);
        expect(openMakePrimaryContact).toHaveBeenCalledWith({
            opportunityId: "opp-1",
            targetPersonId: "person-kevin",
        });
    });
});
